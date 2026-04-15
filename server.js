'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

// ── Room store ─────────────────────────────────────────
// rooms: Map<roomName, RoomState>
const rooms = new Map();

const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 1 month

function getOrCreateRoom(name) {
  if (!rooms.has(name)) {
    rooms.set(name, {
      participants: [],
      cardsRevealed: false,
      timerDuration: 90,
      timerRemaining: 90,
      timerRunning: false,
      jiraUrl: '',
      timerInterval: null,
      lastActivity: Date.now(),
    });
  }
  const room = rooms.get(name);
  room.lastActivity = Date.now();
  return room;
}

// Sweep idle rooms every hour
setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [name, room] of rooms) {
    if (room.lastActivity < cutoff) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      rooms.delete(name);
      console.log(`[rooms] deleted idle room "${name}"`);
    }
  }
}, 60 * 60 * 1000);

// ── Helpers ────────────────────────────────────────────

function snapshot(room) {
  return {
    participants: room.participants.map(p => ({ ...p })),
    cardsRevealed: room.cardsRevealed,
    timerDuration: room.timerDuration,
    timerRemaining: room.timerRemaining,
    timerRunning: room.timerRunning,
    jiraUrl: room.jiraUrl,
  };
}

/** Send to every client connected to a given room */
function broadcastRoom(roomName, msg) {
  const raw = JSON.stringify(msg);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1 && ws.roomName === roomName) {
      ws.send(raw);
    }
  });
}

function startTimer(room, roomName) {
  if (room.timerInterval || room.timerRemaining <= 0) return;
  room.timerRunning = true;
  broadcastRoom(roomName, { type: 'state', data: snapshot(room) });

  room.timerInterval = setInterval(() => {
    room.lastActivity = Date.now();
    room.timerRemaining = Math.max(0, room.timerRemaining - 1);

    if (room.timerRemaining === 0) {
      room.timerRunning = false;
      clearInterval(room.timerInterval);
      room.timerInterval = null;
      broadcastRoom(roomName, { type: 'timerEnd', data: snapshot(room) });
    } else {
      broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
    }
  }, 1000);
}

function stopTimer(room) {
  room.timerRunning = false;
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

// ── HTTP + WebSocket server ────────────────────────────

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  const summary = [...rooms.entries()].map(([n, r]) => ({
    room: n,
    participants: r.participants.length,
    lastActivity: new Date(r.lastActivity).toISOString(),
  }));
  res.end(JSON.stringify({ rooms: summary }));
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  // ws.roomName and ws.participantName set after 'join'
  ws.roomName        = null;
  ws.participantName = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // Every message must carry a roomName after joining; normalise to lower-case
    const roomName = String(msg.room ?? ws.roomName ?? '').trim().toLowerCase().slice(0, 64);

    switch (msg.type) {

      case 'join': {
        const participantName = String(msg.name ?? '').trim().slice(0, 64);
        const isSM = Boolean(msg.isSM);
        if (!participantName || !roomName) break;

        ws.roomName        = roomName;
        ws.participantName = participantName;

        const room = getOrCreateRoom(roomName);
        const existing = room.participants.find(p => p.name === participantName);
        if (existing) {
          existing.isSM = existing.isSM || isSM; // keep SM flag if already set
        } else {
          room.participants.push({ name: participantName, voted: false, value: null, isSM });
        }

        ws.send(JSON.stringify({ type: 'state', data: snapshot(room) }));
        broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        console.log(`[${roomName}] "${participantName}" joined (${room.participants.length} total)`);
        break;
      }

      case 'vote': {
        const room = rooms.get(roomName);
        if (!room) break;
        const p = room.participants.find(p => p.name === ws.participantName);
        if (p && !room.cardsRevealed) {
          p.voted = true;
          p.value = String(msg.value ?? '');
          room.lastActivity = Date.now();
          broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        }
        break;
      }

      case 'reveal': {
        const room = rooms.get(roomName);
        if (!room) break;
        room.cardsRevealed = true;
        room.lastActivity  = Date.now();
        stopTimer(room);
        broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        break;
      }

      case 'newRound': {
        const room = rooms.get(roomName);
        if (!room) break;
        room.cardsRevealed = false;
        room.participants.forEach(p => { p.voted = false; p.value = null; });
        stopTimer(room);
        room.timerRemaining = room.timerDuration;
        room.lastActivity   = Date.now();
        broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        break;
      }

      case 'startTimer': {
        const room = rooms.get(roomName);
        if (room) startTimer(room, roomName);
        break;
      }

      case 'pauseTimer': {
        const room = rooms.get(roomName);
        if (room) { stopTimer(room); broadcastRoom(roomName, { type: 'state', data: snapshot(room) }); }
        break;
      }

      case 'resetTimer': {
        const room = rooms.get(roomName);
        if (room) {
          stopTimer(room);
          room.timerRemaining = room.timerDuration;
          broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        }
        break;
      }

      case 'setDuration': {
        const room = rooms.get(roomName);
        const v = Number(msg.value);
        if (room && v > 0) {
          room.timerDuration  = v;
          stopTimer(room);
          room.timerRemaining = v;
          broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        }
        break;
      }

      case 'setJiraUrl': {
        const room = rooms.get(roomName);
        if (room) {
          room.jiraUrl       = String(msg.url ?? '').trim();
          room.lastActivity  = Date.now();
          broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        }
        break;
      }

      case 'leave': {
        const room = rooms.get(roomName);
        if (room && ws.participantName) {
          room.participants = room.participants.filter(p => p.name !== ws.participantName);
          ws.participantName = null;
          ws.roomName        = null;
          broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    // Disconnect only; participant stays in room to survive refreshes.
    // Explicit 'leave' message is required to remove from the session.
  });

  ws.on('error', err => console.error('[ws error]', err.message));
});

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  console.log(`Scrum Poker server  →  ws://localhost:${PORT}/ws`);
  console.log(`Room status         →  http://localhost:${PORT}/`);
});

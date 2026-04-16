'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

// ── Room store ─────────────────────────────────────────
// rooms: Map<roomName, RoomState>
const rooms = new Map();

const ROOM_TTL_MS       = 10 * 60 * 1000; // 10 minutes idle → sweep
const ROOM_EMPTY_TTL_MS = 30_000;           // destroy room 30 s after last participant leaves

// emptyRoomTimers: Map<roomName, TimeoutHandle>
const emptyRoomTimers = new Map();

function cancelEmptyRoomTimer(roomName) {
  if (emptyRoomTimers.has(roomName)) {
    clearTimeout(emptyRoomTimers.get(roomName));
    emptyRoomTimers.delete(roomName);
  }
}

function checkAndScheduleEmptyRoom(roomName) {
  const room = rooms.get(roomName);
  if (!room) return;
  const anyOnline = room.participants.some(p => p.online !== false);
  if (anyOnline) {
    cancelEmptyRoomTimer(roomName); // someone is still online — no need for a timer
    return;
  }
  if (emptyRoomTimers.has(roomName)) return; // already scheduled
  const handle = setTimeout(() => {
    emptyRoomTimers.delete(roomName);
    const r = rooms.get(roomName);
    if (!r) return;
    // Double-check nobody reconnected
    if (r.participants.some(p => p.online !== false)) return;
    if (r.timerInterval) clearInterval(r.timerInterval);
    rooms.delete(roomName);
    console.log(`[${roomName}] destroyed — all participants offline for ${ROOM_EMPTY_TTL_MS / 1000}s`);
  }, ROOM_EMPTY_TTL_MS);
  emptyRoomTimers.set(roomName, handle);
  console.log(`[${roomName}] all offline — will destroy in ${ROOM_EMPTY_TTL_MS / 1000}s if no reconnect`);
}

function getOrCreateRoom(name) {
  if (!rooms.has(name)) {
    rooms.set(name, {
      participants: [],
      cardsRevealed: false,
      timerDuration: 90,
      timerRemaining: 90,
      timerRunning: false,
      jiraUrl: '',
      missCount: {},      // { [participantName]: number }
      createdBy: '',
      createdAt: Date.now(),
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
    participants: room.participants.map(p => ({ name: p.name, voted: p.voted, value: p.value, isSM: p.isSM, avatar: p.avatar ?? '', online: p.online !== false })),
    cardsRevealed: room.cardsRevealed,
    timerDuration: room.timerDuration,
    timerRemaining: room.timerRemaining,
    timerRunning: room.timerRunning,
    jiraUrl: room.jiraUrl,
    missCount: { ...room.missCount },
    createdBy: room.createdBy,
    createdAt: room.createdAt,
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
      // Tally missed deadlines for non-voters
      room.participants.forEach(p => {
        if (!p.voted && !p.isSM) {
          room.missCount[p.name] = (room.missCount[p.name] ?? 0) + 1;
        }
      });
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

        // Reject if another active connection already holds this name in the room
        const takenByOther = [...wss.clients].some(
          c => c !== ws && c.readyState === 1 &&
               c.roomName === roomName && c.participantName === participantName
        );
        if (takenByOther) {
          ws.send(JSON.stringify({ type: 'error', code: 'NAME_TAKEN', name: participantName }));
          break;
        }

        // Reject if room already has an active SM and this join requests SM role
        if (isSM) {
          const room0 = rooms.get(roomName);
          const smClient = room0 && [...wss.clients].find(
            c => c !== ws && c.readyState === 1 &&
                 c.roomName === roomName &&
                 room0.participants.find(p => p.name === c.participantName && p.isSM)
          );
          if (smClient) {
            ws.send(JSON.stringify({ type: 'error', code: 'SM_TAKEN', smName: smClient.participantName }));
            break;
          }
        }

        ws.roomName        = roomName;
        ws.participantName = participantName;

        // Cancel any pending room-destroy timer — someone is (re)joining
        cancelEmptyRoomTimer(roomName);

        const room = getOrCreateRoom(roomName);
        if (!room.createdBy) room.createdBy = participantName; // first joiner is the creator
        const avatar = typeof msg.avatar === 'string' && msg.avatar.startsWith('data:image/')
          ? msg.avatar.slice(0, 32_000)  // cap at ~32 KB
          : '';

        const existing = room.participants.find(p => p.name === participantName);
        if (existing) {
          existing.isSM   = existing.isSM || isSM;
          existing.online = true;
          if (avatar) existing.avatar = avatar;  // update avatar on reconnect
        } else {
          room.participants.push({ name: participantName, voted: false, value: null, isSM, avatar, online: true });
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

      case 'unvote': {
        const room = rooms.get(roomName);
        if (!room) break;
        const p = room.participants.find(p => p.name === ws.participantName);
        if (p && !room.cardsRevealed) {
          p.voted = false;
          p.value = null;
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

      case 'kick': {
        const room = rooms.get(roomName);
        const target = String(msg.target ?? '').trim();
        if (!room || !target || target === ws.participantName) break;

        // Tell the kicked client to log out immediately
        const targetWs = [...wss.clients].find(
          c => c.readyState === 1 && c.roomName === roomName && c.participantName === target
        );
        if (targetWs) {
          targetWs.send(JSON.stringify({ type: 'kicked' }));
          targetWs.participantName = null;
          targetWs.roomName = null;
        }

        room.participants = room.participants.filter(p => p.name !== target);
        room.lastActivity = Date.now();
        console.log(`[${roomName}] "${ws.participantName}" kicked "${target}"`);
        broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        checkAndScheduleEmptyRoom(roomName);
        break;
      }

      case 'leave': {
        const room = rooms.get(roomName);
        if (room && ws.participantName) {
          room.participants = room.participants.filter(p => p.name !== ws.participantName);
          ws.participantName = null;
          ws.roomName        = null;
          broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
          checkAndScheduleEmptyRoom(roomName);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const { roomName, participantName } = ws;
    if (!roomName || !participantName) return;

    // Mark participant offline — they stay in the room indefinitely until they reconnect
    const room = rooms.get(roomName);
    if (room) {
      const p = room.participants.find(p => p.name === participantName);
      if (p) {
        p.online = false;
        broadcastRoom(roomName, { type: 'state', data: snapshot(room) });
        console.log(`[${roomName}] "${participantName}" disconnected — marked offline`);
      }
      checkAndScheduleEmptyRoom(roomName);
    }
  });

  ws.on('error', err => console.error('[ws error]', err.message));
});

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  console.log(`Scrum Poker server  →  ws://localhost:${PORT}/ws`);
  console.log(`Room status         →  http://localhost:${PORT}/`);
});

import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';

export interface Participant {
  name: string;
  voted: boolean;
  value: string | null;
  isSM: boolean;
}

interface ServerState {
  participants: Participant[];
  cardsRevealed: boolean;
  timerDuration: number;
  timerRemaining: number;
  timerRunning: boolean;
  jiraUrl: string;
  missCount: Record<string, number>;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatToolbarModule, MatCardModule, MatButtonModule,
    MatInputModule, MatFormFieldModule, MatIconModule,
    MatTooltipModule, MatSnackBarModule, MatSelectModule, MatCheckboxModule,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {

  readonly FIBONACCI_CARDS = ['1', '2', '3', '5', '8', '13', '21', '?', '☕'];
  readonly TIMER_OPTIONS = [
    { label: '30 s',  value: 30 },
    { label: '1 min', value: 60 },
    { label: '1:30',  value: 90 },
    { label: '2 min', value: 120 },
    { label: '3 min', value: 180 },
    { label: '5 min', value: 300 },
  ];

  // ── Registration (localStorage) ───────────────────────
  isRegistered  = false;
  registerName  = '';
  registerRoom  = '';
  registerAsSM  = false;
  userName      = '';
  roomName      = '';
  isScrumMaster = false;

  // ── UI state (mirrors server) ──────────────────────────
  participants:   Participant[] = [];
  cardsRevealed   = false;
  timerDuration   = 90;
  timerRemaining  = 90;
  timerRunning    = false;
  selectedCard:   string | null = null;

  // ── Registration error ────────────────────────────────
  registerError = '';

  // ── Layout ────────────────────────────────────────────
  private readonly COMPACT_H = 120;
  private _isExpanded = false;

  get isExpanded(): boolean { return this._isExpanded; }
  set isExpanded(v: boolean) {
    this._isExpanded = v;
    if (!v) this.snapCompact();
  }

  // ── Miss score ────────────────────────────────────────
  missCount: Record<string, number> = {};

  missEmoji(count: number): string {
    if (count >= 5) return '💀';
    if (count >= 3) return '😴';
    if (count >= 2) return '🐢';
    return '⏰';
  }

  // ── Jira ──────────────────────────────────────────────
  jiraUrl    = '';
  jiraLoaded = false;

  // ── Connection ────────────────────────────────────────
  connected = false;

  // ── Alert / beep state ────────────────────────────────
  nonVoterAlert  = false;
  private warningBeeped  = false;
  private destroying     = false;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private snackBar: MatSnackBar,
    private zone:     NgZone,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────

  ngOnInit(): void {
    window.addEventListener('resize', this.onWindowResize);
    this.snapCompact();

    const saved = localStorage.getItem('scrumPokerUser');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.userName      = data.name;
        this.roomName      = data.room  ?? '';
        this.isScrumMaster = data.isSM  ?? false;
        this.registerName  = data.name;   // pre-fill form for next time
        this.registerRoom  = data.room  ?? '';
        this.isRegistered  = !!(data.name && data.room);
      } catch {
        localStorage.removeItem('scrumPokerUser');
      }
    }
    this.connectWS();
  }

  ngOnDestroy(): void {
    this.destroying = true;
    this.clearReconnect();
    this.ws?.close();
    window.removeEventListener('resize', this.onWindowResize);
  }

  // ── WebSocket ─────────────────────────────────────────

  private connectWS(): void {
    const url = `ws://${location.host}/ws`;
    const ws  = new WebSocket(url);
    this.ws   = ws;

    ws.onopen = () => {
      this.zone.run(() => {
        this.connected = true;
        if (this.isRegistered) {
          this.send({ type: 'join', room: this.roomName, name: this.userName, isSM: this.isScrumMaster });
        }
      });
    };

    ws.onmessage = ({ data }) => {
      this.zone.run(() => {
        const msg = JSON.parse(data);
        if (msg.type === 'state')    this.applyState(msg.data);
        if (msg.type === 'timerEnd') { this.applyState(msg.data); this.onTimerEnd(); }
        if (msg.type === 'kicked') {
          // Server already removed us — just clear local state without sending 'leave'
          localStorage.removeItem('scrumPokerUser');
          this.isRegistered  = false;
          this.userName      = '';
          this.roomName      = '';
          this.isScrumMaster = false;
          this.registerAsSM  = false;
          this.selectedCard  = null;
          this.snackBar.open('You have been removed from the session.', 'OK',
            { duration: 6000, panelClass: 'snack-warn' });
        }
        if (msg.type === 'error' && msg.code === 'NAME_TAKEN') {
          this.isRegistered  = false;
          this.registerError = `"${msg.name}" is already in this room. Choose a different name.`;
        }
        if (msg.type === 'error' && msg.code === 'SM_TAKEN') {
          this.isRegistered  = false;
          this.registerError = `${msg.smName} is already the Scrum Master in this room.`;
        }
      });
    };

    ws.onclose = () => {
      this.zone.run(() => {
        this.connected = false;
        if (!this.destroying) {
          this.reconnectTimer = setTimeout(() => this.connectWS(), 2000);
        }
      });
    };

    ws.onerror = () => ws.close();
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Always include the room so the server knows which room to target
      this.ws.send(JSON.stringify({ room: this.roomName, ...msg }));
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── State from server ─────────────────────────────────

  private applyState(s: ServerState): void {
    const prevRemaining = this.timerRemaining;

    this.participants  = s.participants;
    this.cardsRevealed = s.cardsRevealed;
    this.missCount     = s.missCount ?? {};
    this.timerDuration = s.timerDuration;
    this.timerRemaining = s.timerRemaining;
    this.timerRunning   = s.timerRunning;

    // Restore own vote from server (survives page reload)
    const me = s.participants.find(p => p.name === this.userName);
    this.selectedCard = me?.voted ? (me.value ?? null) : null;

    // Reset warning flag when timer resets to full
    if (s.timerRemaining >= s.timerDuration - 1) {
      this.warningBeeped = false;
    }

    // Beep at 10 s warning
    if (s.timerRemaining === 10 && prevRemaining > 10 && !this.warningBeeped) {
      this.warningBeeped = true;
      this.beep(660, 0.18, 0.2);
    }

    // Jira URL sync — all clients follow what SM sets
    if (s.jiraUrl !== this.jiraUrl || (s.jiraUrl && !this.jiraLoaded)) {
      this.jiraUrl    = s.jiraUrl;
      this.jiraLoaded = !!s.jiraUrl;
    }
  }

  private onTimerEnd(): void {
    const missing = this.participants.filter(p => !p.voted).map(p => p.name);
    const iAmMissing = missing.includes(this.userName);

    // Beep + snackbar only for participants who haven't voted yet
    if (iAmMissing) {
      this.beep(440, 0.7, 0.3);
      this.snackBar.open(`Time's up — please cast your vote!`, 'OK',
        { duration: 6000, panelClass: 'snack-warn' });
    }

    // Pulsing red border on non-voter cards is visible to everyone (team awareness)
    if (missing.length) {
      this.nonVoterAlert = true;
      setTimeout(() => { this.nonVoterAlert = false; }, 3000);
    }
  }

  // ── Registration ──────────────────────────────────────

  register(): void {
    const name = this.registerName.trim();
    const room = this.registerRoom.trim();
    if (!name || !room) return;
    this.registerError = '';
    this.userName      = name;
    this.roomName      = room;
    this.isScrumMaster = this.registerAsSM;
    this.isRegistered  = true;
    localStorage.setItem('scrumPokerUser', JSON.stringify({ name, room, isSM: this.isScrumMaster }));
    this.send({ type: 'join', room, name, isSM: this.isScrumMaster });
  }

  logout(): void {
    this.send({ type: 'leave' });          // server removes participant immediately
    localStorage.removeItem('scrumPokerUser');
    this.isRegistered  = false;
    this.userName      = '';
    this.roomName      = '';
    this.isScrumMaster = false;
    this.registerAsSM  = false;
    this.selectedCard  = null;
    // keep registerName + registerRoom pre-filled for convenience
  }

  // ── Cards ─────────────────────────────────────────────

  selectCard(value: string): void {
    if (this.cardsRevealed) return;
    this.selectedCard = value;          // optimistic local update
    this.send({ type: 'vote', value });
  }

  kickParticipant(name: string): void {
    if (!confirm(`Remove "${name}" from the session?`)) return;
    this.send({ type: 'kick', target: name });
  }

  revealCards(): void { this.send({ type: 'reveal' }); }

  newRound(): void {
    this.nonVoterAlert = false;
    this.send({ type: 'newRound' });
  }

  get votedCount(): number { return this.participants.filter(p => p.voted).length; }

  get averageVote(): string {
    const nums = this.participants
      .filter(p => p.voted && p.value !== null && !isNaN(Number(p.value)))
      .map(p => Number(p.value));
    if (!nums.length) return '—';
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
  }

  // ── Timer ─────────────────────────────────────────────

  startTimer():  void { this.send({ type: 'startTimer' }); }
  pauseTimer():  void { this.send({ type: 'pauseTimer' }); }
  resetTimer():  void { this.send({ type: 'resetTimer' }); }
  onDurationChange(value: number): void { this.send({ type: 'setDuration', value }); }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  get timerPercent(): number {
    return this.timerDuration > 0 ? (this.timerRemaining / this.timerDuration) * 100 : 0;
  }

  get timerClass(): 'normal' | 'warning' | 'danger' {
    if (this.timerRemaining <= 10) return 'danger';
    if (this.timerRemaining <= 30) return 'warning';
    return 'normal';
  }

  // ── Jira ──────────────────────────────────────────────

  loadJira(): void {
    const url = this.jiraUrl.trim();
    if (!url) return;
    this.send({ type: 'setJiraUrl', url });
  }

  clearJira(): void {
    this.jiraUrl = '';
    this.send({ type: 'setJiraUrl', url: '' });
  }

  // ── Beep ──────────────────────────────────────────────

  private beep(freq = 440, duration = 0.3, volume = 0.2): void {
    try {
      const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx  = new Ctx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(); osc.stop(ctx.currentTime + duration);
    } catch { /* audio blocked */ }
  }

  // ── Window sizing (PWA standalone) ───────────────────

  private snapCompact(): void {
    window.resizeTo(window.outerWidth, this.COMPACT_H + (window.outerHeight - window.innerHeight));
  }

  private readonly onWindowResize = (): void => {
    if (!this._isExpanded) this.snapCompact();
  };
}

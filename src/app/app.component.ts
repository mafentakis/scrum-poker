import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { MatMenuModule } from '@angular/material/menu';

export interface Participant {
  name: string;
  voted: boolean;
  value: string | null;
  isSM: boolean;
  avatar?: string;
  online?: boolean;
}

interface ServerState {
  participants: Participant[];
  cardsRevealed: boolean;
  timerDuration: number;
  timerRemaining: number;
  timerRunning: boolean;
  jiraUrl: string;
  missCount: Record<string, number>;
  createdBy: string;
  createdAt: number;
}

const VOTE_MESSAGES = [
  'Sharp call! 🎯',       'No hesitation! ⚡',     'Decisive! 💪',
  'Committed! 📌',        'Mind made up! 🧠',       'Conviction! ✊',
  'Calibrated! ⚖️',       'Gut trusted! 🦊',        'Bold take! 🔥',
  'Locked in! 🔐',        "Cards don't lie! 🃏",    'Bet placed! 🎲',
  'Poker face! 😎',       'Point dropped! 📍',      'Ante up! 🃏',
  'Hand played! ♠️',      'All in! 🎰',             'Fibonacci moment! ✨',
  'Planning poker pro! 🏆','Sequence mastered! 🌀', 'Sprint fuel! ⛽',
  'Story sized! 📏',      'Sprint hero! 🦸',        'Velocity rising! 📈',
  'Story tamed! 🦁',      'Definition clear! 📋',   'Complexity felt! 💪',
  'Story mapped! 🗺️',     'Scope defined! 🔭',      'Ready to ship! 🚀',
  'Nice one! 🌟',         'Solid! 🪨',              'Perfect! ✅',
  'Outstanding! 🌠',      'Excellent! 🥇',          'Nailed it! 🔨',
  'On point! 🎯',         'Brilliant! 💡',          'Smooth! 🏄',
  'Flawless! 💎',         'Big brain activated! 🧠','Galaxy brain! 🌌',
  'Engineering vibes! 🔧','Pure science! 🔬',       'Magic numbers! 🪄',
  'Estimates fly! 🦋',    'Chaos contained! 🌀',    'Dragon slain! 🐉',
  'Complexity? Crushed! 💥','Easy money! 💰',        'Team player! 🤝',
  'Voice heard! 📣',      'Data point in! 📊',      'Opinion matters! 💬',
  'Contributing! 🏗️',     'Building consensus! 🤝', 'One step closer! 👣',
  'Stronger together! 🫂','Alignment unlocked! 🔗', 'Sprint shines! ☀️',
  'Boom! 💥',             'Bam! ✨',                'Yes! 🎉',
  'Done! ✔️',             'Voted! 🗳️',             'Locked! 🔒',
  'Stamped! 📮',          'Counted! 🧮',            'Registered! 📝',
  'Noted! 🫡',            'Trust the process! 🔄',  'Gut check done! ✔️',
  'Instinct activated! ⚡','Experience counts! 🧓',  'Wisdom shared! 🦉',
  'Thinking done! 💭',    'Nuance captured! 🎨',    'Effort estimated! ⏱️',
  'Work understood! 📚',  'Knowledge applied! 🎓',  'Fibonacci approved! 🌀',
  'Points secured! 🔒',   'Sprint unlocked! 🔑',    'Async aligned! 🔗',
  'No anchoring bias! ⚓', 'Independent view! 👁️',  'True estimate! 🏹',
  'Pure instinct! 🐺',    'Unbiased call! 🌱',      'Raw feeling! 🎸',
  'Sprint starts now! 🏁','Story lives! 📖',        'Progress made! ⬆️',
  'MVP energy! ⭐',        "That's planning! 📅",    'History written! 📜',
  'Future shaped! 🔮',    'Courage shown! 🦁',      'Risk assessed! 🛡️',
  'Value delivered! 🎁',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatToolbarModule, MatCardModule, MatButtonModule,
    MatInputModule, MatFormFieldModule, MatIconModule,
    MatTooltipModule, MatSnackBarModule, MatSelectModule, MatCheckboxModule, MatMenuModule,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  private static readonly DESKTOP_COMPACT_H = 120;
  private static readonly TOUCH_STACK_BREAKPOINT = 600;
  private static readonly NARROW_TOUCH_COMPACT_H = 208;

  readonly FIBONACCI_CARDS = ['1', '2', '3', '5', '8', '13', '21', '40', '100', '?', '☕'];
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
  registerAvatar = '';   // base64 JPEG picked at registration
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
  roomCreatedBy   = '';
  roomCreatedAt   = 0;

  // ── Registration error ────────────────────────────────
  registerError = '';

  // ── Layout ────────────────────────────────────────────
  layoutMode: 'desktop' | 'touch' = 'desktop';
  viewportWidth = window.innerWidth;

  private get COMPACT_H(): number {
    if (!this.isTouchLayout) return AppComponent.DESKTOP_COMPACT_H;
    return this.isNarrowTouchLayout
      ? AppComponent.NARROW_TOUCH_COMPACT_H
      : AppComponent.DESKTOP_COMPACT_H;
  }
  private _isExpanded = false;

  get isExpanded(): boolean { return this._isExpanded; }
  set isExpanded(v: boolean) {
    this._isExpanded = v;
    if (!v) this.snapCompact();
  }

  get isTouchLayout(): boolean {
    return this.layoutMode === 'touch';
  }

  get isNarrowTouchLayout(): boolean {
    return this.isTouchLayout && this.viewportWidth < AppComponent.TOUCH_STACK_BREAKPOINT;
  }

  get showDesktopParticipantNav(): boolean {
    return !this.isTouchLayout && this.chipsOverflow;
  }

  get showToolbarOverflow(): boolean {
    return this.isTouchLayout;
  }

  get orderedParticipants(): Participant[] {
    const myChip = this.participants.find((participant) => participant.name === this.userName);
    if (!myChip) return this.participants;
    return [myChip, ...this.participants.filter((participant) => participant.name !== this.userName)];
  }

  // ── Miss score ────────────────────────────────────────
  missCount: Record<string, number> = {};

  // ── Jira ──────────────────────────────────────────────
  jiraUrl    = '';
  jiraLoaded = false;

  // ── Vote reward float ─────────────────────────────────
  voteFloatMsg = '';
  private lastVoteFloatIdx = -1;
  private voteFloatTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Connection ────────────────────────────────────────
  connected = false;

  // ── Team chips scroll ─────────────────────────────────
  @ViewChild('chipsScroll') chipsScrollRef!: ElementRef<HTMLElement>;
  @ViewChild('voteFloat')  private voteFloatRef?: ElementRef<HTMLElement>;
  chipsAtStart   = true;
  chipsAtEnd     = false;
  chipsOverflow  = false;

  scrollChips(dir: -1 | 1): void {
    const el = this.chipsScrollRef?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: dir * 180, behavior: 'smooth' });
  }

  onChipsScroll(event: Event): void {
    const el = event.target as HTMLElement;
    this.chipsAtStart  = el.scrollLeft <= 0;
    this.chipsAtEnd    = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    this.chipsOverflow = el.scrollWidth > el.clientWidth;
  }

  private updateChipsScrollState(): void {
    const el = this.chipsScrollRef?.nativeElement;
    if (!el) return;
    this.chipsAtStart  = el.scrollLeft <= 0;
    this.chipsAtEnd    = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    this.chipsOverflow = el.scrollWidth > el.clientWidth;
  }

  // ── Alert / beep state ────────────────────────────────
  private updateResponsiveState(): void {
    this.viewportWidth = window.innerWidth;
    this.layoutMode = this.detectLayoutMode();
  }

  private detectLayoutMode(): 'desktop' | 'touch' {
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    const ua = nav.userAgent ?? '';
    const platform = nav.platform ?? '';
    const maxTouchPoints = nav.maxTouchPoints ?? 0;

    const isPhone =
      nav.userAgentData?.mobile === true ||
      /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile/i.test(ua);
    const isTablet =
      /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) ||
      (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
      (platform === 'MacIntel' && maxTouchPoints > 0);

    return isPhone || isTablet ? 'touch' : 'desktop';
  }

  nonVoterAlert    = false;
  postTimerElapsed = 0;   // counts up for 10 s after timer hits 0; 0 = inactive
  private warningBeeped    = false;
  private destroying       = false;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private postTimerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private snackBar: MatSnackBar,
    private zone:     NgZone,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────

  ngOnInit(): void {
    this.updateResponsiveState();
    window.addEventListener('resize', this.onWindowResize);
    this.snapCompact();

    // Pre-fill room from ?room= invite link
    const urlRoom = new URLSearchParams(location.search).get('room');
    if (urlRoom) this.registerRoom = urlRoom.trim().slice(0, 64);

    const saved = localStorage.getItem('scrumPokerUser');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.userName      = data.name;
        this.roomName      = data.room  ?? '';
        this.isScrumMaster = data.isSM  ?? false;
        this.registerName  = data.name;
        this.registerRoom  = data.room  ?? '';
        this.registerAvatar = localStorage.getItem('scrumPokerAvatar') ?? '';
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
    this.clearPostTimer();
    this.ws?.close();
    window.removeEventListener('resize', this.onWindowResize);
  }

  // ── WebSocket ─────────────────────────────────────────

  private connectWS(): void {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host}/ws`;
    const ws  = new WebSocket(url);
    this.ws   = ws;

    ws.onopen = () => {
      this.zone.run(() => {
        this.connected = true;
        if (this.isRegistered) {
          this.send({ type: 'join', room: this.roomName, name: this.userName, isSM: this.isScrumMaster, avatar: this.registerAvatar });
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

  private startPostTimer(): void {
    this.clearPostTimer();
    this.postTimerElapsed = 0;
    this.postTimerInterval = setInterval(() => {
      this.postTimerElapsed++;
      if (this.postTimerElapsed >= 10) this.clearPostTimer();
    }, 1000);
  }

  private clearPostTimer(): void {
    if (this.postTimerInterval !== null) {
      clearInterval(this.postTimerInterval);
      this.postTimerInterval = null;
    }
    this.postTimerElapsed = 0;
  }

  // ── State from server ─────────────────────────────────

  private applyState(s: ServerState): void {
    const prevRemaining = this.timerRemaining;

    this.participants  = s.participants;
    this.cardsRevealed = s.cardsRevealed;
    setTimeout(() => this.updateChipsScrollState());
    this.missCount     = s.missCount ?? {};
    this.timerDuration = s.timerDuration;
    this.timerRemaining = s.timerRemaining;
    this.timerRunning   = s.timerRunning;
    this.roomCreatedBy  = s.createdBy ?? '';
    this.roomCreatedAt  = s.createdAt ?? 0;

    // Restore own vote from server (survives page reload)
    const me = s.participants.find(p => p.name === this.userName);
    this.selectedCard = me?.voted ? (me.value ?? null) : null;

    // Reset warning flag when timer resets to full; also kill the post-timer overlay
    if (s.timerRemaining >= s.timerDuration - 1 || s.timerRunning) {
      this.warningBeeped = false;
      this.clearPostTimer();
    }

    // Beep at 10 s warning
    if (s.timerRemaining === 10 && prevRemaining > 10 && !this.warningBeeped && !this.isScrumMaster) {
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
    this.startPostTimer();
    const missing = this.participants.filter(p => !p.voted && !p.isSM).map(p => p.name);
    const iAmMissing = missing.includes(this.userName);

    // Beep + snackbar only for non-SM participants who haven't voted yet
    if (iAmMissing && !this.isScrumMaster) {
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

  onAvatarSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 64;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d')!;
        const side = Math.min(img.width, img.height);
        const sx = (img.width  - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        this.registerAvatar = canvas.toDataURL('image/jpeg', 0.8);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  register(): void {
    const name = this.registerName.trim();
    const room = this.registerRoom.trim();
    if (!name || !room) return;
    this.registerError = '';
    this.userName      = name;
    this.roomName      = room;
    this.isScrumMaster = this.registerAsSM;
    this.isRegistered  = true;
    if (this.registerAvatar) localStorage.setItem('scrumPokerAvatar', this.registerAvatar);
    localStorage.setItem('scrumPokerUser', JSON.stringify({ name, room, isSM: this.isScrumMaster }));
    this.send({ type: 'join', room, name, isSM: this.isScrumMaster, avatar: this.registerAvatar });
  }

  shareRoom(): void {
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(this.roomName)}`;
    navigator.clipboard.writeText(url).then(() => {
      this.snackBar.open('Invite link copied to clipboard!', '', { duration: 3000 });
    });
  }

  openHelp(): void {
    window.open('/assets/help.html', 'scrumHelp',
      'width=960,height=700,resizable=yes,scrollbars=yes');
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
    if (this.selectedCard === value) {
      this.selectedCard = null;         // optimistic deselect
      this.send({ type: 'unvote' });
    } else {
      this.selectedCard = value;        // optimistic select
      this.send({ type: 'vote', value });
      this.fireVoteFloat();
    }
  }

  private fireVoteFloat(): void {
    let idx: number;
    do { idx = Math.floor(Math.random() * VOTE_MESSAGES.length); }
    while (idx === this.lastVoteFloatIdx && VOTE_MESSAGES.length > 1);
    this.lastVoteFloatIdx = idx;
    this.voteFloatMsg = VOTE_MESSAGES[idx];

    if (this.voteFloatTimer) clearTimeout(this.voteFloatTimer);

    // Wait for Angular to render the new message text, then position + animate
    setTimeout(() => {
      const floatEl = this.voteFloatRef?.nativeElement;
      const chipsEl = this.chipsScrollRef?.nativeElement;
      if (!floatEl || !chipsEl) return;

      // Find current user's chip (marked with pc-me)
      const myChipEl = chipsEl.querySelector('.pc-me') as HTMLElement | null;
      if (!myChipEl) return;

      // Position float centred above the chip, relative to .team-nav (offsetParent)
      const chipRect = myChipEl.getBoundingClientRect();
      const navEl    = floatEl.offsetParent as HTMLElement;
      const navRect  = navEl.getBoundingClientRect();

      floatEl.style.left   = `${chipRect.left - navRect.left + chipRect.width / 2}px`;
      floatEl.style.bottom = `${navRect.bottom - chipRect.top + 8}px`;

      // Restart animation: remove class → reflow → add class
      floatEl.classList.remove('vf-run');
      void floatEl.offsetWidth;   // force reflow so animation starts from frame 0
      floatEl.classList.add('vf-run');

      this.voteFloatTimer = setTimeout(() => {
        floatEl.classList.remove('vf-run');
      }, 2700);
    }, 0);
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

  get roomCreatedAgo(): string {
    if (!this.roomCreatedAt) return '';
    const diff = Math.floor((Date.now() - this.roomCreatedAt) / 1000);
    if (diff < 60)  return 'just now';
    if (diff < 3600) { const m = Math.floor(diff / 60);  return `${m} min ago`; }
    if (diff < 86400){ const h = Math.floor(diff / 3600); return `${h} hour${h > 1 ? 's' : ''} ago`; }
    const d = Math.floor(diff / 86400); return `${d} day${d > 1 ? 's' : ''} ago`;
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
    this.updateResponsiveState();
    if (!this._isExpanded) this.snapCompact();
    setTimeout(() => this.updateChipsScrollState());
  };
}

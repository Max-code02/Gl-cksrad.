import {
  type WheelData,
  DEFAULT_PRESET_WHEEL,
  fetchAllWheels,
  saveWheelToFirebase,
  deleteWheelFromFirebase,
  subscribeToWheels,
} from './firebase.ts';

// Web Audio Synthesizer
class AudioManager {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  isMuted = false;
  volume = 0.8;

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.updateVolume();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.updateVolume();
    return this.isMuted;
  }

  setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    this.updateVolume();
    return this.volume;
  }

  updateVolume() {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  playTick(speedFactor = 1) {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const baseFreq = 140 + speedFactor * 280;
      const duration = 0.02 + 0.025 * (1 - speedFactor);

      osc.type = speedFactor > 0.5 ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + duration);

      const tickVolume = 0.15 + speedFactor * 0.35;
      gain.gain.setValueAtTime(tickVolume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  playFanfare() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain) return;
      const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 523.25, 659.25, 1046.5];

      notes.forEach((freq, index) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const isLast = index === notes.length - 1;
        osc.type = isLast ? 'square' : 'sine';

        const startTime = this.ctx!.currentTime + index * 0.08;
        const duration = isLast ? 1.4 : 0.12;

        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(startTime);
        osc.stop(startTime + duration);
      });
    } catch (e) {}
  }

  playCheer() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain) return;
      const chords = [
        [523.25, 659.25, 783.99],
        [587.33, 739.99, 880.0],
        [659.25, 830.61, 987.77],
        [1046.5, 1318.51, 1567.98],
      ];
      chords.forEach((chord, step) => {
        const startTime = this.ctx!.currentTime + step * 0.14;
        const dur = step === chords.length - 1 ? 1.0 : 0.2;
        chord.forEach((freq) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.12, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
          osc.connect(gain);
          gain.connect(this.masterGain!);
          osc.start(startTime);
          osc.stop(startTime + dur);
        });
      });
    } catch (e) {}
  }

  playDrumroll() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain) return;
      const count = 28;
      for (let i = 0; i < count; i++) {
        const time = this.ctx.currentTime + i * 0.045;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110 + i * 3, time);
        gain.gain.setValueAtTime(0.1 + i * 0.008, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 0.04);
      }
      const endTime = this.ctx.currentTime + count * 0.045;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(70, endTime);
      osc.frequency.exponentialRampToValueAtTime(30, endTime + 0.3);
      gain.gain.setValueAtTime(0.5, endTime);
      gain.gain.exponentialRampToValueAtTime(0.001, endTime + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(endTime);
      osc.stop(endTime + 0.3);
    } catch (e) {}
  }

  playFail() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain) return;
      const freqs = [330, 311.13, 293.66, 277.18];
      freqs.forEach((freq, idx) => {
        const startTime = this.ctx!.currentTime + idx * 0.32;
        const dur = idx === 3 ? 0.9 : 0.28;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, startTime);
        if (idx === 3) {
          osc.frequency.linearRampToValueAtTime(220, startTime + dur);
        }
        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(startTime);
        osc.stop(startTime + dur);
      });
    } catch (e) {}
  }
}

const audio = new AudioManager();

const PALETTE = [
  { main: '#6366F1', glow: '#818cf8' },
  { main: '#EC4899', glow: '#f472b6' },
  { main: '#8B5CF6', glow: '#a78bfa' },
  { main: '#10B981', glow: '#34d399' },
  { main: '#F59E0B', glow: '#fbbf24' },
  { main: '#06B6D4', glow: '#22d3ee' },
  { main: '#F43F5E', glow: '#fb7185' },
  { main: '#3B82F6', glow: '#60a5fa' },
  { main: '#14B8A6', glow: '#2dd4bf' },
  { main: '#A855F7', glow: '#c084fc' },
];

// STATE
let allWheels: WheelData[] = [DEFAULT_PRESET_WHEEL];
let currentWheel: WheelData = { ...DEFAULT_PRESET_WHEEL };
let currentRotation = 0;
let currentVelocity = 0;
let isSpinning = false;
let animationFrameId: number | null = null;
let lastTickSegment = -1;
let activeIndex = -1;
let pulseTime = 0;

const config = {
  _focusState: -1,
  spinDuration: 6000,
};

// SOCKET.IO (Supports local, Render and preview domains)
let socket: any = null;
try {
  if (typeof (window as any).io !== 'undefined') {
    socket = (window as any).io();
  }
} catch (e) {}

// Safe DOM Getters
const $ = (id: string) => document.getElementById(id);

function init() {
  setupEventListeners();
  buildDevConsole();

  // Load from local storage immediately so UI is 100% responsive right away
  fetchAllWheels().then((wheels) => {
    allWheels = wheels;
    renderHubView();
  });

  // Realtime subscription
  subscribeToWheels((wheels) => {
    allWheels = wheels;
    renderHubView();

    // If currently playing, sync changes
    const updated = wheels.find((w) => w.id === currentWheel.id);
    if (updated) {
      currentWheel = { ...updated };
      config.spinDuration = currentWheel.spinDuration || 6000;
      updateDurationUI(config.spinDuration);
      renderOptionsList();
      drawWheel();
    }
  });

  // URL Query check
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('wheel') || urlParams.get('room');
  if (targetId) {
    const found = allWheels.find((w) => w.id.toLowerCase() === targetId.toLowerCase());
    if (found) openWheel(found);
  }

  // Socket stealth listeners
  if (socket) {
    socket.on('connect', () => {
      if (currentWheel) {
        socket.emit('join_room', { roomName: currentWheel.id });
        socket.emit('sync_options', { options: currentWheel.options });
      }
    });

    socket.on('init_state', (data: any) => {
      if (data && Array.isArray(data.options) && data.options.length > 0) {
        currentWheel.options = data.options;
        renderOptionsList();
        drawWheel();
      }
    });

    socket.on('update_options', (data: any) => {
      if (data && Array.isArray(data.options)) {
        currentWheel.options = data.options;
        renderOptionsList();
        drawWheel();
      }
    });

    socket.on('trigger_spin', (data: any) => {
      if (data && data.targetIndex !== undefined && data.targetIndex !== null && data.targetIndex >= 0) {
        updateFocusState(data.targetIndex);
      } else {
        updateFocusState(-1);
      }
      if (!isSpinning && currentWheel.options.length > 0) {
        audio.init();
        startSpin();
      }
    });

    socket.on('arm_pc_trap', (data: any) => {
      if (data && data.targetIndex !== undefined) {
        updateFocusState(data.targetIndex);
      }
    });

    socket.on('trigger_sfx', (data: any) => {
      if (data && data.effect) {
        handleRemoteSfx(data.effect);
      }
    });
  }
}

// --- HUB VIEW RENDERING (RÄDER AUSWAHL) ---
function renderHubView() {
  const wheelsGrid = $('wheelsGrid');
  if (!wheelsGrid) return;
  wheelsGrid.innerHTML = '';

  allWheels.forEach((wheel) => {
    const card = document.createElement('div');
    card.className = 'wheel-card';
    const isDefault = wheel.id === DEFAULT_PRESET_WHEEL.id;

    const previewColors = wheel.options
      .slice(0, 8)
      .map((_, i) => `<span class="mini-swatch" style="background:${PALETTE[i % PALETTE.length].main}"></span>`)
      .join('');

    card.innerHTML = `
      <div class="wheel-card-header">
        <h3 class="wheel-card-title">${escapeHtml(wheel.title)}</h3>
        <span class="wheel-badge">${wheel.options.length} Optionen</span>
      </div>
      <div class="mini-swatches-bar">
        ${previewColors}
      </div>
      <div class="wheel-card-meta">
        <span>⏱️ ${Math.round((wheel.spinDuration || 6000) / 1000)}s Drehzeit</span>
        <span class="room-id-tag">ID: ${escapeHtml(wheel.id)}</span>
      </div>
      <div class="wheel-card-actions">
        <button class="btn-card-start" data-action="start" data-id="${wheel.id}">
          ▶ Rad starten
        </button>
        <button class="btn-card-edit" data-action="edit" data-id="${wheel.id}" title="Bearbeiten">
          ✏️
        </button>
        ${
          !isDefault
            ? `<button class="btn-card-delete" data-action="delete" data-id="${wheel.id}" title="Löschen">🗑️</button>`
            : ''
        }
      </div>
    `;

    wheelsGrid.appendChild(card);
  });
}

function openWheel(wheel: WheelData) {
  currentWheel = { ...wheel };
  config.spinDuration = wheel.spinDuration || 6000;
  updateDurationUI(config.spinDuration);

  const hubView = $('hubView');
  const wheelView = $('wheelView');
  const title = $('activeWheelTitle');

  if (hubView) hubView.style.display = 'none';
  if (wheelView) wheelView.style.display = 'flex';
  if (title) title.textContent = wheel.title;

  const url = new URL(window.location.href);
  url.searchParams.set('wheel', wheel.id);
  window.history.pushState({}, '', url.toString());

  if (socket) {
    socket.emit('join_room', { roomName: wheel.id });
    socket.emit('sync_options', { options: wheel.options });
  }

  renderOptionsList();
  resizeCanvas();
}

function backToHub() {
  const hubView = $('hubView');
  const wheelView = $('wheelView');

  if (wheelView) wheelView.style.display = 'none';
  if (hubView) hubView.style.display = 'flex';

  const url = new URL(window.location.href);
  url.searchParams.delete('wheel');
  window.history.pushState({}, '', url.toString());

  renderHubView();
}

// Modal open/close
function openWheelModal(wheelToEdit?: WheelData) {
  const modal = $('wheelModal');
  const title = $('wheelModalTitle') as HTMLHeadingElement;
  const titleInput = $('wheelTitleInput') as HTMLInputElement;
  const idInput = $('wheelIdInput') as HTMLInputElement;
  const optText = $('wheelOptionsTextarea') as HTMLTextAreaElement;
  const durInput = $('wheelDurationInput') as HTMLInputElement;

  if (!modal) return;
  modal.classList.add('active');
  modal.style.display = 'flex';

  if (wheelToEdit) {
    if (title) title.textContent = '✏️ Glücksrad bearbeiten';
    if (titleInput) titleInput.value = wheelToEdit.title;
    if (idInput) {
      idInput.value = wheelToEdit.id;
      idInput.disabled = true;
    }
    if (optText) optText.value = wheelToEdit.options.join('\n');
    if (durInput) durInput.value = String(Math.round((wheelToEdit.spinDuration || 6000) / 1000));
  } else {
    if (title) title.textContent = '➕ Neues Glücksrad erstellen';
    if (titleInput) titleInput.value = '';
    if (idInput) {
      idInput.value = 'rad-' + Math.random().toString(36).substring(2, 7);
      idInput.disabled = false;
    }
    if (optText) optText.value = '10 Punkte\n20 Punkte\nPopcorn (groß)\n5 Punkte\nNiete :(';
    if (durInput) durInput.value = '6';
  }
}

function closeWheelModal() {
  const modal = $('wheelModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

// Expose directly to window for immediate inline onclick safety
(window as any).openNewWheelModal = (w?: WheelData) => openWheelModal(w);
(window as any).closeNewWheelModal = () => closeWheelModal();

async function handleSaveWheelForm(e: SubmitEvent) {
  e.preventDefault();
  const titleInput = $('wheelTitleInput') as HTMLInputElement;
  const idInput = $('wheelIdInput') as HTMLInputElement;
  const optText = $('wheelOptionsTextarea') as HTMLTextAreaElement;
  const durInput = $('wheelDurationInput') as HTMLInputElement;

  const title = titleInput?.value.trim() || 'Mein Glücksrad';
  const rawId = idInput?.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'rad-' + Date.now();
  const lines = (optText?.value || '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const options = lines.length > 0 ? lines : ['Option 1', 'Option 2', 'Option 3'];
  const durationSec = Math.max(1, Math.min(30, parseFloat(durInput?.value || '6') || 6));

  const newWheel: WheelData = {
    id: rawId,
    title,
    options,
    spinDuration: durationSec * 1000,
  };

  await saveWheelToFirebase(newWheel);
  allWheels = await fetchAllWheels();
  renderHubView();
  closeWheelModal();
  openWheel(newWheel);
}

// --- DREHZEIT STEUERUNG (WIE LANG SOLL ES DREHEN - GEFIXT) ---
function updateDurationUI(ms: number) {
  const sec = Math.round(ms / 1000);
  const input = $('durationInput') as HTMLInputElement;
  if (input) input.value = String(sec);

  document.querySelectorAll('.btn-duration-preset').forEach((btn) => {
    const presetSec = parseFloat((btn as HTMLElement).dataset.sec || '6');
    if (presetSec === sec) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function setSpinDurationSeconds(sec: number) {
  const safeSec = Math.max(1, Math.min(30, sec));
  config.spinDuration = safeSec * 1000;
  currentWheel.spinDuration = config.spinDuration;
  updateDurationUI(config.spinDuration);
  saveWheelToFirebase(currentWheel);
}

// --- OPTIONS LIST ---
function renderOptionsList() {
  const list = $('optionsList');
  const count = $('itemCount');
  const spinBtn = $('spinBtn') as HTMLButtonElement;

  if (!list || !count) return;
  list.innerHTML = '';
  count.textContent = String(currentWheel.options.length);

  currentWheel.options.forEach((opt, index) => {
    const li = document.createElement('li');
    li.className = 'option-item';
    li.dataset.index = String(index);

    const color = PALETTE[index % PALETTE.length].main;

    li.innerHTML = `
      <div class="drag-handle" title="Verschieben">⋮⋮</div>
      <div class="option-content">
        <div class="option-color-preview" style="background-color: ${color};"></div>
        <input type="text" class="option-text" value="${escapeHtml(opt)}" data-index="${index}" title="Klicken zum Bearbeiten" ${isSpinning ? 'disabled' : ''} />
      </div>
      <div class="option-actions">
        <button class="btn-delete" data-action="delete-option" data-index="${index}" title="Löschen">🗑️</button>
      </div>
    `;

    list.appendChild(li);
  });

  if (spinBtn) spinBtn.disabled = currentWheel.options.length === 0 || isSpinning;

  if (socket && socket.connected) {
    socket.emit('sync_options', { options: currentWheel.options });
  }
}

function addOption() {
  const input = $('optionInput') as HTMLInputElement;
  if (!input) return;
  const text = input.value.trim();
  if (text && !isSpinning) {
    currentWheel.options.push(text);
    input.value = '';
    activeIndex = -1;
    saveWheelToFirebase(currentWheel);
    renderOptionsList();
    drawWheel();
    const list = $('optionsList');
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }
  input.focus();
}

function resetWheelOptions() {
  if (isSpinning) return;
  if (confirm('Standard-Optionen für dieses Rad wiederherstellen?')) {
    currentWheel.options = [...DEFAULT_PRESET_WHEEL.options];
    activeIndex = -1;
    updateFocusState(-1);
    saveWheelToFirebase(currentWheel);
    renderOptionsList();
    drawWheel();
  }
}

// --- CANVAS RENDERING ---
function resizeCanvas() {
  const wheelView = $('wheelView');
  if (!wheelView || wheelView.style.display === 'none') {
    return;
  }

  const wheelCanvas = $('wheelCanvas') as HTMLCanvasElement;
  if (!wheelCanvas) return;
  const ctx = wheelCanvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const container = wheelCanvas.parentElement;
  const displayWidth = container && container.clientWidth > 0 ? container.clientWidth : 620;
  const displayHeight = container && container.clientHeight > 0 ? container.clientHeight : 620;

  wheelCanvas.width = displayWidth * dpr;
  wheelCanvas.height = displayHeight * dpr;
  wheelCanvas.style.width = `${displayWidth}px`;
  wheelCanvas.style.height = `${displayHeight}px`;

  ctx.resetTransform();
  ctx.scale(dpr, dpr);

  drawWheel();
}

function drawWheel() {
  const wheelView = $('wheelView');
  if (!wheelView || wheelView.style.display === 'none') {
    return;
  }

  const wheelCanvas = $('wheelCanvas') as HTMLCanvasElement;
  if (!wheelCanvas) return;
  const ctx = wheelCanvas.getContext('2d');
  if (!ctx) return;

  const width = wheelCanvas.width / (window.devicePixelRatio || 1);
  const height = wheelCanvas.height / (window.devicePixelRatio || 1);
  if (width < 60 || height < 60) return;

  const centerX = width / 2;
  const centerY = height / 2;

  const rawRadius = Math.min(centerX, centerY) - 30;
  if (rawRadius <= 10) return;
  const radius = Math.max(10, rawRadius);
  const hubRadius = Math.max(20, Math.min(60, radius * 0.18));

  ctx.clearRect(0, 0, width, height);

  if (currentWheel.options.length === 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Keine Optionen vorhanden', centerX, centerY);
    return;
  }

  const sliceAngle = (2 * Math.PI) / currentWheel.options.length;

  currentWheel.options.forEach((option, i) => {
    const startAngle = currentRotation + i * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    const isActive = i === activeIndex;

    let highlightPulse = 0;
    if (isActive) {
      pulseTime += 0.05;
      highlightPulse = (Math.sin(pulseTime) + 1) / 2;
    }

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius + (isActive ? 12 * highlightPulse : 0), startAngle, endAngle);
    ctx.closePath();

    const colorSet = PALETTE[i % PALETTE.length];
    ctx.fillStyle = isActive ? colorSet.glow : colorSet.main;
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(startAngle + sliceAngle / 2);

    drawUltraFittedText(ctx, option, radius, hubRadius, sliceAngle);

    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1e293b';
  ctx.stroke();

  // Hub
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(centerX, centerY, hubRadius, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.restore();

  if (activeIndex !== -1 && !isSpinning) {
    requestAnimationFrame(drawWheel);
  }
}

function drawUltraFittedText(ctx: CanvasRenderingContext2D, text: string, radius: number, hubRadius: number, sliceAngle: number) {
  const outerMargin = 20;
  const innerMargin = hubRadius + 12;
  const availableLength = radius - outerMargin - innerMargin;

  const midRadius = (radius + hubRadius) / 2;
  const maxArcWidth = Math.max(16, 2 * midRadius * Math.sin(sliceAngle / 2) * 0.82);

  const words = text.trim().split(/\s+/);
  let lines: string[] = [];

  let fontSize = Math.min(32, Math.max(12, Math.floor((radius * 1.2) / Math.max(6, currentWheel.options.length))));
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;

  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    if (ctx.measureText(testLine).width > availableLength && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  if (lines.length > 3) {
    const topLines = lines.slice(0, 2);
    topLines.push(lines.slice(2).join(' '));
    lines = topLines;
  }

  const lineHeight = fontSize * 1.1;
  const totalHeight = lines.length * lineHeight;

  if (totalHeight > maxArcWidth) {
    fontSize = Math.max(10, Math.floor(maxArcWidth / (lines.length * 1.15)));
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  }

  const finalLineHeight = fontSize * 1.1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  const startX = radius - outerMargin;

  lines.forEach((line, index) => {
    ctx.save();
    const yOffset = (index - (lines.length - 1) / 2) * finalLineHeight;
    const lineWidth = ctx.measureText(line).width;
    let scaleX = 1;
    if (lineWidth > availableLength) {
      scaleX = availableLength / lineWidth;
    }
    ctx.translate(startX, yOffset);
    if (scaleX < 1) {
      ctx.scale(scaleX, 1);
    }
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
}

// --- SPIN ANIMATION ---
function startSpin() {
  if (isSpinning || currentWheel.options.length === 0) return;

  audio.init();
  isSpinning = true;
  const spinBtn = $('spinBtn') as HTMLButtonElement;
  if (spinBtn) spinBtn.disabled = true;
  activeIndex = -1;

  if (socket) {
    socket.emit('notify_pc_spun');
  }

  const startRotation = currentRotation;
  let targetRotation = 0;

  const extraSpins = (Math.floor(Math.random() * 4) + 6) * 2 * Math.PI;
  const sliceAngle = (2 * Math.PI) / currentWheel.options.length;

  if (config._focusState !== -1 && config._focusState < currentWheel.options.length) {
    const targetSegmentCenter = config._focusState * sliceAngle + sliceAngle / 2;
    let requiredMod = (1.5 * Math.PI - targetSegmentCenter) % (2 * Math.PI);
    if (requiredMod < 0) requiredMod += 2 * Math.PI;

    const randomJitter = (Math.random() * 0.4 - 0.2) * sliceAngle;
    targetRotation = startRotation + extraSpins + requiredMod + randomJitter - (startRotation % (2 * Math.PI));
  } else {
    targetRotation = startRotation + extraSpins + Math.random() * 2 * Math.PI;
  }

  let startTime: number | null = null;
  let lastTimestamp: number | null = null;
  let lastRotation = startRotation;

  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  function spinLoop(timestamp: number) {
    if (!startTime) startTime = timestamp;
    if (!lastTimestamp) lastTimestamp = timestamp;

    const elapsed = timestamp - startTime;
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const progress = Math.min(elapsed / config.spinDuration, 1);
    currentRotation = startRotation + (targetRotation - startRotation) * easeOutCubic(progress);

    if (deltaTime > 0) {
      currentVelocity = (currentRotation - lastRotation) / (deltaTime / 16.66);
    }
    lastRotation = currentRotation;

    checkTickSound();
    drawWheel();

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(spinLoop);
    } else {
      currentVelocity = 0;
      isSpinning = false;
      const btn = $('spinBtn') as HTMLButtonElement;
      if (btn) btn.disabled = false;
      handleResult();
    }
  }

  animationFrameId = requestAnimationFrame(spinLoop);
}

function checkTickSound() {
  const sliceAngle = (2 * Math.PI) / currentWheel.options.length;
  let pointerAngle = (1.5 * Math.PI - (currentRotation % (2 * Math.PI))) % (2 * Math.PI);
  if (pointerAngle < 0) pointerAngle += 2 * Math.PI;

  const currentSegment = Math.floor(pointerAngle / sliceAngle);

  if (currentSegment !== lastTickSegment && lastTickSegment !== -1) {
    const speedFactor = Math.min(1, Math.abs(currentVelocity) * 1.4);
    audio.playTick(speedFactor);

    const pointer = document.querySelector('.pointer') as HTMLElement;
    if (pointer) {
      const intensity = Math.max(6, Math.min(30, currentVelocity * 35));
      pointer.style.transform = `translateX(-50%) rotate(-${intensity}deg)`;
      setTimeout(() => {
        pointer.style.transform = 'translateX(-50%) rotate(0deg)';
      }, 55);
    }
  }
  lastTickSegment = currentSegment;
}

function handleResult() {
  const sliceAngle = (2 * Math.PI) / currentWheel.options.length;
  let pointerAngle = (1.5 * Math.PI - (currentRotation % (2 * Math.PI))) % (2 * Math.PI);
  if (pointerAngle < 0) pointerAngle += 2 * Math.PI;

  activeIndex = Math.floor(pointerAngle / sliceAngle);
  const winner = currentWheel.options[activeIndex];

  pulseTime = 0;
  drawWheel();
  audio.playFanfare();

  const winnerText = $('winnerText');
  const winnerModal = $('winnerModal');
  if (winnerText && winnerModal) {
    winnerText.innerHTML = escapeHtml(winner);
    winnerModal.classList.add('active');
  }
  triggerConfetti();
}

function triggerConfetti() {
  const confettiFunc = (window as any).confetti;
  if (typeof confettiFunc !== 'function') return;

  try {
    confettiFunc({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: PALETTE.map((p) => p.main),
    });
  } catch (e) {}
}

function closeModal() {
  const modal = $('winnerModal');
  if (modal) modal.classList.remove('active');
  activeIndex = -1;
  drawWheel();
  const spinBtn = $('spinBtn') as HTMLButtonElement;
  if (spinBtn) spinBtn.focus();
}

function handleRemoteSfx(effect: string) {
  audio.init();
  if (effect === 'confetti') {
    triggerConfetti();
  } else if (effect === 'cheer') {
    audio.playCheer();
    triggerConfetti();
  } else if (effect === 'drumroll') {
    audio.playDrumroll();
  } else if (effect === 'fail') {
    audio.playFail();
    shakeWheel();
  }
}

function shakeWheel() {
  const wrapper = document.querySelector('.wheel-wrapper') as HTMLElement;
  if (wrapper) {
    wrapper.style.transition = 'transform 0.1s ease';
    let count = 0;
    const interval = setInterval(() => {
      count++;
      const x = (Math.random() - 0.5) * 16;
      const y = (Math.random() - 0.5) * 16;
      wrapper.style.transform = `translate(${x}px, ${y}px)`;
      if (count > 6) {
        clearInterval(interval);
        wrapper.style.transform = '';
      }
    }, 50);
  }
}

function updateFocusState(index: number) {
  if (isNaN(index)) index = -1;
  config._focusState = index >= currentWheel.options.length ? -1 : index;
}

// Dev Console
function buildDevConsole() {
  if (document.getElementById('devConsolePanel')) return;

  const panel = document.createElement('div');
  panel.id = 'devConsolePanel';
  panel.style.cssText = `
    position: fixed; top: 15px; left: 15px; background: rgba(15, 23, 42, 0.95);
    color: #e2e8f0; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px;
    z-index: 10000; display: none; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    backdrop-filter: blur(5px); width: 260px;
  `;

  panel.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 10px; color: #38bdf8; border-bottom: 1px solid #334155; padding-bottom: 5px; display: flex; justify-content: space-between;">
      <span>⚙️ Dev Settings</span>
      <span style="color: #64748b; font-size: 10px;">[K]</span>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: block; margin-bottom: 4px;">Volume</label>
      <input type="range" id="devVol" min="0" max="100" value="80" style="width: 100%;">
    </div>
    <div style="margin-bottom: 5px;">
      <label style="display: block; margin-bottom: 4px;">Target Index (-1 = Auto)</label>
      <input type="number" id="devFocus" value="-1" min="-1" style="width: 100%; background: #1e293b; color: white; border: 1px solid #475569; padding: 4px; border-radius: 4px;">
    </div>
  `;

  document.body.appendChild(panel);

  $('devVol')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value) / 100;
    audio.setVolume(val);
  });

  $('devFocus')?.addEventListener('input', (e) => {
    updateFocusState(parseInt((e.target as HTMLInputElement).value));
  });
}

// Event Listeners with Safe Event Delegation
function setupEventListeners() {
  // Hub Grid Event Delegation
  const wheelsGrid = $('wheelsGrid');
  if (wheelsGrid) {
    wheelsGrid.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('button');
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!id) return;

      const wheel = allWheels.find((w) => w.id === id);
      if (!wheel) return;

      if (action === 'start') {
        openWheel(wheel);
      } else if (action === 'edit') {
        openWheelModal(wheel);
      } else if (action === 'delete') {
        if (id === DEFAULT_PRESET_WHEEL.id) return;
        if (confirm(`Glücksrad "${wheel.title}" wirklich löschen?`)) {
          deleteWheelFromFirebase(id);
          allWheels = allWheels.filter((w) => w.id !== id);
          renderHubView();
        }
      }
    });
  }

  // Options List Event Delegation
  const optionsList = $('optionsList');
  if (optionsList) {
    optionsList.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn && btn.dataset.action === 'delete-option') {
        const idx = parseInt(btn.dataset.index || '-1');
        if (idx >= 0 && !isSpinning) {
          currentWheel.options.splice(idx, 1);
          activeIndex = -1;
          if (config._focusState >= currentWheel.options.length) updateFocusState(-1);
          saveWheelToFirebase(currentWheel);
          renderOptionsList();
          drawWheel();
        }
      }
    });

    optionsList.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input && input.classList.contains('option-text')) {
        const idx = parseInt(input.dataset.index || '-1');
        const text = input.value.trim();
        if (idx >= 0 && text) {
          currentWheel.options[idx] = text;
          saveWheelToFirebase(currentWheel);
          drawWheel();
          if (socket && socket.connected) {
            socket.emit('sync_options', { options: currentWheel.options });
          }
        } else {
          renderOptionsList();
        }
      }
    });
  }

  // Back to Hub
  $('btnBackToHub')?.addEventListener('click', backToHub);

  // New Wheel Modal
  $('btnCreateNewWheel')?.addEventListener('click', () => openWheelModal());
  $('btnCloseWheelModal')?.addEventListener('click', closeWheelModal);
  $('wheelModal')?.addEventListener('click', (e) => {
    if (e.target === $('wheelModal')) closeWheelModal();
  });
  $('wheelForm')?.addEventListener('submit', handleSaveWheelForm as any);

  // Add Option
  $('addForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addOption();
  });
  $('resetBtn')?.addEventListener('click', resetWheelOptions);

  // Spin Button
  $('spinBtn')?.addEventListener('click', () => {
    audio.init();
    startSpin();
  });

  // Canvas Click
  $('wheelCanvas')?.addEventListener('click', () => {
    audio.init();
    if (!isSpinning && currentWheel.options.length > 0) startSpin();
  });

  // Modal Close
  $('closeModalBtn')?.addEventListener('click', closeModal);
  $('winnerModal')?.addEventListener('click', (e) => {
    if (e.target === $('winnerModal')) closeModal();
  });

  // Duration input
  const durationInput = $('durationInput');
  if (durationInput) {
    durationInput.addEventListener('change', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val)) setSpinDurationSeconds(val);
    });
  }

  // Duration Presets
  document.querySelectorAll('.btn-duration-preset').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sec = parseFloat((e.target as HTMLElement).dataset.sec || '6');
      setSpinDurationSeconds(sec);
    });
  });

  window.addEventListener('resize', resizeCanvas);

  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName) && e.code !== 'Escape') {
      return;
    }

    if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const panel = $('devConsolePanel');
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    if (e.key >= '1' && e.key <= '9') {
      const targetIdx = parseInt(e.key) - 1;
      if (targetIdx < currentWheel.options.length) {
        updateFocusState(targetIdx);
      }
    }
    if (e.key === '0') updateFocusState(-1);

    const wheelView = $('wheelView');
    if (e.code === 'Space' && !isSpinning && wheelView && wheelView.style.display !== 'none') {
      e.preventDefault();
      audio.init();
      startSpin();
    }

    if (e.code === 'Escape') {
      closeModal();
      closeWheelModal();
    }
  });
}

function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Run immediately if DOM is already ready, or on DOMContentLoaded
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

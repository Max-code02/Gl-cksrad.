/**
 * GLÜCKSRAD - STEALTH / UNDERCOVER EDITION
 * 
 * ============================================================================
 * ARCHITEKTUR-HINWEIS & SICHERHEITSKRITERIUM:
 * Auf dem Hauptbildschirm (z.B. Beamer, Klassenzimmer, Event-Bühne) darf
 * NIEMALS erkennbar sein, dass dieses Glücksrad ferngesteuert oder manipuliert
 * werden kann!
 * 
 * - KEINE sichtbaren Raumnamen oder Verbindungs-Badges im Header.
 * - KEINE Popups (prompt/alert) beim Laden der Seite.
 * - KEINE Erwähnung von Begriffen wie "Handy", "Fernbedienung", "Remote", "Falle".
 * - Sound- & Konfetti-Effekte laufen als scheinbar natürliche Reaktionen ab.
 * - Die Socket-Verbindung arbeitet 100% geräuschlos und unsichtbar im Hintergrund.
 * ============================================================================
 */

// --- 1. AUDIO MANAGEMENT SYSTEM ---
class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.isMuted = false;
        this.volume = 0.8;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
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

    setVolume(val) {
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
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            const baseFreq = 140 + (speedFactor * 280);
            const duration = 0.02 + (0.025 * (1 - speedFactor));

            osc.type = speedFactor > 0.5 ? 'square' : 'triangle';
            osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + duration);

            const tickVolume = 0.15 + (speedFactor * 0.35);
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
            if (!this.ctx) return;
            const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 523.25, 659.25, 1046.50];

            notes.forEach((freq, index) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                const isLast = index === notes.length - 1;
                osc.type = isLast ? 'square' : 'sine';

                const startTime = this.ctx.currentTime + index * 0.08;
                const duration = isLast ? 1.4 : 0.12;

                osc.frequency.setValueAtTime(freq, startTime);

                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                osc.connect(gain);
                gain.connect(this.masterGain);

                osc.start(startTime);
                osc.stop(startTime + duration);
            });
        } catch (e) {}
    }

    playCheer() {
        if (this.isMuted) return;
        try {
            this.init();
            if (!this.ctx) return;
            const chords = [
                [523.25, 659.25, 783.99],
                [587.33, 739.99, 880.00],
                [659.25, 830.61, 987.77],
                [1046.50, 1318.51, 1567.98]
            ];
            chords.forEach((chord, step) => {
                const startTime = this.ctx.currentTime + step * 0.14;
                const dur = step === chords.length - 1 ? 1.0 : 0.2;
                chord.forEach(freq => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, startTime);
                    gain.gain.setValueAtTime(0.12, startTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
                    osc.connect(gain);
                    gain.connect(this.masterGain);
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
            if (!this.ctx) return;
            const count = 28;
            for (let i = 0; i < count; i++) {
                const time = this.ctx.currentTime + (i * 0.045);
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(110 + (i * 3), time);
                gain.gain.setValueAtTime(0.1 + (i * 0.008), time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(time);
                osc.stop(time + 0.04);
            }
            const endTime = this.ctx.currentTime + (count * 0.045);
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
        } catch(e) {}
    }

    playFail() {
        if (this.isMuted) return;
        try {
            this.init();
            if (!this.ctx) return;
            const freqs = [330, 311.13, 293.66, 277.18];
            freqs.forEach((freq, idx) => {
                const startTime = this.ctx.currentTime + idx * 0.32;
                const dur = idx === 3 ? 0.9 : 0.28;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, startTime);
                if (idx === 3) {
                    osc.frequency.linearRampToValueAtTime(220, startTime + dur);
                }
                gain.gain.setValueAtTime(0.18, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(startTime);
                osc.stop(startTime + dur);
            });
        } catch(e) {}
    }
}

const audio = new AudioManager();

// --- 2. FARBPALETTE & DEFAULT VALUES ---
const PALETTE = [
    { main: "#6366F1", glow: "#818cf8" },
    { main: "#EC4899", glow: "#f472b6" },
    { main: "#8B5CF6", glow: "#a78bfa" },
    { main: "#10B981", glow: "#34d399" },
    { main: "#F59E0B", glow: "#fbbf24" },
    { main: "#06B6D4", glow: "#22d3ee" },
    { main: "#F43F5E", glow: "#fb7185" },
    { main: "#3B82F6", glow: "#60a5fa" },
    { main: "#14B8A6", glow: "#2dd4bf" },
    { main: "#A855F7", glow: "#c084fc" }
];

const DEFAULT_OPTIONS = [
    "10 Punkte",
    "Popcorn (groß)",
    "5 Punkte",
    "20 Punkte",
    "5 Punkte",
    "10 Punkte",
    "Popcorn (klein)",
    "10 Punkte",
    "Niete :(",
    "20 Punkte",
    "30 Punkte",
    "5 Punkte",
    "10 Punkte",
    "Niete :(",
    "20 Punkte",
    "5 Punkte"
];

// --- 3. STATE MANAGEMENT ---
let options = [];
let currentRotation = 0;
let currentVelocity = 0;
let isSpinning = false;
let animationFrameId = null;
let lastTickSegment = -1;
let activeIndex = -1;
let pulseTime = 0;

const config = {
    _focusState: -1, // -1 = Zufall, ansonsten geheimes Ziel
    spinDuration: 6000 // Standard: 6 Sekunden
};

// --- 4. DOM ELEMENTE ---
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spinBtn');
const addForm = document.getElementById('addForm');
const optionInput = document.getElementById('optionInput');
const optionsList = document.getElementById('optionsList');
const itemCount = document.getElementById('itemCount');
const resetBtn = document.getElementById('resetBtn');
const winnerModal = document.getElementById('winnerModal');
const winnerText = document.getElementById('winnerText');
const closeModalBtn = document.getElementById('closeModalBtn');
const pointerEl = document.querySelector('.pointer');

// --- 5. DEV-KONSOLE (NUR PER TASTE [K] ÖFFENBAR, FÜR ZUSCHAUER VOLLKOMMEN VERSTECKT) ---
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
            <span>⚙️ Dev-Engine Settings</span>
            <span style="color: #64748b; font-size: 10px;">[K]</span>
        </div>
        
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 4px;">Master Volume (<span id="volDisplay">80</span>%)</label>
            <input type="range" id="devVol" min="0" max="100" value="80" style="width: 100%;">
        </div>

        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 4px;">Drehzeit (ms)</label>
            <input type="number" id="devDur" value="6000" step="500" min="1000" style="width: 100%; background: #1e293b; color: white; border: 1px solid #475569; padding: 4px; border-radius: 4px;">
        </div>

        <div style="margin-bottom: 5px;">
            <label style="display: block; margin-bottom: 4px;">Target Focus Index (-1 = Auto)</label>
            <input type="number" id="devFocus" value="-1" min="-1" style="width: 100%; background: #1e293b; color: white; border: 1px solid #475569; padding: 4px; border-radius: 4px;">
            <div id="devFocusName" style="color: #38bdf8; margin-top: 4px; font-style: italic; font-weight: bold;">Auto (Random)</div>
        </div>
    `;

    document.body.appendChild(panel);

    document.getElementById('devVol').addEventListener('input', (e) => {
        const val = parseInt(e.target.value) / 100;
        audio.setVolume(val);
        document.getElementById('volDisplay').innerText = Math.round(val * 100);
    });

    document.getElementById('devDur').addEventListener('input', (e) => {
        config.spinDuration = Math.max(1000, parseInt(e.target.value) || 6000);
    });

    document.getElementById('devFocus').addEventListener('input', (e) => {
        updateFocusState(parseInt(e.target.value));
    });
}

function updateFocusState(index) {
    if (isNaN(index)) index = -1;
    config._focusState = (index >= options.length) ? -1 : index;

    const input = document.getElementById('devFocus');
    const nameDisplay = document.getElementById('devFocusName');

    if (input && parseInt(input.value) !== config._focusState) {
        input.value = config._focusState;
    }

    if (nameDisplay) {
        if (config._focusState === -1) {
            nameDisplay.innerText = "Auto (Random)";
            nameDisplay.style.color = "#94a3b8";
        } else {
            nameDisplay.innerText = `Target [${config._focusState + 1}]: ${options[config._focusState]}`;
            nameDisplay.style.color = "#38bdf8";
        }
    }
}

// --- 6. INITIALISIERUNG & CANVAS SETUP ---
function init() {
    buildDevConsole();
    loadOptions();
    renderList();
    resizeCanvas();
    setupEventListeners();
    // WICHTIG: Keine sichtbaren Raum-Leisten oder Hinweise für Zuschauer erzeugen!
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    let displayWidth, displayHeight;

    if (document.fullscreenElement) {
        displayWidth = window.innerWidth;
        displayHeight = window.innerHeight;
    } else {
        const container = canvas.parentElement;
        displayWidth = container ? container.clientWidth : 620;
        displayHeight = container ? container.clientHeight : 620;
    }

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    drawWheel();
}

function loadOptions() {
    const saved = localStorage.getItem('profi_wheel_data');
    if (saved) {
        try {
            options = JSON.parse(saved);
        } catch (e) {
            options = [...DEFAULT_OPTIONS];
        }
    } else {
        options = [...DEFAULT_OPTIONS];
    }
}

function saveOptions() {
    localStorage.setItem('profi_wheel_data', JSON.stringify(options));
    updateFocusState(config._focusState);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        canvas.parentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
}

// --- 7. EVENT LISTENERS & VERSTECKTE HOTKEYS ---
function setupEventListeners() {
    addForm.addEventListener('submit', (e) => { e.preventDefault(); addOption(); });
    resetBtn.addEventListener('click', resetOptions);
    spinBtn.addEventListener('click', () => { audio.init(); startSpin(); });

    canvas.addEventListener('click', () => {
        audio.init();
        if (!isSpinning && options.length > 0) startSpin();
    });

    closeModalBtn.addEventListener('click', closeModal);
    winnerModal.addEventListener('click', (e) => {
        if (e.target === winnerModal) closeModal();
    });

    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('fullscreenchange', resizeCanvas);

    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && e.code !== 'Escape') {
            return;
        }

        // Dev-Konsole umschalten mit Taste K (nur dem Moderator bekannt)
        if (e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const panel = document.getElementById('devConsolePanel');
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }

        // Diskrete Tastatur-Cheats (1-9 und 0)
        if (e.key >= '1' && e.key <= '9') {
            const targetIdx = parseInt(e.key) - 1;
            if (targetIdx < options.length) {
                updateFocusState(targetIdx);
            }
        }

        if (e.key === '0') {
            updateFocusState(-1);
        }

        // Lautstärke
        if (e.key === '+' || e.key === 'ArrowUp') {
            e.preventDefault();
            syncVolumeUI(audio.setVolume(audio.volume + 0.1));
        }
        if (e.key === '-' || e.key === 'ArrowDown') {
            e.preventDefault();
            syncVolumeUI(audio.setVolume(audio.volume - 0.1));
        }

        // Vollbild (F)
        if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            toggleFullscreen();
        }

        // Stummschalten (M)
        if (e.key.toLowerCase() === 'm') {
            e.preventDefault();
            audio.toggleMute();
        }

        // Drehen per Leertaste
        if (e.code === 'Space' && !isSpinning && options.length > 0) {
            e.preventDefault();
            audio.init();
            startSpin();
        }

        if (e.code === 'Escape') closeModal();
    });
}

function syncVolumeUI(val) {
    const slider = document.getElementById('devVol');
    const display = document.getElementById('volDisplay');
    if (slider && display) {
        slider.value = Math.round(val * 100);
        display.innerText = Math.round(val * 100);
    }
}

// --- 8. LIST & OPTION MANAGEMENT ---
function renderList() {
    optionsList.innerHTML = '';
    itemCount.textContent = options.length;

    options.forEach((option, index) => {
        const li = document.createElement('li');
        li.className = 'option-item';
        li.draggable = !isSpinning;
        li.dataset.index = index;

        const color = PALETTE[index % PALETTE.length].main;
        
        li.innerHTML = `
            <div class="drag-handle" title="Verschieben">⋮⋮</div>
            <div class="option-content">
                <div class="option-color-preview" style="background-color: ${color};"></div>
                <input type="text" class="option-text" value="${escapeHtml(option)}" 
                       onchange="editOption(${index}, this.value)"
                       title="Klicken zum Bearbeiten"
                       ${isSpinning ? 'disabled' : ''} />
            </div>
            <div class="option-actions">
                <button class="btn-delete" title="Löschen" onclick="deleteOption(${index})">🗑️</button>
            </div>
        `;

        li.addEventListener('dragstart', (e) => {
            if (isSpinning) return e.preventDefault();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
            setTimeout(() => li.style.opacity = '0.4', 0);
        });

        li.addEventListener('dragend', () => {
            li.style.opacity = '1';
            renderList();
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            li.style.borderTop = '2px solid #38bdf8';
        });

        li.addEventListener('dragleave', () => {
            li.style.borderTop = '';
        });

        li.addEventListener('drop', (e) => {
            e.preventDefault();
            li.style.borderTop = '';
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = index;

            if (fromIndex !== toIndex && !isNaN(fromIndex)) {
                const movedItem = options.splice(fromIndex, 1)[0];
                options.splice(toIndex, 0, movedItem);
                
                activeIndex = -1;
                if (config._focusState !== -1) updateFocusState(-1);
                
                renderList();
                drawWheel();
            }
        });

        optionsList.appendChild(li);
    });

    spinBtn.disabled = options.length === 0 || isSpinning;
    saveOptions();

    // Lautlose Hintergrund-Synchronisation mit dem Server
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('sync_options', { options: options });
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.editOption = function(index, newText) {
    if (isSpinning) return;
    const text = newText.trim();
    if (text) {
        options[index] = text;
        saveOptions();
        drawWheel();
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('sync_options', { options: options });
        }
    } else {
        renderList();
    }
};

function addOption() {
    const text = optionInput.value.trim();
    if (text && !isSpinning) {
        options.push(text);
        optionInput.value = '';
        activeIndex = -1;
        renderList();
        drawWheel();
        optionsList.scrollTo({ top: optionsList.scrollHeight, behavior: 'smooth' });
    }
    optionInput.focus();
}

window.deleteOption = function(index) {
    if (isSpinning) return;
    options.splice(index, 1);
    activeIndex = -1;
    if (config._focusState >= options.length) updateFocusState(-1);
    renderList();
    drawWheel();
};

function resetOptions() {
    if (isSpinning) return;
    if (confirm("Möchtest du wirklich die Standard-Optionen laden?")) {
        options = [...DEFAULT_OPTIONS];
        activeIndex = -1;
        updateFocusState(-1);
        renderList();
        drawWheel();
    }
}

function closeModal() {
    winnerModal.classList.remove('active');
    activeIndex = -1;
    drawWheel();
    
    if (!document.fullscreenElement) {
        spinBtn.focus();
    }
}

// --- 9. CANVAS RENDERING ENGINE ---
function drawWheel() {
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const centerX = width / 2;
    const centerY = height / 2;

    const radius = Math.min(centerX, centerY) - (document.fullscreenElement ? 80 : 30);
    const hubRadius = Math.max(35, Math.min(60, radius * 0.18));

    ctx.clearRect(0, 0, width, height);

    if (document.fullscreenElement) {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, width, height);
    }

    if (options.length === 0) {
        return drawEmptyWheel(centerX, centerY, radius);
    }

    const sliceAngle = (2 * Math.PI) / options.length;

    options.forEach((option, i) => {
        const startAngle = currentRotation + i * sliceAngle;
        const endAngle = startAngle + sliceAngle;
        const isActive = (i === activeIndex);

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
        ctx.strokeStyle = "#0f172a";
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
    ctx.strokeStyle = "#1e293b";
    ctx.stroke();

    drawHub(centerX, centerY, hubRadius);

    if (activeIndex !== -1 && !isSpinning) {
        requestAnimationFrame(drawWheel);
    }
}

function drawUltraFittedText(ctx, text, radius, hubRadius, sliceAngle) {
    const outerMargin = 20;
    const innerMargin = hubRadius + 12;
    const availableLength = radius - outerMargin - innerMargin;

    const midRadius = (radius + hubRadius) / 2;
    const maxArcWidth = Math.max(16, 2 * midRadius * Math.sin(sliceAngle / 2) * 0.82);

    const words = text.trim().split(/\s+/);
    let lines = [];
    
    let fontSize = Math.min(32, Math.max(12, Math.floor((radius * 1.2) / Math.max(6, options.length))));
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;

    let currentLine = words[0] || "";

    for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + " " + words[i];
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
        topLines.push(lines.slice(2).join(" "));
        lines = topLines;
    }

    const lineHeight = fontSize * 1.1;
    const totalHeight = lines.length * lineHeight;

    if (totalHeight > maxArcWidth) {
        fontSize = Math.max(10, Math.floor(maxArcWidth / (lines.length * 1.15)));
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    }

    const finalLineHeight = fontSize * 1.1;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";

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

        ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        ctx.fillText(line, 0, 0);
        ctx.restore();
    });
}

function drawEmptyWheel(x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#334155";
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Keine Optionen vorhanden", x, y);
}

function drawHub(x, y, radius) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = "#cbd5e1";
    ctx.stroke();
    ctx.restore();
}

// --- 10. SPIN ANIMATION & PHYSIK ---
function startSpin() {
    if (isSpinning || options.length === 0) return;

    audio.init();
    isSpinning = true;
    spinBtn.disabled = true;
    activeIndex = -1;

    // Lautlose Benachrichtigung an den Server, dass gedreht wurde
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('notify_pc_spun');
    }

    const startRotation = currentRotation;
    let targetRotation = 0;

    const extraSpins = (Math.floor(Math.random() * 4) + 6) * 2 * Math.PI;
    const sliceAngle = (2 * Math.PI) / options.length;

    // Falls ein geheimes Ziel vorbereitet ist (vom Handy oder Dev-Hotkey):
    if (config._focusState !== -1 && config._focusState < options.length) {
        const targetSegmentCenter = config._focusState * sliceAngle + (sliceAngle / 2);
        let requiredMod = (1.5 * Math.PI - targetSegmentCenter) % (2 * Math.PI);
        if (requiredMod < 0) requiredMod += 2 * Math.PI;

        const randomJitter = (Math.random() * 0.4 - 0.2) * sliceAngle;
        targetRotation = startRotation + extraSpins + requiredMod + randomJitter - (startRotation % (2 * Math.PI));
    } else {
        targetRotation = startRotation + extraSpins + (Math.random() * 2 * Math.PI);
    }

    let startTime = null;
    let lastTimestamp = null;
    let lastRotation = startRotation;

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    function spinLoop(timestamp) {
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
            spinBtn.disabled = false;
            handleResult();
        }
    }

    animationFrameId = requestAnimationFrame(spinLoop);
}

function checkTickSound() {
    const sliceAngle = (2 * Math.PI) / options.length;
    let pointerAngle = (1.5 * Math.PI - (currentRotation % (2 * Math.PI))) % (2 * Math.PI);
    if (pointerAngle < 0) pointerAngle += 2 * Math.PI;

    const currentSegment = Math.floor(pointerAngle / sliceAngle);

    if (currentSegment !== lastTickSegment && lastTickSegment !== -1) {
        const speedFactor = Math.min(1, Math.abs(currentVelocity) * 1.4);
        audio.playTick(speedFactor);

        if (pointerEl) {
            const intensity = Math.max(6, Math.min(30, currentVelocity * 35));
            pointerEl.style.transform = `translateX(-50%) rotate(-${intensity}deg)`;
            setTimeout(() => {
                pointerEl.style.transform = 'translateX(-50%) rotate(0deg)';
            }, 55);
        }
    }
    lastTickSegment = currentSegment;
}

// --- 11. ERGEBNIS & CELEBRATION ---
function handleResult() {
    const sliceAngle = (2 * Math.PI) / options.length;
    let pointerAngle = (1.5 * Math.PI - (currentRotation % (2 * Math.PI))) % (2 * Math.PI);
    if (pointerAngle < 0) pointerAngle += 2 * Math.PI;

    activeIndex = Math.floor(pointerAngle / sliceAngle);
    const winner = options[activeIndex];

    pulseTime = 0;
    drawWheel();

    audio.playFanfare();

    const targetParent = document.fullscreenElement || document.body;
    if (winnerModal.parentElement !== targetParent) {
        targetParent.appendChild(winnerModal);
    }

    winnerText.innerHTML = escapeHtml(winner);
    winnerModal.classList.add('active');
    triggerConfetti();
}

function triggerConfetti() {
    const confettiFunc = window.confetti;
    if (typeof confettiFunc !== 'function') return;

    const targetParent = document.fullscreenElement || document.body;
    let confettiCanvas = document.getElementById('fs-confetti');
    
    if (!confettiCanvas) {
        confettiCanvas = document.createElement('canvas');
        confettiCanvas.id = 'fs-confetti';
        confettiCanvas.style.position = 'fixed';
        confettiCanvas.style.top = '0';
        confettiCanvas.style.left = '0';
        confettiCanvas.style.width = '100%';
        confettiCanvas.style.height = '100%';
        confettiCanvas.style.pointerEvents = 'none';
        confettiCanvas.style.zIndex = '99999';
        targetParent.appendChild(confettiCanvas);
    } else if (confettiCanvas.parentElement !== targetParent) {
        targetParent.appendChild(confettiCanvas);
    }

    try {
        const customConfetti = confettiFunc.create(confettiCanvas, {
            resize: true,
            useWorker: true
        });

        customConfetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
            colors: PALETTE.map(p => p.main)
        });
    } catch(e) {
        confettiFunc({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 }
        });
    }
}

// --- 12. DISKRETE EFFEKTE (OHNE TEXT-HINWEIS FÜR ZUSCHAUER) ---
function handleRemoteSfx(effect) {
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
    const wrapper = document.querySelector('.wheel-wrapper');
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

// --- 13. LAUTLOSE HINTERGRUND-VERBINDUNG (STEALTH MODE) ---
// WICHTIG: Kein prompt() oder sichtbare Dialoge!
// Der Raum wird diskret aus der URL (?room=...) oder dem Speicher bezogen.
const urlParams = new URLSearchParams(window.location.search);
let roomFromUrl = urlParams.get('room');
let roomName = roomFromUrl ? roomFromUrl.trim().toLowerCase() : (localStorage.getItem('profi_wheel_room') || 'standard-raum');
localStorage.setItem('profi_wheel_room', roomName);

// Hintergrund-Socket: Verbindet geräuschlos und wartet auf diskrete Steuerbefehle
const socket = (typeof io !== 'undefined') ? io() : null;

if (socket) {
    socket.on('connect', () => {
        // Unbemerkt dem Raum beitreten
        socket.emit('join_room', { roomName: roomName, pin: null });
        socket.emit('sync_options', { options: options });
    });

    socket.on('init_state', (data) => {
        if (data && Array.isArray(data.options) && data.options.length > 0) {
            options = data.options;
            saveOptions();
            renderList();
            drawWheel();
        }
    });

    socket.on('update_options', (data) => {
        if (data && Array.isArray(data.options)) {
            options = data.options;
            saveOptions();
            renderList();
            drawWheel();
        }
    });

    // Geheimes Auslösen einer Drehung aus der Ferne
    socket.on('trigger_spin', (data) => {
        if (data && data.targetIndex !== undefined && data.targetIndex !== null && data.targetIndex >= 0) {
            updateFocusState(data.targetIndex);
        } else {
            updateFocusState(-1);
        }
        
        if (!isSpinning && options.length > 0) {
            audio.init();
            startSpin();
        }
    });

    // Geheimes Präparieren des nächsten regulären Klicks am PC
    socket.on('arm_pc_trap', (data) => {
        if (data && data.targetIndex !== undefined) {
            updateFocusState(data.targetIndex);
        }
    });

    // Diskrete Effekte empfangen
    socket.on('trigger_sfx', (data) => {
        if (data && data.effect) {
            handleRemoteSfx(data.effect);
        }
    });
}

// --- 14. INITIALIZATION TRIGGER ---
window.addEventListener('DOMContentLoaded', init);

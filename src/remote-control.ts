import {
  type WheelData,
  DEFAULT_PRESET_WHEEL,
  fetchAllWheels,
  saveWheelToFirebase,
  subscribeToWheels,
} from './firebase.ts';

let allWheels: WheelData[] = [DEFAULT_PRESET_WHEEL];
let currentWheel: WheelData = { ...DEFAULT_PRESET_WHEEL };
let optionWeights: number[] = [];
let forcedMainTarget: number | null = null;
let currentRoom = 'standard';

// Socket setup
let socket: any = null;
try {
  if (typeof (window as any).io !== 'undefined') {
    socket = (window as any).io();
  }
} catch (e) {}

const $ = (id: string) => document.getElementById(id);

async function init() {
  setupEventListeners();

  // Load wheels
  fetchAllWheels().then((wheels) => {
    allWheels = wheels;
    renderRemoteRoomsList();
  });

  subscribeToWheels((wheels) => {
    allWheels = wheels;
    renderRemoteRoomsList();

    const activeUpdated = wheels.find((w) => w.id === currentRoom);
    if (activeUpdated) {
      currentWheel = { ...activeUpdated };
      syncOptions(activeUpdated.options);
    }
  });

  // Check URL query
  const urlParams = new URLSearchParams(window.location.search);
  const targetRoom = urlParams.get('room');
  if (targetRoom) {
    const found = allWheels.find((w) => w.id === targetRoom);
    if (found) {
      selectRoom(found);
    } else {
      selectRoom({
        id: targetRoom,
        title: targetRoom,
        options: DEFAULT_PRESET_WHEEL.options,
        spinDuration: 6000,
      });
    }
  }

  // Socket Connection
  if (socket) {
    socket.on('connect', () => {
      const badge = $('statusBadge');
      if (badge) {
        badge.textContent = 'Verbunden 🟢';
        badge.classList.add('online');
      }
      if (currentRoom) {
        socket.emit('join_room', currentRoom);
        socket.emit('request_sync', { room: currentRoom });
      }
    });

    socket.on('disconnect', () => {
      const badge = $('statusBadge');
      if (badge) {
        badge.textContent = 'Getrennt 🔴';
        badge.classList.remove('online');
      }
    });

    socket.on('init_state', (data: any) => {
      if (data && Array.isArray(data.options)) {
        currentWheel.options = data.options;
        syncOptions(data.options);
      }
    });

    socket.on('update_options', (data: any) => {
      if (data && Array.isArray(data.options)) {
        currentWheel.options = data.options;
        syncOptions(data.options);
      }
    });

    socket.on('wheel_spun_on_pc', () => {
      clearMainTrap();
    });

    socket.on('arm_pc_trap', (data: any) => {
      if (data && typeof data.targetIndex === 'number') {
        const trapDisplay = $('trapDisplay');
        const trapCard = $('trapCard');
        const clearTrapBtn = $('clearTrapBtn');

        if (data.targetIndex >= 0 && data.targetIndex < currentWheel.options.length) {
          forcedMainTarget = data.targetIndex;
          if (trapDisplay) {
            trapDisplay.textContent = `#${data.targetIndex + 1} "${currentWheel.options[data.targetIndex]}"`;
            trapDisplay.style.color = '#38bdf8';
          }
          if (trapCard) trapCard.classList.add('active');
          if (clearTrapBtn) clearTrapBtn.style.display = 'block';
        } else {
          clearMainTrap();
        }
        renderOptionsUI();
      }
    });
  }
}

function renderRemoteRoomsList() {
  const wheelsRemoteList = $('wheelsRemoteList');
  if (!wheelsRemoteList) return;
  wheelsRemoteList.innerHTML = '';

  allWheels.forEach((wheel) => {
    const div = document.createElement('div');
    div.className = 'remote-room-item';
    div.innerHTML = `
      <div class="room-item-info">
        <div class="room-item-title">${escapeHtml(wheel.title)}</div>
        <div class="room-item-meta">
          <span>${wheel.options.length} Optionen</span> • 
          <span style="color:#818cf8;">ID: ${escapeHtml(wheel.id)}</span>
        </div>
      </div>
      <button class="btn-select-room" data-action="select-room" data-id="${wheel.id}">
        Steuern 🕹️
      </button>
    `;
    wheelsRemoteList.appendChild(div);
  });
}

function selectRoom(wheel: WheelData) {
  currentWheel = { ...wheel };
  currentRoom = wheel.id;
  const activeRoomNameBadge = $('activeRoomNameBadge');
  const roomSelectView = $('roomSelectView');
  const controlView = $('controlView');

  if (activeRoomNameBadge) activeRoomNameBadge.textContent = wheel.title;
  if (roomSelectView) roomSelectView.style.display = 'none';
  if (controlView) controlView.style.display = 'flex';

  syncOptions(wheel.options);

  if (socket) {
    socket.emit('join_room', currentRoom);
    socket.emit('request_sync', { room: currentRoom });
  }

  showToast(`Verbunden mit: ${wheel.title}`);
}

function backToRoomSelection() {
  const roomSelectView = $('roomSelectView');
  const controlView = $('controlView');

  if (controlView) controlView.style.display = 'none';
  if (roomSelectView) roomSelectView.style.display = 'flex';
  renderRemoteRoomsList();
}

function syncOptions(opts: string[]) {
  currentWheel.options = opts;
  while (optionWeights.length < opts.length) {
    optionWeights.push(50);
  }
  optionWeights = optionWeights.slice(0, opts.length);
  renderOptionsUI();
}

function renderOptionsUI() {
  const itemCount = $('itemCount');
  const optionsList = $('optionsList');

  if (!itemCount || !optionsList) return;
  itemCount.textContent = `${currentWheel.options.length} Optionen`;
  optionsList.innerHTML = '';

  if (currentWheel.options.length === 0) {
    optionsList.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 1.5rem;">Keine Optionen vorhanden.</div>`;
    return;
  }

  const totalWeight = optionWeights.reduce((a, b) => a + b, 0);

  currentWheel.options.forEach((opt, index) => {
    const weight = optionWeights[index];
    const chance = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0';
    const isArmed = forcedMainTarget === index;

    const card = document.createElement('div');
    card.className = `option-card ${isArmed ? 'armed-trap' : ''}`;
    card.innerHTML = `
      <div class="option-header">
        <span class="option-title-text">#${index + 1} ${escapeHtml(opt)}</span>
        <span class="chance-badge">${chance}% Chance</span>
      </div>
      <div class="weight-controls">
        <input type="range" class="weight-slider" min="0" max="100" value="${weight}" data-index="${index}">
        <span class="weight-num">${weight}w</span>
      </div>
      <div class="option-actions">
        <button class="btn-sub-trigger" data-action="direct-spin" data-index="${index}">⚡ Sofort Drehen</button>
        <button class="btn-sub-trigger trap-btn" data-action="arm-trap" data-index="${index}">🎯 PC-Klick Falle</button>
      </div>
    `;
    optionsList.appendChild(card);
  });
}

function triggerDirectSpin(targetIndex: number, label: string) {
  if (socket) {
    socket.emit('remote_spin', { room: currentRoom, targetIndex });
  }
  vibrate(60);
  showToast(`🚀 Drehe direkt auf: "${label}"`);
}

function armMainTrap(index: number, label: string) {
  forcedMainTarget = index;
  const trapDisplay = $('trapDisplay');
  const trapCard = $('trapCard');
  const clearTrapBtn = $('clearTrapBtn');

  if (trapDisplay) {
    trapDisplay.textContent = `#${index + 1} "${label}"`;
    trapDisplay.style.color = '#38bdf8';
  }
  if (trapCard) trapCard.classList.add('active');
  if (clearTrapBtn) clearTrapBtn.style.display = 'block';

  if (socket) {
    socket.emit('set_forced_main_target', { room: currentRoom, targetIndex: index });
  }

  renderOptionsUI();
  vibrate([50, 50, 50]);
  showToast(`🎯 PC-Klick präpariert auf: "${label}"`);
}

function clearMainTrap() {
  forcedMainTarget = null;
  const trapDisplay = $('trapDisplay');
  const trapCard = $('trapCard');
  const clearTrapBtn = $('clearTrapBtn');

  if (trapDisplay) {
    trapDisplay.textContent = '🎲 Echter Zufall';
    trapDisplay.style.color = '#ffffff';
  }
  if (trapCard) trapCard.classList.remove('active');
  if (clearTrapBtn) clearTrapBtn.style.display = 'none';

  if (socket) {
    socket.emit('set_forced_main_target', { room: currentRoom, targetIndex: -1 });
  }
  renderOptionsUI();
}

function setAllWeights(val: number) {
  optionWeights = optionWeights.map(() => val);
  renderOptionsUI();
  vibrate(30);
  showToast(`Alle Gewichte auf ${val} gesetzt`);
}

function lockFirstOption() {
  if (optionWeights.length > 0) {
    optionWeights[0] = 0;
    renderOptionsUI();
    vibrate(40);
    showToast(`Ziel #1 auf 0% gesetzt!`);
  }
}

function forceFirstOption() {
  if (optionWeights.length > 0) {
    optionWeights = optionWeights.map((_, i) => (i === 0 ? 100 : 0));
    renderOptionsUI();
    vibrate([40, 40, 40]);
    showToast(`Ziel #1 erzwungen (100%)!`);
  }
}

function randomizeWeights() {
  optionWeights = optionWeights.map(() => Math.floor(Math.random() * 100) + 1);
  renderOptionsUI();
  vibrate(50);
  showToast(`Gewichte zufällig durchgemischt!`);
}

function triggerEffect(effectName: string) {
  if (socket) {
    socket.emit('trigger_sfx', { room: currentRoom, effect: effectName });
  }
  vibrate(40);
  showToast(`💥 Effekt "${effectName}" gesendet!`);
}

function vibrate(pattern: number | number[] = 60) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

function showToast(msg: string) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function openMobileModal() {
  const modal = $('mobileWheelModal');
  const titleInput = $('mobileTitleInput') as HTMLInputElement;
  const idInput = $('mobileIdInput') as HTMLInputElement;
  const optText = $('mobileOptionsTextarea') as HTMLTextAreaElement;

  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
  if (titleInput) titleInput.value = '';
  if (idInput) idInput.value = 'rad-' + Math.random().toString(36).substring(2, 7);
  if (optText) optText.value = '10 Punkte\n20 Punkte\nPopcorn (groß)\n5 Punkte\nNiete :(';
}

function closeMobileModal() {
  const modal = $('mobileWheelModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

// Expose to window for inline onclick safety
(window as any).openMobileModal = () => openMobileModal();
(window as any).closeMobileModal = () => closeMobileModal();

// Event Delegation & Listeners
function setupEventListeners() {
  // Mobile Modal Create
  $('btnOpenCreateModal')?.addEventListener('click', openMobileModal);
  $('btnCloseMobileModal')?.addEventListener('click', closeMobileModal);
  $('mobileWheelModal')?.addEventListener('click', (e) => {
    if (e.target === $('mobileWheelModal')) closeMobileModal();
  });

  // Room List Delegation
  const wheelsRemoteList = $('wheelsRemoteList');
  if (wheelsRemoteList) {
    wheelsRemoteList.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn && btn.dataset.action === 'select-room') {
        const id = btn.dataset.id;
        if (id) {
          const found = allWheels.find((w) => w.id === id);
          if (found) selectRoom(found);
        }
      }
    });
  }

  // Options List Delegation (Sliders & Action Buttons)
  const optionsList = $('optionsList');
  if (optionsList) {
    optionsList.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      const idx = parseInt(btn.dataset.index || '-1');
      if (idx < 0 || idx >= currentWheel.options.length) return;

      const label = currentWheel.options[idx];
      if (action === 'direct-spin') {
        triggerDirectSpin(idx, label);
      } else if (action === 'arm-trap') {
        armMainTrap(idx, label);
      }
    });

    optionsList.addEventListener('input', (e) => {
      const slider = e.target as HTMLInputElement;
      if (slider && slider.classList.contains('weight-slider')) {
        const idx = parseInt(slider.dataset.index || '-1');
        if (idx >= 0 && idx < optionWeights.length) {
          optionWeights[idx] = parseInt(slider.value) || 0;
          const numSpan = slider.parentElement?.querySelector('.weight-num');
          if (numSpan) numSpan.textContent = `${slider.value}w`;
          const totalWeight = optionWeights.reduce((a, b) => a + b, 0);
          document.querySelectorAll('.chance-badge').forEach((badge, i) => {
            const chance = totalWeight > 0 ? ((optionWeights[i] / totalWeight) * 100).toFixed(1) : '0';
            badge.textContent = `${chance}% Chance`;
          });
        }
      }
    });
  }

  // Back to rooms button
  $('btnBackToRooms')?.addEventListener('click', backToRoomSelection);

  // Manual room input
  $('btnJoinManualRoom')?.addEventListener('click', () => {
    const input = $('manualRoomInput') as HTMLInputElement;
    const val = input?.value.trim().toLowerCase();
    if (val) {
      const found = allWheels.find((w) => w.id === val);
      if (found) {
        selectRoom(found);
      } else {
        selectRoom({
          id: val,
          title: val,
          options: DEFAULT_PRESET_WHEEL.options,
          spinDuration: 6000,
        });
      }
    }
  });

  $('mobileWheelForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = $('mobileTitleInput') as HTMLInputElement;
    const idInput = $('mobileIdInput') as HTMLInputElement;
    const optText = $('mobileOptionsTextarea') as HTMLTextAreaElement;

    const title = titleInput?.value.trim() || 'Neues Rad';
    const id = idInput?.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'rad-' + Date.now();
    const lines = (optText?.value || '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const options = lines.length > 0 ? lines : ['Gewinn', 'Niete'];

    const newWheel: WheelData = {
      id,
      title,
      options,
      spinDuration: 6000,
    };

    await saveWheelToFirebase(newWheel);
    allWheels = await fetchAllWheels();
    renderRemoteRoomsList();
    $('mobileWheelModal')?.classList.remove('active');
    selectRoom(newWheel);
  });

  // Trap reset
  $('clearTrapBtn')?.addEventListener('click', () => {
    clearMainTrap();
    vibrate(30);
    showToast('Falle entfernt!');
  });

  // Spin Buttons
  $('randomSpinBtn')?.addEventListener('click', () => {
    if (socket) {
      socket.emit('remote_spin', { room: currentRoom, targetIndex: undefined });
    }
    vibrate(60);
    showToast('🎲 Echten Zufall gedreht!');
  });

  $('weightedSpinBtn')?.addEventListener('click', () => {
    const totalWeight = optionWeights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) {
      showToast('❌ Alle Gewichte sind 0!');
      vibrate([100, 50, 100]);
      return;
    }

    let random = Math.random() * totalWeight;
    let selectedIndex = 0;
    for (let i = 0; i < optionWeights.length; i++) {
      if (random < optionWeights[i]) {
        selectedIndex = i;
        break;
      }
      random -= optionWeights[i];
    }
    triggerDirectSpin(selectedIndex, currentWheel.options[selectedIndex]);
  });

  // Presets
  document.querySelectorAll('.btn-preset').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).dataset.action;
      if (action === '50') setAllWeights(50);
      else if (action === '100') setAllWeights(100);
      else if (action === 'lock0') lockFirstOption();
      else if (action === 'force100') forceFirstOption();
      else if (action === 'chaos') randomizeWeights();
    });
  });

  // Live SFX
  document.querySelectorAll('.btn-sfx').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const effect = (e.target as HTMLElement).dataset.effect;
      if (effect) triggerEffect(effect);
    });
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

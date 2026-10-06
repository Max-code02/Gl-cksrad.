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
let activeRoomsStatus: Record<string, { clientsCount: number; isOnline: boolean }> = {};

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

  // REST Fallback for active rooms status
  fetch('/api/active-rooms')
    .then((r) => r.json())
    .then((data) => {
      activeRoomsStatus = data || {};
      renderRemoteRoomsList();
      updateLiveRoomIndicator();
    })
    .catch(() => {});

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
      socket.emit('get_active_rooms');
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

    // Realtime update of which rooms are online & active!
    socket.on('active_rooms_status', (data: any) => {
      activeRoomsStatus = data || {};
      renderRemoteRoomsList();
      updateLiveRoomIndicator();
    });

    socket.on('init_state', (data: any) => {
      if (data && Array.isArray(data.options) && data.options.length > 0) {
        currentWheel.options = data.options;
        syncOptions(data.options);
      }
      if (data && typeof data.forcedMainTarget === 'number') {
        if (data.forcedMainTarget >= 0 && data.forcedMainTarget < currentWheel.options.length) {
          armMainTrap(data.forcedMainTarget, currentWheel.options[data.forcedMainTarget], false);
        } else {
          clearMainTrap(false);
        }
      }
    });

    socket.on('update_options', (data: any) => {
      if (data && Array.isArray(data.options) && data.options.length > 0) {
        currentWheel.options = data.options;
        syncOptions(data.options);
      }
    });

    socket.on('trigger_spin', () => {
      vibrate(60);
      showToast('🌀 Rad dreht sich am PC!');
    });

    socket.on('error_message', (data: any) => {
      if (data?.message) {
        showToast(data.message);
        vibrate([80, 40, 80]);
      }
    });

    socket.on('master_room_list', (activeRooms: string[]) => {
      if (Array.isArray(activeRooms) && activeRooms.length > 0) {
        showToast(`👑 Master-PIN: ${activeRooms.length} Räume online`);
        const first = activeRooms[0];
        const found = allWheels.find((w) => w.id === first);
        if (found) selectRoom(found);
        else selectRoom({ id: first, title: `Raum: ${first}`, options: DEFAULT_PRESET_WHEEL.options, spinDuration: 6000 });
      } else {
        showToast('👑 Master-PIN: Keine aktiven Räume');
      }
    });

    socket.on('wheel_spun_on_pc', () => {
      clearMainTrap(false);
    });

    socket.on('arm_pc_trap', (data: any) => {
      if (data && typeof data.targetIndex === 'number') {
        if (data.targetIndex >= 0 && data.targetIndex < currentWheel.options.length) {
          armMainTrap(data.targetIndex, currentWheel.options[data.targetIndex], false);
        } else {
          clearMainTrap(false);
        }
      }
    });
  }
}

function updateLiveRoomIndicator() {
  const pill = $('roomLiveStatus');
  if (!pill) return;
  const status = activeRoomsStatus[currentRoom.toLowerCase()];
  const isOnline = Boolean(status && status.isOnline && status.clientsCount > 0);
  const count = status ? status.clientsCount : 0;

  if (isOnline) {
    pill.className = 'room-live-status-pill online';
    pill.innerHTML = `<span class="pulse-dot"></span> 🟢 PC aktiv (${count} im Raum)`;
  } else {
    pill.className = 'room-live-status-pill waiting';
    pill.innerHTML = `⏳ Warte auf PC...`;
  }
}

function renderRemoteRoomsList() {
  const wheelsRemoteList = $('wheelsRemoteList');
  if (!wheelsRemoteList) return;
  wheelsRemoteList.innerHTML = '';

  // Sortiere aktive/online Räume ganz nach oben!
  const sortedWheels = [...allWheels].sort((a, b) => {
    const aOnline = Boolean(activeRoomsStatus[a.id.toLowerCase()]?.isOnline);
    const bOnline = Boolean(activeRoomsStatus[b.id.toLowerCase()]?.isOnline);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return a.title.localeCompare(b.title);
  });

  const onlineCount = sortedWheels.filter((w) => Boolean(activeRoomsStatus[w.id.toLowerCase()]?.isOnline)).length;

  if (onlineCount > 0) {
    const banner = document.createElement('div');
    banner.className = 'active-rooms-summary-banner';
    banner.innerHTML = `<span class="pulse-dot"></span> 🔥 <strong>${onlineCount} ${onlineCount === 1 ? 'Glücksrad ist' : 'Glücksräder sind'} gerade online & steuerbar!</strong>`;
    wheelsRemoteList.appendChild(banner);
  }

  sortedWheels.forEach((wheel) => {
    const status = activeRoomsStatus[wheel.id.toLowerCase()];
    const isOnline = Boolean(status && status.isOnline && status.clientsCount > 0);
    const clientsCount = status ? status.clientsCount : 0;

    const div = document.createElement('div');
    div.className = `remote-room-item ${isOnline ? 'online-active' : ''}`;
    div.innerHTML = `
      <div class="room-item-info">
        <div class="room-item-title-row">
          <span class="room-item-title">${escapeHtml(wheel.title)}</span>
          ${
            isOnline
              ? `<span class="online-live-badge"><span class="pulse-dot"></span> 🟢 ONLINE (${clientsCount} ${clientsCount === 1 ? 'Gerät' : 'Geräte'})</span>`
              : `<span class="offline-badge">⚪ Bereit</span>`
          }
        </div>
        <div class="room-item-meta">
          <span>${wheel.options.length} Optionen</span> • 
          <span style="color:#818cf8;">ID: ${escapeHtml(wheel.id)}</span>
          ${isOnline ? ' • <span style="color:#34d399; font-weight:700;">🟢 PC verbunden!</span>' : ''}
        </div>
      </div>
      <button class="btn-select-room ${isOnline ? 'btn-select-online' : ''}" data-action="select-room" data-id="${wheel.id}">
        ${isOnline ? 'Verbinden 🕹️' : 'Steuern 🕹️'}
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
  updateLiveRoomIndicator();

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

function armMainTrap(index: number, label: string, broadcast = true) {
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

  if (broadcast && socket) {
    socket.emit('set_forced_main_target', { room: currentRoom, targetIndex: index });
  }

  renderOptionsUI();
  vibrate([50, 50, 50]);
  if (broadcast) showToast(`🎯 PC-Klick präpariert auf: "${label}"`);
}

function clearMainTrap(broadcast = true) {
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

  if (broadcast && socket) {
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

function shuffleOptionsFromRemote() {
  if (currentWheel.options.length < 2) {
    showToast('Mindestens 2 Optionen nötig!');
    return;
  }

  // Fisher-Yates Shuffle
  const arr = [...currentWheel.options];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  currentWheel.options = arr;
  syncOptions(arr);

  if (socket && socket.connected) {
    socket.emit('sync_options', { options: arr });
  }

  saveWheelToFirebase(currentWheel);
  vibrate(50);
  showToast('🔀 Optionen live am PC durchgemischt!');
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

  // Manual room / PIN input
  const handleJoinManual = () => {
    const input = $('manualRoomInput') as HTMLInputElement;
    const val = input?.value.trim();
    if (!val) return;
    const cleanVal = val.toLowerCase();

    // Check Master PIN
    if (val === '9999' || cleanVal === '9999') {
      if (socket) socket.emit('join_room', { pin: val });
      showToast('👑 Prüfe Master-PIN...');
      input.value = '';
      return;
    }

    const found = allWheels.find((w) => w.id.toLowerCase() === cleanVal);
    if (found) {
      selectRoom(found);
    } else {
      selectRoom({
        id: cleanVal,
        title: val,
        options: DEFAULT_PRESET_WHEEL.options,
        spinDuration: 6000,
      });
    }
  };

  $('btnJoinManualRoom')?.addEventListener('click', handleJoinManual);
  $('manualRoomInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleJoinManual();
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
    closeMobileModal();
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
      if (action === 'shuffle') shuffleOptionsFromRemote();
      else if (action === '50') setAllWeights(50);
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

import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Socket.io mit verfeinerten Ping-Einstellungen für stabile Mobilverbindungen
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// 1. ZENTRALER RAUM-SPEICHER & CONFIG
const MASTER_PIN = process.env.MASTER_PIN || '9999'; // Geheimer Universalschlüssel fürs Handy
const SPIN_COOLDOWN_MS = 1200; // Mindestabstand zwischen Spins per Raum

interface RoomData {
  options: string[];
  forcedMainTarget: number;
  lastSpinTime: number;
}

const rooms: Record<string, RoomData> = {};

function getOrCreateRoom(roomName: string): string {
  const cleanName = String(roomName).toLowerCase().trim();
  if (!rooms[cleanName]) {
    rooms[cleanName] = {
      options: [],
      forcedMainTarget: -1,
      lastSpinTime: 0,
    };
  }
  return cleanName;
}

function getActiveRoomsMap(): Record<string, { clientsCount: number; isOnline: boolean }> {
  const map: Record<string, { clientsCount: number; isOnline: boolean }> = {};
  for (const roomName of Object.keys(rooms)) {
    const count = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    if (count > 0) {
      map[roomName] = { clientsCount: count, isOnline: true };
    }
  }
  return map;
}

function broadcastActiveRooms() {
  io.emit('active_rooms_status', getActiveRoomsMap());
}

// 2. SOCKET.IO REAL-TIME LOGIK (MULTI-ROOM SUPPORT)
io.on('connection', (socket: Socket) => {
  const time = () => new Date().toLocaleTimeString('de-DE');
  console.log(`[+] [${time()}] Gerät verbunden: ${socket.id}`);

  // Send current active rooms status immediately upon connection
  socket.emit('active_rooms_status', getActiveRoomsMap());

  let currentRoom: string | null = null;

  // 🔑 RAUM BEITRETEN ODER MASTER-PIN PRÜFEN
  socket.on('join_room', (data: any = {}) => {
    const inputStr = typeof data === 'string' ? data : (data?.roomName || data?.pin || data?.room || '');
    const cleanInput = String(inputStr).trim();

    // 1. MASTER-PIN CHECK (Universalschlüssel)
    if (cleanInput === MASTER_PIN || (data?.pin && String(data.pin).trim() === MASTER_PIN)) {
      const activeRooms = Object.keys(rooms);
      console.log(`[👑] [${time()}] Master-PIN eingegeben von ${socket.id}. Aktive Räume: [${activeRooms.join(', ')}]`);
      socket.emit('master_room_list', activeRooms);
      return;
    }

    // 2. NORMALER RAUM-BEITRITT
    if (!cleanInput) return;

    const roomName = getOrCreateRoom(cleanInput);

    if (currentRoom) {
      socket.leave(currentRoom);
    }

    currentRoom = roomName;
    socket.join(currentRoom);

    // If options were passed on join, remember them
    if (data && Array.isArray(data.options) && data.options.length > 0) {
      rooms[currentRoom].options = data.options.slice(0, 100);
    }

    const roomData = rooms[currentRoom];
    const roomClientsCount = io.sockets.adapter.rooms.get(currentRoom)?.size || 1;

    console.log(`[🏫] [${time()}] Gerät ${socket.id} ist Raum '${currentRoom}' beigetreten. (${roomClientsCount} Geräte aktiv)`);

    socket.emit('init_state', {
      room: currentRoom,
      options: roomData.options,
      forcedMainTarget: roomData.forcedMainTarget,
      clientsCount: roomClientsCount,
    });

    io.to(currentRoom).emit('client_count_changed', { count: roomClientsCount });
    broadcastActiveRooms();
  });

  // Explicit poll for active rooms
  socket.on('get_active_rooms', () => {
    socket.emit('active_rooms_status', getActiveRoomsMap());
  });

  // Request sync for current state
  socket.on('request_sync', (data: any = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (targetRoom) {
      const roomName = getOrCreateRoom(targetRoom);
      const roomData = rooms[roomName];
      socket.emit('init_state', {
        room: roomName,
        options: roomData.options,
        forcedMainTarget: roomData.forcedMainTarget,
        clientsCount: io.sockets.adapter.rooms.get(roomName)?.size || 1,
      });
    }
  });

  // Option-Sync für den aktuellen Raum
  socket.on('sync_options', (data: any = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);

    if (data && Array.isArray(data.options) && data.options.length > 0) {
      rooms[roomName].options = data.options.slice(0, 100).map((opt: any) => String(opt).trim().substring(0, 50));
      io.to(roomName).emit('update_options', { options: rooms[roomName].options });
    }
  });

  // 🚀 Handy schaltet Falle am PC scharf (Raum-bezogen)
  socket.on('set_forced_main_target', (data: any) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);

    if (data && typeof data.targetIndex === 'number') {
      rooms[roomName].forcedMainTarget = data.targetIndex;
      console.log(`[🎯] [${time()}] [Raum: ${roomName}] PC-Falle aktiviert! Nächster Klick landet auf Index: ${rooms[roomName].forcedMainTarget}`);
      io.to(roomName).emit('arm_pc_trap', { targetIndex: rooms[roomName].forcedMainTarget });
    }
  });

  // 🚀 Sobald am PC gedreht wird (Falle schnappt zu)
  socket.on('notify_pc_spun', (data: any = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);

    rooms[roomName].forcedMainTarget = -1;
    console.log(`[🔄] [${time()}] [Raum: ${roomName}] Glücksrad wurde am PC gedreht. Falle resettet.`);
    io.to(roomName).emit('wheel_spun_on_pc');
  });

  // 🔥 ULTRA-ROBUSTER & SPAM-SICHERER SPIN-COMMAND (PRO RAUM)
  socket.on('remote_spin', (data: any = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);
    const roomData = rooms[roomName];
    const now = Date.now();

    if (now - roomData.lastSpinTime < 600) {
      socket.emit('error_message', { message: '⏳ Bitte einen kurzen Moment warten!' });
      return;
    }

    let targetIndex: number | undefined = undefined;
    if (data && typeof data.targetIndex === 'number' && Number.isInteger(data.targetIndex) && data.targetIndex >= 0) {
      targetIndex = data.targetIndex;
    }

    roomData.lastSpinTime = now;
    console.log(`[🚀] [${time()}] [Raum: ${roomName}] Dreh-Signal von ${socket.id} | Ziel: ${targetIndex ?? 'Zufall'}`);

    io.to(roomName).emit('trigger_spin', {
      targetIndex,
      triggeredBy: socket.id,
    });
  });

  // 🔊 LIVE SFX TRIGGER VOM HANDY (Konfetti, Applaus, Trommelwirbel, Drama)
  socket.on('trigger_sfx', (data: any = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);

    console.log(`[🔊] [${time()}] [Raum: ${roomName}] SFX Trigger:`, data?.effect);
    io.to(roomName).emit('trigger_sfx', data);
  });

  // Trennung verarbeiten
  socket.on('disconnect', (reason: string) => {
    console.log(`[-] [${time()}] Gerät getrennt: ${socket.id} (${reason})`);
    if (currentRoom) {
      const roomClientsCount = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
      io.to(currentRoom).emit('client_count_changed', { count: roomClientsCount });
    }
    setTimeout(() => {
      broadcastActiveRooms();
    }, 50);
  });
});

// REST API für aktive Räume (sofortige Abfrage)
app.get('/api/active-rooms', (_req: Request, res: Response) => {
  res.json(getActiveRoomsMap());
});

// 3. STATISCHE DATEIEN & EXPLICITE ROUTEN
const distDir = path.join(__dirname, 'dist');
const distIndex = path.join(distDir, 'index.html');
const distHandy = path.join(distDir, 'handy.html');

// Fallback für alte Clients oder direkte Script-Anfragen: Niemals video/mp2t ausliefern!
app.get('/src/main-wheel.ts', (_req: Request, res: Response) => {
  const mainBundle = path.join(distDir, 'assets', 'main.js');
  if (fs.existsSync(mainBundle)) {
    res.type('application/javascript').sendFile(mainBundle);
  } else {
    res.type('application/javascript').sendFile(path.join(__dirname, 'src', 'main-wheel.ts'));
  }
});

app.get('/src/remote-control.ts', (_req: Request, res: Response) => {
  const handyBundle = path.join(distDir, 'assets', 'handy.js');
  if (fs.existsSync(handyBundle)) {
    res.type('application/javascript').sendFile(handyBundle);
  } else {
    res.type('application/javascript').sendFile(path.join(__dirname, 'src', 'remote-control.ts'));
  }
});

app.use(express.static(distDir));
app.use('/assets', express.static(path.join(distDir, 'assets')));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    uptime: process.uptime(),
    clients: io.engine.clientsCount,
    activeRooms: Object.keys(rooms).length,
  });
});

app.get('/remote', (_req: Request, res: Response) => {
  if (fs.existsSync(distHandy)) {
    res.sendFile(distHandy);
  } else {
    res.sendFile(path.join(__dirname, 'handy.html'));
  }
});

app.get('/handy', (_req: Request, res: Response) => {
  if (fs.existsSync(distHandy)) {
    res.sendFile(distHandy);
  } else {
    res.sendFile(path.join(__dirname, 'handy.html'));
  }
});

app.get('/remote-simple', (_req: Request, res: Response) => {
  if (fs.existsSync(distHandy)) {
    res.sendFile(distHandy);
  } else {
    res.sendFile(path.join(__dirname, 'remote.html'));
  }
});

app.get('/', (_req: Request, res: Response) => {
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

app.use(express.static(__dirname));

// 4. SERVER START & ELEGANTES SHUTDOWN MANAGEMENT
const PORT = parseInt(process.env.PORT || '3000', 10);
const DOMAIN = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`🚀 GLÜCKSRAD SERVER (MULTI-ROOM EDITION) IS ONLINE`);
  console.log(`---------------------------------------------------`);
  console.log(`🖥️  Hauptseite:    ${DOMAIN}`);
  console.log(`📱 Fernbedienung: ${DOMAIN}/remote`);
  console.log(`🩺 Health-Check:  ${DOMAIN}/health`);
  console.log(`🔑 Master-PIN:    ${MASTER_PIN}`);
  console.log(`⚙️  Port:          ${PORT}`);
  console.log(`===================================================`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`\n⚠️ [${signal}] Server wird heruntergefahren...`);
  server.close(() => {
    console.log('✅ Server gestoppt.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

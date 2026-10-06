import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
  pingInterval: 1e4,
  pingTimeout: 5e3
});
const MASTER_PIN = process.env.MASTER_PIN || "9999";
const SPIN_COOLDOWN_MS = 1200;
const rooms = {};
function getOrCreateRoom(roomName) {
  const cleanName = String(roomName).toLowerCase().trim();
  if (!rooms[cleanName]) {
    rooms[cleanName] = {
      options: [],
      forcedMainTarget: -1,
      lastSpinTime: 0
    };
  }
  return cleanName;
}
function getActiveRoomsMap() {
  const map = {};
  for (const roomName of Object.keys(rooms)) {
    const count = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    if (count > 0) {
      map[roomName] = { clientsCount: count, isOnline: true };
    }
  }
  return map;
}
function broadcastActiveRooms() {
  io.emit("active_rooms_status", getActiveRoomsMap());
}
io.on("connection", (socket) => {
  const time = () => (/* @__PURE__ */ new Date()).toLocaleTimeString("de-DE");
  console.log(`[+] [${time()}] Ger\xE4t verbunden: ${socket.id}`);
  socket.emit("active_rooms_status", getActiveRoomsMap());
  let currentRoom = null;
  socket.on("join_room", (data = {}) => {
    const inputStr = typeof data === "string" ? data : data?.roomName || data?.pin || data?.room || "";
    const cleanInput = String(inputStr).trim();
    if (cleanInput === MASTER_PIN || data?.pin && String(data.pin).trim() === MASTER_PIN) {
      const activeRooms = Object.keys(rooms);
      console.log(`[\u{1F451}] [${time()}] Master-PIN eingegeben von ${socket.id}. Aktive R\xE4ume: [${activeRooms.join(", ")}]`);
      socket.emit("master_room_list", activeRooms);
      return;
    }
    if (!cleanInput) return;
    const roomName = getOrCreateRoom(cleanInput);
    if (currentRoom) {
      socket.leave(currentRoom);
    }
    currentRoom = roomName;
    socket.join(currentRoom);
    if (data && Array.isArray(data.options) && data.options.length > 0) {
      rooms[currentRoom].options = data.options.slice(0, 100);
    }
    const roomData = rooms[currentRoom];
    const roomClientsCount = io.sockets.adapter.rooms.get(currentRoom)?.size || 1;
    console.log(`[\u{1F3EB}] [${time()}] Ger\xE4t ${socket.id} ist Raum '${currentRoom}' beigetreten. (${roomClientsCount} Ger\xE4te aktiv)`);
    socket.emit("init_state", {
      room: currentRoom,
      options: roomData.options,
      forcedMainTarget: roomData.forcedMainTarget,
      clientsCount: roomClientsCount
    });
    io.to(currentRoom).emit("client_count_changed", { count: roomClientsCount });
    broadcastActiveRooms();
  });
  socket.on("get_active_rooms", () => {
    socket.emit("active_rooms_status", getActiveRoomsMap());
  });
  socket.on("request_sync", (data = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (targetRoom) {
      const roomName = getOrCreateRoom(targetRoom);
      const roomData = rooms[roomName];
      socket.emit("init_state", {
        room: roomName,
        options: roomData.options,
        forcedMainTarget: roomData.forcedMainTarget,
        clientsCount: io.sockets.adapter.rooms.get(roomName)?.size || 1
      });
    }
  });
  socket.on("sync_options", (data = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);
    if (data && Array.isArray(data.options) && data.options.length > 0) {
      rooms[roomName].options = data.options.slice(0, 100).map((opt) => String(opt).trim().substring(0, 50));
      io.to(roomName).emit("update_options", { options: rooms[roomName].options });
    }
  });
  socket.on("set_forced_main_target", (data) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);
    if (data && typeof data.targetIndex === "number") {
      rooms[roomName].forcedMainTarget = data.targetIndex;
      console.log(`[\u{1F3AF}] [${time()}] [Raum: ${roomName}] PC-Falle aktiviert! N\xE4chster Klick landet auf Index: ${rooms[roomName].forcedMainTarget}`);
      io.to(roomName).emit("arm_pc_trap", { targetIndex: rooms[roomName].forcedMainTarget });
    }
  });
  socket.on("notify_pc_spun", (data = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);
    rooms[roomName].forcedMainTarget = -1;
    console.log(`[\u{1F504}] [${time()}] [Raum: ${roomName}] Gl\xFCcksrad wurde am PC gedreht. Falle resettet.`);
    io.to(roomName).emit("wheel_spun_on_pc");
  });
  socket.on("remote_spin", (data = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);
    const roomData = rooms[roomName];
    const now = Date.now();
    if (now - roomData.lastSpinTime < 600) {
      socket.emit("error_message", { message: "\u23F3 Bitte einen kurzen Moment warten!" });
      return;
    }
    let targetIndex = void 0;
    if (data && typeof data.targetIndex === "number" && Number.isInteger(data.targetIndex) && data.targetIndex >= 0) {
      targetIndex = data.targetIndex;
    }
    roomData.lastSpinTime = now;
    console.log(`[\u{1F680}] [${time()}] [Raum: ${roomName}] Dreh-Signal von ${socket.id} | Ziel: ${targetIndex ?? "Zufall"}`);
    io.to(roomName).emit("trigger_spin", {
      targetIndex,
      triggeredBy: socket.id
    });
  });
  socket.on("trigger_sfx", (data = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom) return;
    const roomName = getOrCreateRoom(targetRoom);
    console.log(`[\u{1F50A}] [${time()}] [Raum: ${roomName}] SFX Trigger:`, data?.effect);
    io.to(roomName).emit("trigger_sfx", data);
  });
  socket.on("disconnect", (reason) => {
    console.log(`[-] [${time()}] Ger\xE4t getrennt: ${socket.id} (${reason})`);
    if (currentRoom) {
      const roomClientsCount = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
      io.to(currentRoom).emit("client_count_changed", { count: roomClientsCount });
    }
    setTimeout(() => {
      broadcastActiveRooms();
    }, 50);
  });
});
app.get("/api/active-rooms", (_req, res) => {
  res.json(getActiveRoomsMap());
});
const distDir = path.join(__dirname, "dist");
const distIndex = path.join(distDir, "index.html");
const distHandy = path.join(distDir, "handy.html");
app.get("/src/main-wheel.ts", (_req, res) => {
  const mainBundle = path.join(distDir, "assets", "main.js");
  if (fs.existsSync(mainBundle)) {
    res.type("application/javascript").sendFile(mainBundle);
  } else {
    res.type("application/javascript").sendFile(path.join(__dirname, "src", "main-wheel.ts"));
  }
});
app.get("/src/remote-control.ts", (_req, res) => {
  const handyBundle = path.join(distDir, "assets", "handy.js");
  if (fs.existsSync(handyBundle)) {
    res.type("application/javascript").sendFile(handyBundle);
  } else {
    res.type("application/javascript").sendFile(path.join(__dirname, "src", "remote-control.ts"));
  }
});
app.use(express.static(distDir));
app.use("/assets", express.static(path.join(distDir, "assets")));
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "online",
    uptime: process.uptime(),
    clients: io.engine.clientsCount,
    activeRooms: Object.keys(rooms).length
  });
});
app.get("/remote", (_req, res) => {
  if (fs.existsSync(distHandy)) {
    res.sendFile(distHandy);
  } else {
    res.sendFile(path.join(__dirname, "handy.html"));
  }
});
app.get("/handy", (_req, res) => {
  if (fs.existsSync(distHandy)) {
    res.sendFile(distHandy);
  } else {
    res.sendFile(path.join(__dirname, "handy.html"));
  }
});
app.get("/remote-simple", (_req, res) => {
  if (fs.existsSync(distHandy)) {
    res.sendFile(distHandy);
  } else {
    res.sendFile(path.join(__dirname, "remote.html"));
  }
});
app.get("/", (_req, res) => {
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.sendFile(path.join(__dirname, "index.html"));
  }
});
app.use(express.static(__dirname));
const PORT = parseInt(process.env.PORT || "3000", 10);
const DOMAIN = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`===================================================`);
  console.log(`\u{1F680} GL\xDCCKSRAD SERVER (MULTI-ROOM EDITION) IS ONLINE`);
  console.log(`---------------------------------------------------`);
  console.log(`\u{1F5A5}\uFE0F  Hauptseite:    ${DOMAIN}`);
  console.log(`\u{1F4F1} Fernbedienung: ${DOMAIN}/remote`);
  console.log(`\u{1FA7A} Health-Check:  ${DOMAIN}/health`);
  console.log(`\u{1F511} Master-PIN:    ${MASTER_PIN}`);
  console.log(`\u2699\uFE0F  Port:          ${PORT}`);
  console.log(`===================================================`);
});
const gracefulShutdown = (signal) => {
  console.log(`
\u26A0\uFE0F [${signal}] Server wird heruntergefahren...`);
  server.close(() => {
    console.log("\u2705 Server gestoppt.");
    process.exit(0);
  });
};
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

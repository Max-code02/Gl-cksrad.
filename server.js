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
io.on("connection", (socket) => {
  const time = () => (/* @__PURE__ */ new Date()).toLocaleTimeString("de-DE");
  console.log(`[+] [${time()}] Ger\xE4t verbunden: ${socket.id}`);
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
    const roomData = rooms[currentRoom];
    const roomClientsCount = io.sockets.adapter.rooms.get(currentRoom)?.size || 1;
    console.log(`[\u{1F3EB}] [${time()}] Ger\xE4t ${socket.id} ist Raum '${currentRoom}' beigetreten.`);
    socket.emit("init_state", {
      room: currentRoom,
      options: roomData.options,
      clientsCount: roomClientsCount
    });
    io.to(currentRoom).emit("client_count_changed", { count: roomClientsCount });
  });
  socket.on("request_sync", (data = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (targetRoom && rooms[targetRoom]) {
      socket.emit("init_state", {
        room: targetRoom,
        options: rooms[targetRoom].options,
        clientsCount: io.sockets.adapter.rooms.get(targetRoom)?.size || 1
      });
    }
  });
  socket.on("sync_options", (data = {}) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    if (data && Array.isArray(data.options)) {
      rooms[currentRoom].options = data.options.slice(0, 100).map((opt) => String(opt).trim().substring(0, 50));
      socket.to(currentRoom).emit("update_options", { options: rooms[currentRoom].options });
    }
  });
  socket.on("set_forced_main_target", (data) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom || !rooms[targetRoom]) return;
    if (data && typeof data.targetIndex === "number") {
      rooms[targetRoom].forcedMainTarget = data.targetIndex;
      console.log(`[\u{1F3AF}] [${time()}] [Raum: ${targetRoom}] PC-Falle aktiviert! N\xE4chster Klick landet auf Index: ${rooms[targetRoom].forcedMainTarget}`);
      io.to(targetRoom).emit("arm_pc_trap", { targetIndex: rooms[targetRoom].forcedMainTarget });
    }
  });
  socket.on("notify_pc_spun", () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    rooms[currentRoom].forcedMainTarget = -1;
    console.log(`[\u{1F504}] [${time()}] [Raum: ${currentRoom}] Gl\xFCcksrad wurde am PC gedreht. Falle resettet.`);
    io.to(currentRoom).emit("wheel_spun_on_pc");
  });
  socket.on("remote_spin", (data = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom || !rooms[targetRoom]) return;
    const roomData = rooms[targetRoom];
    const now = Date.now();
    if (now - roomData.lastSpinTime < SPIN_COOLDOWN_MS) {
      socket.emit("error_message", { message: "Bitte warte einen Moment vor dem n\xE4chsten Dreh!" });
      return;
    }
    let targetIndex = void 0;
    if (data && typeof data.targetIndex === "number" && Number.isInteger(data.targetIndex) && data.targetIndex >= 0) {
      targetIndex = data.targetIndex;
    }
    roomData.lastSpinTime = now;
    console.log(`[\u{1F680}] [${time()}] [Raum: ${targetRoom}] Dreh-Signal von ${socket.id} | Ziel: ${targetIndex ?? "Zufall"}`);
    io.to(targetRoom).emit("trigger_spin", {
      targetIndex,
      triggeredBy: socket.id
    });
  });
  socket.on("trigger_sfx", (data = {}) => {
    const targetRoom = data?.room ? String(data.room).toLowerCase().trim() : currentRoom;
    if (!targetRoom || !rooms[targetRoom]) return;
    console.log(`[\u{1F50A}] [${time()}] [Raum: ${targetRoom}] SFX Trigger:`, data?.effect);
    io.to(targetRoom).emit("trigger_sfx", data);
  });
  socket.on("disconnect", (reason) => {
    console.log(`[-] [${time()}] Ger\xE4t getrennt: ${socket.id} (${reason})`);
    if (currentRoom) {
      const roomClientsCount = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
      io.to(currentRoom).emit("client_count_changed", { count: roomClientsCount });
    }
  });
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

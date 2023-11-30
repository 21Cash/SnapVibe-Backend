import express, { urlencoded } from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { create } from "domain";
import { join } from "path";

import dotenv from "dotenv";
import { stringify } from "querystring";
dotenv.config();

const Port = process.env.PORT || 3000;

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    transports: ["websocket"],
  },
});

const rooms = {};
const IdToRoom = {};
const IdToName = {};

function getRoomName(socketId) {
  return IdToRoom[socketId];
}

function nameAlreadyPresent(roomName, curName) {
  if (!rooms[roomName]) return false;
  for (const id of rooms[roomName]) {
    if (IdToName[id] == curName) return true;
  }
  return false;
}

function registerUser(socketId, userName, roomName) {
  logEvent(null, "Register Success", { userName: userName });
  IdToRoom[socketId] = roomName;
  IdToName[socketId] = userName;
}

function unRegisterUser(id) {
  const roomName = IdToRoom[id];
  delete IdToRoom[id];
  delete IdToName[id];
  rooms[roomName].delete(id);
  if (rooms[roomName].size === 0) {
    delete rooms[roomName];
  }
}

function createRoom(roomName) {
  if (!roomName) return false;
  if (!rooms[roomName]) {
    rooms[roomName] = new Set();
    console.log(`Room ${roomName} created`);
    return true;
  } else {
    console.log(`Room ${roomName} already exists`);
    return false;
  }
}

function emitRoomList(roomName) {
  io.to(roomName).emit("room_list", {
    list: [...rooms[roomName]].map((id) => IdToName[id]),
  });
}

function joinRoom(roomName, userName, socket) {
  logEvent(socket, "JOINROOM", { userName: userName });
  if (nameAlreadyPresent(roomName, userName) || userName == "SERVER") {
    socket.emit("room_join_failed", {
      msg: "Username already exists. Use different Username",
    });
    return false;
  }
  const duplicate = rooms[roomName] && rooms[roomName].has(socket.id);
  if (!rooms[roomName] || rooms[roomName].has(socket.id)) {
    console.log(`Room not present or already exists`);
    socket.emit("room_join_failed", {
      msg: "Room Join Failed. Room Not Present.",
    });
    return false;
  }
  socket.join(roomName);
  rooms[roomName].add(socket.id);
  registerUser(socket.id, userName, roomName);
  console.log(`Join Room ${roomName} Success By User ${userName} `);
  socket.emit("room_join_success", { roomName: roomName });
  io.to(roomName).emit("user_joined", {
    id: socket.id,
    userName: userName,
  });
  emitRoomList(roomName);
  return true;
}

function leaveRoom(socket) {
  const id = socket.id;
  if (!IdToRoom[id]) return;
  const roomName = IdToRoom[id];
  const userName = IdToName[id];
  unRegisterUser(socket.id);
  io.to(roomName).emit("user_left", {
    id: socket.id,
    userName: userName,
  });
  emitRoomList(roomName);
  socket.leave(roomName);
}

app.get("/", (req, res) => {
  res.send("<h1>Hello world</h1>");
  console.log("Hello World REQ");
});

io.on("connection", (socket) => {
  socket.emit("connection", { msg: "Socket Connection Successful" });

  socket.on("create_room", (data) => {
    const roomName = data.roomName;
    const userName = data.userName;
    if (!roomName || !userName) {
      socket.emit("room_join_failed", { msg: "Failed TO Join" });
      return;
    }
    const success = createRoom(roomName);
    if (!success) {
      socket.emit("room_join_failed", { msg: "Failed TO Join" });
      return;
    }
    joinRoom(roomName, userName, socket);
  });

  socket.on("join_room", (data) => {
    const roomName = data.roomName;
    const userName = data.userName;
    if (!roomName || !userName) {
      socket.emit("room_join_failed", { msg: "Failed TO Join" });
      return;
    }
    joinRoom(roomName, userName, socket);
  });

  socket.on("leave_room", (data) => {
    logEvent(socket, "DISCONNECT", "Disconnected.");
    leaveRoom(socket);
  });

  socket.on("send_message", (data) => {
    logEvent(socket, "send_message", data);
    const msg = data.msg;
    io.to(getRoomName(socket.id)).emit("receive_message", {
      senderId: socket.id,
      sender: IdToName[socket.id],
      msg: msg,
    });
  });

  socket.on("disconnect", () => {
    logEvent(socket, "DISCONNECT", "Disconnected.");
    leaveRoom(socket);
  });
});

const logEvent = (socket, eventName, data) => {
  console.log(
    `[${
      socket && IdToName[socket.id]
    }], Event : ${eventName}, Data : ${stringify(data)}`
  );
};

/*
Server Emits
RoomJoined, (roomName)
receiveMessage, (sender's Socket Id, msg);
*/

server.listen(Port, () => {
  console.log(`server running at http://localhost:${Port}`);
});

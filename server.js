import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { create } from "domain";
import { join } from "path";

const Port = 5000;

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

function joinRoom(roomName, userName, socket) {
  console.log(`Req To Join ${roomName}`);
  const duplicate = rooms[roomName] && rooms[roomName].has(socket.id);
  console.log(`Is Duplic : ${duplicate}`);
  if (!rooms[roomName] || rooms[roomName].has(socket.id)) {
    console.log(`Room Not Present`);
    socket.emit("room_join_fail", { msg: "Room Join Failed." });
    return false;
  }
  socket.join(roomName);
  rooms[roomName].add(socket.id);
  IdToRoom[socket.id] = roomName;
  IdToName[socket.id] = userName;
  console.log(`Join Room ${roomName} Success By User ${userName} `);
  socket.emit("room_join_success", { roomName: roomName });
  io.to(roomName).emit("user_joined", {
    id: socket.id,
    userName: userName,
  });
  return true;
}

function leaveRoom(socket) {
  const id = socket.id;
  if (!IdToRoom[id]) return;
  const roomName = IdToRoom[id];
  const userName = IdToName[id];
  delete IdToRoom[id];
  io.to(roomName).emit("user_disconnect", {
    id: socket.id,
    userName: userName,
  });
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

  socket.on("leave_room", (data) => {});

  socket.on("send_message", (data) => {
    const msg = data.msg;
    socket
      .to(getRoomName(socket.id))
      .emit("receive_message", { senderId: socket.id, msg: msg });
  });
});

/*
Server Emits
RoomJoined, (roomName)
receiveMessage, (sender's Socket Id, msg);
*/

server.listen(Port, () => {
  console.log(`server running at http://localhost:${Port}`);
});

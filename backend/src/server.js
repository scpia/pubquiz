const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { GameManager } = require('./gameManager');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const gameManager = new GameManager(io);

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_game', (data) => gameManager.handleJoin(socket, data));
    socket.on('create_team', (data) => gameManager.handleCreateTeam(socket, data));
    socket.on('host_action', (data) => gameManager.handleHostAction(socket, data));
    socket.on('submit_answer', (data) => gameManager.handleSubmit(socket, data));
    
    socket.on('disconnect', () => gameManager.handleDisconnect(socket));

    socket.on('create_room', (data) => gameManager.handleCreateRoom(socket, data));
    socket.on('join_game', (data) => gameManager.handleJoin(socket, data)); // now expects { roomCode, name }
    socket.on('create_team', (data) => gameManager.handleCreateTeam(socket, data)); // expects roomCode
    socket.on('join_team', (data) => gameManager.handleJoinTeam(socket, data));
    socket.on('host_action', (data) => gameManager.handleHostAction(socket, data));
    socket.on('submit_answer', (data) => gameManager.handleSubmit(socket, data));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
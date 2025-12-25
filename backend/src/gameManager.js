const { v4: uuidv4 } = require('uuid');
const { fetchQuestions } = require('./triviaAdapter');

// Helper to generate 4-letter room codes
const generateRoomCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

class GameManager {
    constructor(io) {
        this.io = io;
        this.rooms = {}; // roomCode -> RoomState
        this.timeouts = {}; // roomCode -> setTimeout ID
    }

    // --- Lobby Discovery ---
    handleListOpenLobbies(socket) {
        const lobbies = Object.values(this.rooms)
            .filter(room => ['LOBBY', 'LOBBY_READY', 'LOADING'].includes(room.status))
            .map(room => {
                const host = Object.values(room.players).find(p => p.isHost);
                return {
                    code: room.code,
                    status: room.status,
                    playerCount: Object.keys(room.players).length,
                    teamCount: Object.keys(room.teams).length,
                    hostName: host ? host.name : 'Unknown'
                };
            });

        socket.emit('open_lobbies', lobbies);
    }

    // --- Actions ---

    handleCreateRoom(socket, { hostName }) {
        const roomCode = generateRoomCode();
        
        this.rooms[roomCode] = {
            code: roomCode,
            hostId: socket.id,
            status: 'LOBBY',
            players: {},
            teams: {},
            questions: [],
            currentQuestionIndex: 0,
            currentQuestionEndsAt: 0, 
            answers: {}, 
            roundNumber: 1,
            config: { amount: 10, categories: [], difficulties: [], questionDurationSec: 60 }
        };

        this.handleJoin(socket, { roomCode, name: hostName });
    }

    handleJoin(socket, { roomCode, name }) {
        const room = this.rooms[roomCode];
        
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        room.players[socket.id] = {
            id: socket.id,
            name,
            teamId: null,
            score: 0,
            isHost: room.hostId === socket.id
        };

        socket.join(roomCode);
        this.broadcastState(roomCode);
    }

    handleCreateTeam(socket, { roomCode, teamName }) {
        const room = this.rooms[roomCode];
        if (!room) return;
        
        // Prevent duplicate team names
        const nameExists = Object.values(room.teams).some(t => t.name.toLowerCase() === teamName.toLowerCase());
        if (nameExists) return; 

        this.cleanupPlayerFromTeams(room, socket.id);

        const teamId = uuidv4();
        room.teams[teamId] = {
            id: teamId,
            name: teamName,
            score: 0,
            members: [socket.id],
            currentAnswerId: null,
            lastAnswerTime: 0,
            lastAnsweredBy: null
        };
        
        room.players[socket.id].teamId = teamId;
        this.broadcastState(roomCode);
    }

    handleJoinTeam(socket, { roomCode, teamId }) {
        const room = this.rooms[roomCode];
        if (!room || !room.teams[teamId]) return;

        this.cleanupPlayerFromTeams(room, socket.id);

        room.teams[teamId].members.push(socket.id);
        room.players[socket.id].teamId = teamId;
        
        this.broadcastState(roomCode);
    }

    // --- GAMEPLAY LOGIC ---

    async handleHostAction(socket, { roomCode, action, payload }) {
        const room = this.rooms[roomCode];
        if (!room || room.hostId !== socket.id) return;

        if (action === 'KICK_PLAYER') {
            const targetId = payload.playerId;
            if (room.players[targetId]) {
                delete room.players[targetId];
                this.io.to(targetId).emit('kicked');
                this.cleanupPlayerFromTeams(room, targetId);
                this.broadcastState(roomCode);
            }
        }

        if (action === 'START_GAME') {
            room.status = 'LOADING';
            this.broadcastState(roomCode);

            try {
                const amount = Number(payload.amount) || 10;
                const categories = Array.isArray(payload.categories) ? payload.categories : [];
                const difficulties = Array.isArray(payload.difficulties) ? payload.difficulties : [];
                const questionDurationSec = Number(payload.questionDurationSec) || 60;
                room.config = { amount, categories, difficulties, questionDurationSec };
                room.roundNumber = 1;
                
                // Fetch from API
                room.questions = await fetchQuestions(amount, difficulties, categories);
                
                // Set ready state
                room.status = 'LOBBY_READY'; 
                room.currentQuestionIndex = 0;
                this.broadcastState(roomCode);
            } catch (err) {
                console.error("Start Game Failed:", err);
                room.status = 'LOBBY';
                this.broadcastState(roomCode);
            }
        }

        if (action === 'NEXT_ROUND') {
            if (this.timeouts[roomCode]) {
                clearTimeout(this.timeouts[roomCode]);
                delete this.timeouts[roomCode];
            }
            room.status = 'LOADING';
            room.currentQuestionIndex = 0;
            room.roundNumber = (room.roundNumber || 1) + 1;
            this.broadcastState(roomCode);

            const { amount, difficulties, categories } = room.config;
            try {
                room.questions = await fetchQuestions(amount, difficulties, categories);
                Object.values(room.teams).forEach(t => {
                    t.currentAnswerId = null;
                    t.lastAnswerTime = 0;
                    t.lastAnsweredBy = null;
                });
                room.status = 'LOBBY_READY';
                this.broadcastState(roomCode);
            } catch (err) {
                console.error("Next Round Failed:", err);
                room.status = 'ROUND_END';
                this.broadcastState(roomCode);
            }
        }

        if (action === 'NEXT_QUESTION') {
            // Only advance the index if we are currently looking at a Result (REVEAL)
            if (room.status === 'REVEAL') {
                room.currentQuestionIndex++;
            }

            // Check if we ran out of questions
            if (room.currentQuestionIndex >= room.questions.length) {
                room.status = 'ROUND_END';
                this.broadcastState(roomCode);
            } else {
                this.startQuestion(roomCode);
            }
        }

        if (action === 'REVEAL') {
            this.triggerReveal(roomCode);
        }

        if (action === 'END_GAME') {
            room.status = 'FINISHED';
            this.broadcastState(roomCode);
        }
    }

    startQuestion(roomCode) {
        const room = this.rooms[roomCode];
        if (!room) return;

        room.status = 'QUESTION';
        
        // TIME LIMIT: 60 Seconds
        const durationSec = room.config?.questionDurationSec || 60;
        const DURATION = durationSec * 1000; 
        room.currentQuestionEndsAt = Date.now() + DURATION;

        // Reset team answers for this round
        Object.values(room.teams).forEach(t => {
            t.currentAnswerId = null;
            t.lastAnswerTime = 0;
            t.lastAnsweredBy = null;
        });

        this.broadcastState(roomCode);

        // Clear any existing timer
        if (this.timeouts[roomCode]) clearTimeout(this.timeouts[roomCode]);

        // Set AUTOMATIC TIMER
        this.timeouts[roomCode] = setTimeout(() => {
            console.log(`⏱️ Time up for Room ${roomCode}`);
            this.triggerReveal(roomCode);
        }, DURATION);
    }

    triggerReveal(roomCode) {
        const room = this.rooms[roomCode];
        if (!room || room.status !== 'QUESTION') return;

        // 1. Stop the timer (if host clicked early)
        if (this.timeouts[roomCode]) {
            clearTimeout(this.timeouts[roomCode]);
            delete this.timeouts[roomCode];
        }

        // 2. Calculate Scores
        this.calculateScores(room);
        
        // 3. Set Status (DO NOT ADVANCE INDEX YET)
        room.status = 'REVEAL';

        // 4. Send Correct Answer
        this.broadcastState(roomCode);
    }

    handleSubmit(socket, { roomCode, answerId }) {
        const room = this.rooms[roomCode];
        if (!room || room.status !== 'QUESTION') return;

        const player = room.players[socket.id];
        if (!player || !player.teamId) return;

        const team = room.teams[player.teamId];
        if (!team) return;

        // Team Hive Mind Logic
        team.currentAnswerId = answerId;
        team.lastAnsweredBy = socket.id;
        
        // Record time relative to start (for speed bonus)
        const startTime = room.currentQuestionEndsAt - 60000;
        team.lastAnswerTime = Date.now() - startTime;

        this.broadcastState(roomCode);
    }

    calculateScores(room) {
        const currentQ = room.questions[room.currentQuestionIndex];
        const correctTeams = [];

        Object.values(room.teams).forEach(team => {
            if (team.currentAnswerId === currentQ.correctAnswerId) {
                correctTeams.push({ teamId: team.id, time: team.lastAnswerTime });
                team.score += 100;
            }
        });

        // Speed Bonus (Top 50%)
        correctTeams.sort((a, b) => a.time - b.time);
        const cutoff = Math.ceil(correctTeams.length / 2);
        
        correctTeams.slice(0, cutoff).forEach(({ teamId }) => {
            if (room.teams[teamId]) room.teams[teamId].score += 20; // +20 bonus
        });
    }

    // --- CONNECTION MANAGEMENT ---

    handleDisconnect(socket) {
        // Find which room the socket is in
        Object.keys(this.rooms).forEach(roomCode => {
            const room = this.rooms[roomCode];
            if (room.players[socket.id]) {
                // Remove player
                delete room.players[socket.id];
                this.cleanupPlayerFromTeams(room, socket.id);
                
                // If room is empty, maybe delete it (optional) or just notify others
                if (Object.keys(room.players).length === 0) {
                    delete this.rooms[roomCode];
                } else {
                    this.broadcastState(roomCode);
                }
            }
        });
    }

    cleanupPlayerFromTeams(room, playerId) {
        Object.keys(room.teams).forEach(tid => {
            room.teams[tid].members = room.teams[tid].members.filter(mid => mid !== playerId);
            if (room.teams[tid].members.length === 0) delete room.teams[tid];
        });
    }

    broadcastState(roomCode) {
        const room = this.rooms[roomCode];
        if (!room) return;

        const shouldReveal = room.status === 'REVEAL' || room.status === 'FINISHED';

        let safeCurrentQuestion = null;
        if (room.questions[room.currentQuestionIndex]) {
            safeCurrentQuestion = { ...room.questions[room.currentQuestionIndex] };
            
            // If we are NOT revealing yet, hide the secret key!
            if (!shouldReveal) {
                delete safeCurrentQuestion.correctAnswerId;
            }
        }

        const safeState = {
            ...room,
            questions: null,
            currentQuestion: safeCurrentQuestion
        };
        
        this.io.to(roomCode).emit('state_update', safeState);
    }
}

module.exports = { GameManager };

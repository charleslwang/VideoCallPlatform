// server.js
const express = require('express');
const http = require('http');
const socket = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socket(server);

app.use(express.static('public'));

// Track rooms and pending requests
const rooms = new Map(); // Store room info including host and participants
const pendingRequests = new Map(); // Store join requests

io.on('connection', socket => {
    console.log('New client connected:', socket.id);

    // Create a new room
    socket.on('create-room', (roomId) => {
        console.log('Room creation requested:', roomId);
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                hostId: socket.id,
                participants: new Set([socket.id]),
                connections: new Map()
            });
            socket.join(roomId);
            socket.emit('room-created', roomId);
            console.log('Room created:', roomId);
        } else {
            socket.emit('room-exists');
        }
    });

    // Request to join a room
    socket.on('request-join', ({ roomId, username }) => {
        console.log('Join request received:', { roomId, username, socketId: socket.id });

        const room = rooms.get(roomId);
        if (room) {
            socket.username = username;

            if (!pendingRequests.has(roomId)) {
                pendingRequests.set(roomId, new Set());
            }
            pendingRequests.get(roomId).add(socket.id);

            // Notify host of join request
            io.to(room.hostId).emit('join-requested', {
                roomId,
                userId: socket.id,
                username: username
            });

            socket.emit('request-pending', roomId);
        } else {
            socket.emit('invalid-room');
        }
    });

    // Host handles join request
    // In the handle-join-request event handler in server.js
// Update the handle-join-request handler in server.js
socket.on('handle-join-request', ({ roomId, userId, accepted }) => {
    console.log('Handling join request:', { roomId, userId, accepted });

    const room = rooms.get(roomId);
    if (room && room.hostId === socket.id) {
        if (accepted) {
            const requests = pendingRequests.get(roomId);
            if (requests?.has(userId)) {
                requests.delete(userId);
                room.participants.add(userId);

                // Join the user to the room
                const userSocket = io.sockets.sockets.get(userId);
                if (userSocket) {
                    userSocket.join(roomId);

                    // Notify the accepted user
                    userSocket.emit('join-accepted', roomId);

                    // Notify all participants about the new user
                    io.to(roomId).emit('participant-joined', {
                        userId,
                        participants: Array.from(room.participants)
                    });
                }
            }
        } else {
            io.to(userId).emit('join-rejected', roomId);
            pendingRequests.get(roomId)?.delete(userId);
        }
    }
});

    // Handle WebRTC signaling
    socket.on('offer', ({ target, offer }) => {
        console.log('Relaying offer to:', target);
        io.to(target).emit('offer', {
            offer,
            from: socket.id
        });
    });

    socket.on('answer', ({ target, answer }) => {
        console.log('Relaying answer to:', target);
        io.to(target).emit('answer', {
            answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', ({ target, candidate }) => {
        io.to(target).emit('ice-candidate', {
            candidate,
            from: socket.id
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        for (const [roomId, room] of rooms.entries()) {
            if (room.participants.has(socket.id)) {
                room.participants.delete(socket.id);
                io.to(roomId).emit('participant-left', {
                    userId: socket.id,
                    participants: Array.from(room.participants)
                });

                // If host left, notify everyone and close the room
                if (room.hostId === socket.id) {
                    io.to(roomId).emit('host-left');
                    rooms.delete(roomId);
                    pendingRequests.delete(roomId);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
const express = require('express');
const http = require('http');
const socket = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socket(server);

// Serve static files from public directory
app.use(express.static('public'));

// Track active rooms
let activeRooms = new Set();

io.on('connection', socket => {
    // Handle room creation
    socket.on('create-room', (roomId) => {
        if (!activeRooms.has(roomId)) {
            activeRooms.add(roomId);
            socket.emit('room-created', roomId);
        } else {
            socket.emit('room-exists');
        }
    });

    // Check if room exists
    socket.on('check-room', (roomId) => {
        socket.emit('room-status', activeRooms.has(roomId));
    });

    // Handle room joining
    socket.on('join-room', roomId => {
        if (activeRooms.has(roomId)) {
            socket.join(roomId);
            socket.broadcast.to(roomId).emit('user-connected');
            socket.emit('joined-room', roomId);

            // Handle disconnection
            socket.on('disconnect', () => {
                socket.broadcast.to(roomId).emit('user-disconnected');
                // If this was the last user, remove the room
                const room = io.sockets.adapter.rooms.get(roomId);
                if (!room) {
                    activeRooms.delete(roomId);
                }
            });

            // Handle WebRTC signaling
            socket.on('offer', offer => {
                socket.broadcast.to(roomId).emit('offer', offer);
            });

            socket.on('answer', answer => {
                socket.broadcast.to(roomId).emit('answer', answer);
            });

            socket.on('ice-candidate', candidate => {
                socket.broadcast.to(roomId).emit('ice-candidate', candidate);
            });
        } else {
            socket.emit('invalid-room');
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
class VideoCall {
    constructor() {
        this.initializeElements();
        this.initializeState();
        this.setupEventListeners();
    }

    initializeElements() {
        this.elements = {
            localVideo: document.getElementById('localVideo'),
            remoteVideos: document.getElementById('remoteVideos'),
            roomInput: document.getElementById('roomInput'),
            usernameInput: document.getElementById('usernameInput'),
            createRoomBtn: document.getElementById('createRoom'),
            joinRoomBtn: document.getElementById('joinRoom'),
            leaveCallBtn: document.getElementById('leaveCall'),
            requestsPanel: document.getElementById('requestsPanel'),
            statusDiv: document.getElementById('status'),
            videoContainer: document.getElementById('videoContainer'),
            controlPanel: document.getElementById('controlPanel')
        };

        this.elements.videoContainer.style.display = 'none';
        this.elements.controlPanel.style.display = 'none';
        this.elements.requestsPanel.style.display = 'none';
    }

    initializeState() {
        this.socket = io('/');
        this.peerConnections = new Map();
        this.localStream = null;
        this.roomId = null;
        this.isHost = false;
    }

    setupEventListeners() {
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.requestJoin());
        this.elements.leaveCallBtn.addEventListener('click', () => this.leaveCall());

        this.socket.on('room-created', (roomId) => {
            console.log('Room created:', roomId);
            this.isHost = true;
            this.setStatus(`Room created: ${roomId}`);
            this.initializeCall(roomId);
            this.elements.requestsPanel.style.display = 'block';
        });

        this.socket.on('request-pending', () => {
            this.setStatus('Join request sent. Waiting for host approval...');
        });

        this.socket.on('join-accepted', async (roomId) => {
            console.log('Join accepted for room:', roomId);
            this.setStatus('Join accepted!');
            await this.initializeCall(roomId);

            // Get the list of existing participants and establish connections
            const participants = Array.from(this.peerConnections.keys());
            console.log('Current participants:', participants);

            // Initiate connections with existing participants
            for (const participantId of participants) {
                if (participantId !== this.socket.id) {
                    await this.initiateConnection(participantId);
                }
            }
        });

        this.socket.on('join-requested', ({ roomId, userId, username }) => {
            console.log('Join requested:', { roomId, userId, username });
            if (this.isHost) {
                this.handleJoinRequest(roomId, userId, username);
            }
        });

        this.socket.on('participant-joined', async ({ userId, participants }) => {
            console.log('Participant joined:', { userId, participants });
            if (userId !== this.socket.id) {
                await this.handleParticipantJoined(userId, participants);
            }
        });

        this.socket.on('participant-left', ({ userId }) => {
            console.log('Participant left:', userId);
            this.handleParticipantLeft(userId);
        });

        this.socket.on('offer', async ({ offer, from }) => {
            console.log('Received offer from:', from);
            await this.handleOffer(offer, from);
        });

        this.socket.on('answer', async ({ answer, from }) => {
            console.log('Received answer from:', from);
            await this.handleAnswer(answer, from);
        });

        this.socket.on('ice-candidate', async ({ candidate, from }) => {
            await this.handleIceCandidate(candidate, from);
        });

        this.socket.on('host-left', () => {
            this.setStatus('Host has left the call');
            this.leaveCall();
        });

        this.socket.on('invalid-room', () => {
            this.setStatus('Error: Room not found');
        });

        this.socket.on('room-exists', () => {
            this.setStatus('Error: Room already exists');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.setStatus('Connection error. Please try again.');
        });
    }

    createRoom() {
        const username = this.elements.usernameInput.value.trim();
        if (!username) {
            this.setStatus('Please enter your name first');
            return;
        }

        const roomId = Math.random().toString(36).substring(7);
        console.log('Creating room:', roomId);
        this.socket.emit('create-room', roomId);
    }

    requestJoin() {
        const username = this.elements.usernameInput.value.trim();
        const roomId = this.elements.roomInput.value.trim();

        if (!username || !roomId) {
            this.setStatus('Please enter both your name and room ID');
            return;
        }

        console.log('Requesting to join room:', { roomId, username });
        this.socket.emit('request-join', { roomId, username });
    }

    async initializeCall(roomId) {
        this.roomId = roomId;

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            this.elements.localVideo.srcObject = this.localStream;
            this.elements.videoContainer.style.display = 'grid';
            this.elements.controlPanel.style.display = 'flex';
            this.elements.requestsPanel.style.display = this.isHost ? 'block' : 'none';

            this.elements.roomInput.disabled = true;
            this.elements.createRoomBtn.disabled = true;
            this.elements.joinRoomBtn.disabled = true;

            this.setStatus(`Connected to room: ${roomId}`);
        } catch (err) {
            console.error('Error accessing media devices:', err);
            this.setStatus('Error accessing camera/microphone: ' + err.message);
        }
    }

    async initiateConnection(userId) {
        try {
            const peerConnection = await this.createPeerConnection(userId);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Sending offer to:', userId);
            this.socket.emit('offer', { target: userId, offer });
        } catch (err) {
            console.error('Error initiating connection:', err);
        }
    }

    handleJoinRequest(roomId, userId, username) {
        const requestDiv = document.createElement('div');
        requestDiv.className = 'join-request';
        requestDiv.id = `request-${userId}`;

        requestDiv.innerHTML = `
            <span>${username} wants to join</span>
            <div class="request-buttons">
                <button onclick="window.videoCall.acceptJoinRequest('${roomId}', '${userId}')">
                    <i class="fas fa-check"></i> Accept
                </button>
                <button onclick="window.videoCall.rejectJoinRequest('${roomId}', '${userId}')" class="secondary">
                    <i class="fas fa-times"></i> Reject
                </button>
            </div>
        `;

        this.elements.requestsPanel.appendChild(requestDiv);
    }

    acceptJoinRequest(roomId, userId) {
        console.log('Accepting join request:', { roomId, userId });
        this.socket.emit('handle-join-request', {
            roomId,
            userId,
            accepted: true
        });

        // Create peer connection after accepting
        this.createPeerConnection(userId).then(() => {
            console.log('Peer connection created for new participant:', userId);
        }).catch(err => {
            console.error('Error creating peer connection:', err);
        });

        const requestDiv = document.getElementById(`request-${userId}`);
        if (requestDiv) {
            requestDiv.remove();
        }
    }

    rejectJoinRequest(roomId, userId) {
        console.log('Rejecting join request:', { roomId, userId });
        this.socket.emit('handle-join-request', {
            roomId,
            userId,
            accepted: false
        });

        const requestDiv = document.getElementById(`request-${userId}`);
        if (requestDiv) {
            requestDiv.remove();
        }
    }

    async createPeerConnection(userId) {
        try {
            console.log('Creating peer connection for user:', userId);
            const peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            if (this.localStream) {
                this.localStream.getTracks().forEach((track) => {
                    console.log('Adding local track to peer connection:', track.kind);
                    peerConnection.addTrack(track, this.localStream);
                });
            }

            peerConnection.ontrack = (event) => {
                console.log('Received remote track from:', userId);
                this.handleRemoteTrack(event, userId);
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('Sending ICE candidate to:', userId);
                    this.socket.emit('ice-candidate', {
                        target: userId,
                        candidate: event.candidate
                    });
                }
            };

            peerConnection.oniceconnectionstatechange = () => {
                console.log(`ICE connection state for ${userId}:`, peerConnection.iceConnectionState);
                if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
                    console.log('Attempting to restart ICE for:', userId);
                    peerConnection.restartIce();
                }
            };

            this.peerConnections.set(userId, peerConnection);
            return peerConnection;
        } catch (err) {
            console.error('Error creating peer connection:', err);
            throw err;
        }
    }

    async handleOffer(offer, from) {
        try {
            const peerConnection = await this.createPeerConnection(from);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            this.socket.emit('answer', { target: from, answer });
        } catch (err) {
            console.error('Error handling offer:', err);
        }
    }

    async handleAnswer(answer, from) {
        try {
            const peerConnection = this.peerConnections.get(from);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (err) {
            console.error('Error handling answer:', err);
        }
    }

    async handleIceCandidate(candidate, from) {
        try {
            const peerConnection = this.peerConnections.get(from);
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (err) {
            console.error('Error handling ICE candidate:', err);
        }
    }

    async handleParticipantJoined(userId, participants) {
        console.log('Handling participant joined:', { userId, participants });

        // Don't create connection with ourselves
        if (userId === this.socket.id) return;

        // If we're the host or the new participant, initiate the connection
        if (this.isHost || userId === this.socket.id) {
            await this.initiateConnection(userId);
        }

        // Update UI to show new participant's video container
        this.createVideoContainer(userId);
    }

    createVideoContainer(userId) {
        const existingContainer = document.getElementById(`video-wrapper-${userId}`);
        if (!existingContainer) {
            const videoWrapper = document.createElement('div');
            videoWrapper.id = `video-wrapper-${userId}`;
            videoWrapper.className = 'video-wrapper';

            const videoHeader = document.createElement('div');
            videoHeader.className = 'video-header';
            videoHeader.innerHTML = `<h3>Participant ${userId}</h3>`;

            const videoElement = document.createElement('video');
            videoElement.id = `remote-video-${userId}`;
            videoElement.autoplay = true;
            videoElement.playsInline = true;

            videoWrapper.appendChild(videoHeader);
            videoWrapper.appendChild(videoElement);
            this.elements.remoteVideos.appendChild(videoWrapper);
        }
    }

    handleRemoteTrack(event, userId) {
        console.log('Handling remote track for user:', userId);

        // Ensure video container exists
        this.createVideoContainer(userId);

        const videoElement = document.getElementById(`remote-video-${userId}`);
        if (videoElement && event.streams && event.streams[0]) {
            videoElement.srcObject = event.streams[0];
        }
    }

    handleParticipantLeft(userId) {
        const videoElement = document.getElementById(`remote-video-${userId}`);
        if (videoElement) {
            const videoWrapper = videoElement.parentElement;
            if (videoWrapper) {
                videoWrapper.remove();
            }
        }

        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
        }
    }

    leaveCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        this.peerConnections.forEach(connection => {
            connection.close();
        });

        this.peerConnections.clear();
        this.elements.remoteVideos.innerHTML = '';

        this.elements.videoContainer.style.display = 'none';
        this.elements.controlPanel.style.display = 'none';
        this.elements.requestsPanel.style.display = 'none';

        this.elements.roomInput.disabled = false;
        this.elements.createRoomBtn.disabled = false;
        this.elements.joinRoomBtn.disabled = false;

        this.localStream = null;
        this.roomId = null;
        this.isHost = false;

        location.reload();
    }

    setStatus(message) {
        this.elements.statusDiv.textContent = message;
    }
}

// Initialize app
window.onload = () => {
    window.videoCall = new VideoCall();
};
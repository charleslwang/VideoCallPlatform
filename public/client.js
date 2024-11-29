class VideoCall {
    constructor() {
        // Get DOM elements
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.roomInput = document.getElementById('roomInput');
        this.createRoomBtn = document.getElementById('createRoom');
        this.joinRoomBtn = document.getElementById('joinRoom');
        this.leaveCallBtn = document.getElementById('leaveCall');
        this.shareButton = document.getElementById('shareScreen');
        this.stopButton = document.getElementById('stopSharing');
        this.statusDiv = document.getElementById('status');
        this.videoContainer = document.getElementById('videoContainer');

        // Initialize variables
        this.socket = io('/');
        this.peerConnection = null;
        this.stream = null;
        this.screenStream = null;
        this.roomId = null;

        this.setupInitialListeners();
    }

    setupInitialListeners() {
        // Setup button click handlers
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.leaveCallBtn.addEventListener('click', () => this.leaveCall());
        this.shareButton.addEventListener('click', () => this.startScreenShare());
        this.stopButton.addEventListener('click', () => this.stopScreenShare());

        // Setup socket event handlers
        this.socket.on('room-created', (roomId) => {
            this.setStatus(`Room created! Share this ID with others: ${roomId}`);
            this.initializeCall(roomId);
        });

        this.socket.on('room-exists', () => {
            this.setStatus('Room ID already exists. Try another.');
        });

        this.socket.on('joined-room', (roomId) => {
            this.setStatus(`Joined room: ${roomId}`);
            this.initializeCall(roomId);
        });

        this.socket.on('invalid-room', () => {
            this.setStatus('Invalid room ID. Please check and try again.');
        });

        this.socket.on('user-disconnected', () => {
            this.setStatus('Other user disconnected');
            this.remoteVideo.srcObject = null;
        });
    }

    async initializeCall(roomId) {
        this.roomId = roomId;
        this.videoContainer.classList.add('active');

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            this.localVideo.srcObject = this.stream;

            this.initializePeerConnection();
            this.setupCallEventListeners();

        } catch (err) {
            console.error('Error accessing media devices:', err);
            this.setStatus('Error accessing camera/microphone');
        }
    }

    initializePeerConnection() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.stream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.stream);
        });
    }

    setupCallEventListeners() {
        this.peerConnection.ontrack = event => {
            this.remoteVideo.srcObject = event.streams[0];
        };

        this.peerConnection.onicecandidate = event => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', event.candidate);
            }
        };

        this.socket.on('user-connected', async () => {
            try {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                this.socket.emit('offer', offer);
            } catch (err) {
                console.error('Error creating offer:', err);
            }
        });

        this.socket.on('offer', async offer => {
            try {
                await this.peerConnection.setRemoteDescription(offer);
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.socket.emit('answer', answer);
            } catch (err) {
                console.error('Error handling offer:', err);
            }
        });

        this.socket.on('answer', async answer => {
            try {
                await this.peerConnection.setRemoteDescription(answer);
            } catch (err) {
                console.error('Error handling answer:', err);
            }
        });

        this.socket.on('ice-candidate', async candidate => {
            try {
                await this.peerConnection.addIceCandidate(candidate);
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
            }
        });
    }

    createRoom() {
        const roomId = this.roomInput.value.trim() || Math.random().toString(36).substring(7);
        this.socket.emit('create-room', roomId);
    }

    joinRoom() {
        const roomId = this.roomInput.value.trim();
        if (!roomId) {
            this.setStatus('Please enter a room ID');
            return;
        }
        this.socket.emit('join-room', roomId);
    }

    async startScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            });

            const videoTrack = this.screenStream.getVideoTracks()[0];
            const sender = this.peerConnection.getSenders().find(s =>
                s.track.kind === 'video'
            );

            await sender.replaceTrack(videoTrack);
            this.localVideo.srcObject = this.screenStream;

            videoTrack.onended = () => {
                this.stopScreenShare();
            };
        } catch (err) {
            console.error('Error sharing screen:', err);
            this.setStatus('Error sharing screen');
        }
    }

    async stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());

            const videoTrack = this.stream.getVideoTracks()[0];
            const sender = this.peerConnection.getSenders().find(s =>
                s.track.kind === 'video'
            );

            await sender.replaceTrack(videoTrack);
            this.localVideo.srcObject = this.stream;
            this.screenStream = null;
        }
    }

    leaveCall() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }

        this.localVideo.srcObject = null;
        this.remoteVideo.srcObject = null;
        this.videoContainer.classList.remove('active');
        this.setStatus('Call ended');

        window.location.reload();
    }

    setStatus(message) {
        this.statusDiv.textContent = message;
    }
}

// Initialize the video call application
new VideoCall();
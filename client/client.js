class ToneMatchClient {
    constructor() {
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const host = window.location.hostname === 'localhost' ? 'localhost:5232' : window.location.host;
        const socketUrl = `${protocol}//${host}`;
        this.socket = io(socketUrl);
        this.audioContext = null;
        this.oscillator = null;
        this.currentTone = null;
        this.isRecording = false;
        this.isPlaying = false;
        this.recordTimeoutId = null;
        this.currentStream = null;
        this.lastEmitTime = 0;
        this.detectionRAFId = null;
        
        this.setupAudio();
        this.setupSocketEvents();
        this.setupUIEvents();
    }
    
    async setupAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.error('Audio context creation failed:', error);
        }
    }
    
    setupSocketEvents() {
        this.socket.on('joined', (data) => {
            this.showWaitingState();
        });
        
        this.socket.on('round-start', (data) => {
            this.currentTone = data.tone;
            this.showPlayingState();
        });
        
        this.socket.on('recording-started', () => {
            this.isRecording = true;
            this.updateRecordButton();
            this.startToneDetection();
        });
        
        this.socket.on('recording-stopped', () => {
            this.isRecording = false;
            this.stopToneDetection();
            this.updateRecordButton();
        });
        
        this.socket.on('pair-completed', (data) => {
            this.isRecording = false;
            this.stopToneDetection();
            this.showCompletionState();
            setTimeout(() => {
                this.showWaitingState();
            }, 3000);
        });
        
        this.socket.on('tone-incorrect', () => {
            const recordBtn = document.getElementById('record-btn');
            recordBtn.style.borderColor = '#ff0000';
            setTimeout(() => {
                recordBtn.classList.remove('record-active');
                recordBtn.style.borderColor = '#fff';
                this.isRecording = false;
            }, 1000);
        });
        
        this.socket.on('eliminated', () => {
            this.showEliminationState();
        });
        
        this.socket.on('round-ended', (data) => {
            this.showWaitingState();
        });
        
        this.socket.on('game-ended', (data) => {
            this.showWaitingState();
        });
        
        this.socket.on('game-reset', () => {
            this.showJoinState();
        });
    }
    
    setupUIEvents() {
        document.getElementById('join-btn').addEventListener('click', () => {
            this.socket.emit('join');
        });
        
        document.getElementById('play-btn').addEventListener('click', () => {
            this.toggleTonePlayback();
        });
        
        document.getElementById('record-btn').addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });
    }
    
    showJoinState() {
        this.hideAllStates();
        document.getElementById('join-state').classList.remove('hidden');
        document.getElementById('join-state').classList.add('fade-in');
    }
    
    showWaitingState() {
        this.hideAllStates();
        document.getElementById('waiting-state').classList.remove('hidden');
        document.getElementById('waiting-state').classList.add('fade-in');
    }
    
    showPlayingState() {
        this.hideAllStates();
        document.getElementById('playing-state').classList.remove('hidden');
        document.getElementById('playing-state').classList.add('fade-in');
    }
    
    showCompletionState() {
        this.hideAllStates();
        document.getElementById('completion-state').classList.remove('hidden');
        document.getElementById('completion-state').classList.add('fade-in');
    }
    
    showEliminationState() {
        this.hideAllStates();
        document.getElementById('elimination-state').classList.remove('hidden');
        document.getElementById('elimination-state').classList.add('fade-in');
    }
    
    hideAllStates() {
        const states = ['join-state', 'waiting-state', 'playing-state', 'completion-state', 'elimination-state'];
        states.forEach(state => {
            const element = document.getElementById(state);
            element.classList.add('hidden');
            element.classList.remove('fade-in');
        });
    }
    
    toggleTonePlayback() {
        if (this.isPlaying) {
            this.stopTone();
        } else {
            this.playTone();
        }
    }
    
    playTone() {
        if (!this.audioContext || !this.currentTone || this.isRecording) return;
        
        try {
            this.oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            this.oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            this.oscillator.frequency.setValueAtTime(this.currentTone, this.audioContext.currentTime);
            this.oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            
            this.oscillator.start();
            this.isPlaying = true;
            
            document.getElementById('play-btn').classList.add('play-active');
            

            setTimeout(() => {
                this.stopTone();
            }, 2000);
            
        } catch (error) {
            console.error('Error playing tone:', error);
        }
    }
    
    stopTone() {
        if (this.oscillator) {
            try {
                this.oscillator.stop();
            } catch (error) {
            }
            this.oscillator = null;
        }
        this.isPlaying = false;
        document.getElementById('play-btn').classList.remove('play-active');
    }
    
    startRecording() {
        if (this.isRecording) return;
        
        this.stopTone();
        this.socket.emit('start-recording');
        this.updateRecordButton();
        if (this.recordTimeoutId) {
            clearTimeout(this.recordTimeoutId);
            this.recordTimeoutId = null;
        }
        this.recordTimeoutId = setTimeout(() => {
            if (this.isRecording) {
                this.stopRecording();
            }
        }, 4000);
    }
    
    updateRecordButton() {
        const recordBtn = document.getElementById('record-btn');
        if (this.isRecording) {
            recordBtn.classList.add('record-active');
        } else {
            recordBtn.classList.remove('record-active');
        }
    }
    
    async startToneDetection() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('Media devices not supported');
            return;
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.currentStream = stream;
            const analyser = this.audioContext.createAnalyser();
            const microphone = this.audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 4096;
            analyser.smoothingTimeConstant = 0.8;
            microphone.connect(analyser);
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            const detectTone = () => {
                if (!this.isRecording) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                
                analyser.getByteFrequencyData(dataArray);
                const sampleRate = this.audioContext.sampleRate;
                const nyquist = sampleRate / 2;
                const hzPerBin = nyquist / bufferLength;
                const minHz = 200;
                const maxHz = 2000;
                const startBin = Math.max(0, Math.floor(minHz / hzPerBin));
                const endBin = Math.min(bufferLength - 1, Math.ceil(maxHz / hzPerBin));
                let maxIndex = startBin;
                let maxValue = 0;
                for (let i = startBin; i <= endBin; i++) {
                    if (dataArray[i] > maxValue) {
                        maxValue = dataArray[i];
                        maxIndex = i;
                    }
                }
                const frequency = maxIndex * hzPerBin;
                const now = performance.now();
                if (maxValue > 110 && frequency >= minHz && frequency <= maxHz && now - this.lastEmitTime > 150) {
                    this.lastEmitTime = now;
                    console.log('Detected frequency', Math.round(frequency), 'amp', maxValue);
                    this.socket.emit('heard-tone', frequency);
                }
                this.detectionRAFId = requestAnimationFrame(detectTone);
            };
            
            detectTone();
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    }

    stopToneDetection() {
        if (this.detectionRAFId) {
            cancelAnimationFrame(this.detectionRAFId);
            this.detectionRAFId = null;
        }
        if (this.currentStream) {
            try {
                this.currentStream.getTracks().forEach(t => t.stop());
            } catch (e) {}
            this.currentStream = null;
        }
        if (this.recordTimeoutId) {
            clearTimeout(this.recordTimeoutId);
            this.recordTimeoutId = null;
        }
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        this.stopToneDetection();
        this.socket.emit('cancel-recording');
        this.updateRecordButton();
        console.log('Recording stopped');
    }
}


document.addEventListener('DOMContentLoaded', () => {
    new ToneMatchClient();
});
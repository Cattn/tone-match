class ToneMatchClient {
    constructor() {
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const host = window.location.hostname === 'localhost' ? 'localhost:5232' : window.location.host;
        const socketUrl = `${protocol}//${host}`;
        this.socket = io(socketUrl);
        this.audioContext = null;
        this.oscillator = null;
        this.bufferSource = null;
        this.masterGain = null;
        this.toneGain = null;
        this.currentTone = null;
        this.currentColor = null;
        this.isRecording = false;
        this.isPlaying = false;
        this.recordTimeoutId = null;
        this.currentStream = null;
        this.lastEmitTime = 0;
        this.detectionRAFId = null;
        this.lastCompletionShownAt = 0;
        this.pendingStateTimeoutId = null;
        
        this.setupAudio();
        this.setupSocketEvents();
        this.setupUIEvents();
    }
    
    async setupAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);
            this.masterGain.connect(this.audioContext.destination);
            const unlock = () => {
                if (this.audioContext && this.audioContext.state !== 'running') {
                    this.audioContext.resume().catch(() => {});
                }
                try {
                    const buffer = this.audioContext.createBuffer(1, 1, 22050);
                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.masterGain);
                    source.start(0);
                    source.disconnect();
                } catch (e) {}
                document.removeEventListener('touchend', unlock, true);
                document.removeEventListener('click', unlock, true);
            };
            document.addEventListener('touchend', unlock, true);
            document.addEventListener('click', unlock, true);
        } catch (error) {
            console.error('Audio context creation failed:', error);
        }
    }
    
    setupSocketEvents() {
        this.socket.on('joined', (data) => {
            this.isRecording = false;
            this.stopToneDetection();
            this.stopTone();
            this.updateRecordButton();
            this.currentTone = null;
            this.currentColor = null;
            document.body.style.backgroundColor = '#000';
            this.showWaitingState();
        });
        
        this.socket.on('round-start', (data) => {
            this.currentTone = data.tone;
            this.currentColor = data.color || null;
            this.isRecording = false;
            this.stopToneDetection();
            this.stopTone();
            this.updateRecordButton();
            const recordBtn = document.getElementById('record-btn');
            if (recordBtn) recordBtn.style.borderColor = '#fff';
            document.body.style.backgroundColor = this.currentColor || '#000';
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
            this.lastCompletionShownAt = performance.now();
            if (typeof data.diff === 'number' && typeof data.tone === 'number') {
                console.log('Matched tone', data.tone, 'difference', data.diff, 'Hz');
                const el = document.getElementById('completion-state');
                if (el) {
                    el.setAttribute('data-diff', String(data.diff));
                    el.setAttribute('data-tone', String(data.tone));
                }
            }
            if (data && data.color) {
                this.currentColor = data.color;
            }
            if (this.pendingStateTimeoutId) {
                clearTimeout(this.pendingStateTimeoutId);
                this.pendingStateTimeoutId = null;
            }
            this.pendingStateTimeoutId = setTimeout(() => {
                this.pendingStateTimeoutId = null;
                this.showWaitingState();
            }, 1500);
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
            this.isRecording = false;
            this.stopToneDetection();
            this.stopTone();
            this.updateRecordButton();
            this.currentTone = null;
            this.currentColor = null;
            document.body.style.backgroundColor = '#000';
            const now = performance.now();
            const minDisplayMs = 1000;
            const elapsed = now - this.lastCompletionShownAt;
            const delay = this.lastCompletionShownAt > 0 && elapsed < minDisplayMs ? (minDisplayMs - elapsed) : 0;
            if (this.pendingStateTimeoutId) {
                clearTimeout(this.pendingStateTimeoutId);
                this.pendingStateTimeoutId = null;
            }
            this.pendingStateTimeoutId = setTimeout(() => {
                this.pendingStateTimeoutId = null;
                this.showWaitingState();
            }, delay);
        });
        
        this.socket.on('game-ended', (data) => {
            this.isRecording = false;
            this.stopToneDetection();
            this.stopTone();
            this.updateRecordButton();
            this.currentTone = null;
            this.currentColor = null;
            document.body.style.backgroundColor = '#000';
            const now = performance.now();
            const minDisplayMs = 1000;
            const elapsed = now - this.lastCompletionShownAt;
            const delay = this.lastCompletionShownAt > 0 && elapsed < minDisplayMs ? (minDisplayMs - elapsed) : 0;
            if (this.pendingStateTimeoutId) {
                clearTimeout(this.pendingStateTimeoutId);
                this.pendingStateTimeoutId = null;
            }
            this.pendingStateTimeoutId = setTimeout(() => {
                this.pendingStateTimeoutId = null;
                this.showWaitingState();
            }, delay);
        });
        
        this.socket.on('game-reset', () => {
            this.isRecording = false;
            this.stopToneDetection();
            this.stopTone();
            this.updateRecordButton();
            this.currentTone = null;
            this.currentColor = null;
            document.body.style.backgroundColor = '#000';
            if (this.pendingStateTimeoutId) {
                clearTimeout(this.pendingStateTimeoutId);
                this.pendingStateTimeoutId = null;
            }
            this.showJoinState();
        });
    }
    
    setupUIEvents() {
        document.getElementById('join-btn').addEventListener('click', () => {
            this.socket.emit('join');
        });
        
        document.getElementById('play-btn').addEventListener('click', async () => {
            if (this.audioContext && this.audioContext.state !== 'running') {
                try { await this.audioContext.resume(); } catch (e) {}
            }
            this.toggleTonePlayback();
        });
        
        document.getElementById('record-btn').addEventListener('click', async () => {
            if (this.audioContext && this.audioContext.state !== 'running') {
                try { await this.audioContext.resume(); } catch (e) {}
            }
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
        // don't know if I can really get across a "end screen" with no text
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
            element.offsetHeight;
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
            if (this.audioContext.state !== 'running') {
                try { this.audioContext.resume(); } catch (e) {}
            }
            const durationSec = 2.0;
            const sampleRate = this.audioContext.sampleRate || 44100;
            const length = Math.max(1, Math.floor(sampleRate * durationSec));
            const buffer = this.audioContext.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);
            const twoPiOverSr = 2 * Math.PI / sampleRate;
            const freq = this.currentTone;
            for (let i = 0; i < length; i++) {
                data[i] = Math.sin(i * twoPiOverSr * freq);
            }
            this.bufferSource = this.audioContext.createBufferSource();
            this.bufferSource.buffer = buffer;
            this.toneGain = this.audioContext.createGain();
            this.bufferSource.connect(this.toneGain);
            this.toneGain.connect(this.masterGain);
            const t0 = this.audioContext.currentTime;
            this.toneGain.gain.setValueAtTime(0.0, t0);
            this.toneGain.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
            this.bufferSource.start();
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
        if (this.bufferSource) {
            try {
                const t = this.audioContext.currentTime;
                if (this.toneGain) {
                    this.toneGain.gain.setValueAtTime(0.25, t);
                    this.toneGain.gain.linearRampToValueAtTime(0.0, t + 0.03);
                }
                this.bufferSource.stop(t + 0.04);
            } catch (error) {
            }
            this.bufferSource = null;
            this.toneGain = null;
        } else if (this.oscillator) {
            try {
                const t = this.audioContext.currentTime;
                if (this.toneGain) {
                    this.toneGain.gain.setValueAtTime(0.25, t);
                    this.toneGain.gain.linearRampToValueAtTime(0.0, t + 0.03);
                }
                this.oscillator.stop(t + 0.04);
            } catch (error) {}
            this.oscillator = null;
            this.toneGain = null;
        }
        this.isPlaying = false;
        document.getElementById('play-btn').classList.remove('play-active');
    }
    
    startRecording() {
        if (this.isRecording) return;
        
        this.stopTone();
        this.isRecording = true;
        this.updateRecordButton();
        this.socket.emit('start-recording');
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
            
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.7;
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
                const maxHz = 2200;
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
                if (maxValue > 60 && frequency >= minHz && frequency <= maxHz && now - this.lastEmitTime > 120) {
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
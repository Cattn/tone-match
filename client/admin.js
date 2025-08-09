class AdminPanel {
    constructor() {
        this.password = null;
        this.autoRefreshInterval = null;
        this.isAutoRefreshing = false;
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const host = window.location.hostname === 'localhost' ? 'localhost:5232' : window.location.host;
        this.apiBaseUrl = `${protocol}//${host}`;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        document.getElementById('login-btn').addEventListener('click', () => {
            this.login();
        });
        
        document.getElementById('admin-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.login();
            }
        });
        
        document.getElementById('start-game-btn').addEventListener('click', () => {
            this.startGame();
        });
        
        document.getElementById('refresh-stats-btn').addEventListener('click', () => {
            this.refreshStats();
        });
        
        document.getElementById('auto-refresh-btn').addEventListener('click', () => {
            this.toggleAutoRefresh();
        });
        
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });
    }
    
    async login() {
        const passwordInput = document.getElementById('admin-password');
        const password = passwordInput.value.trim();
        
        if (!password) {
            this.showLoginError('Please enter a password');
            return;
        }
        
        try {
            const response = await fetch(this.apiBaseUrl + '/admin/stats?' + new URLSearchParams({
                password: password
            }));
            
            if (response.ok) {
                this.password = password;
                this.showAdminPanel();
                this.refreshStats();
                this.hideLoginError();
            } else {
                const error = await response.json();
                this.showLoginError(error.error || 'Invalid password');
            }
        } catch (error) {
            this.showLoginError('Connection error. Please check if the server is running.');
        }
    }
    
    logout() {
        this.password = null;
        this.hideAdminPanel();
        this.stopAutoRefresh();
        document.getElementById('admin-password').value = '';
    }
    
    showAdminPanel() {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('admin-panel').classList.remove('hidden');
    }
    
    hideAdminPanel() {
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('admin-panel').classList.add('hidden');
    }
    
    showLoginError(message) {
        const errorElement = document.getElementById('login-error');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    
    hideLoginError() {
        document.getElementById('login-error').style.display = 'none';
    }
    
    showAdminMessage(message) {
        const messageElement = document.getElementById('admin-message');
        messageElement.textContent = message;
        messageElement.style.display = 'block';
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 3000);
    }
    
    showAdminError(message) {
        const errorElement = document.getElementById('admin-error');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }
    
    async startGame() {
        if (!this.password) return;
        
        try {
            const response = await fetch(this.apiBaseUrl + '/admin/start-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    password: this.password
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showAdminMessage(result.message || 'Game started successfully');
                this.refreshStats();
            } else {
                this.showAdminError(result.error || 'Failed to start game');
            }
        } catch (error) {
            this.showAdminError('Connection error. Please check if the server is running.');
        }
    }
    
    async refreshStats() {
        if (!this.password) return;
        
        try {
            const response = await fetch(this.apiBaseUrl + '/admin/stats?' + new URLSearchParams({
                password: this.password
            }));
            
            if (response.ok) {
                const stats = await response.json();
                this.updateStatsDisplay(stats);
            } else {
                const error = await response.json();
                this.showAdminError(error.error || 'Failed to fetch stats');
            }
        } catch (error) {
            this.showAdminError('Connection error. Please check if the server is running.');
        }
    }
    
    updateStatsDisplay(stats) {
        document.getElementById('total-players').textContent = stats.totalPlayers || 0;
        document.getElementById('active-players').textContent = stats.activePlayers || 0;
        document.getElementById('eliminated-players').textContent = stats.eliminatedPlayers || 0;
        document.getElementById('round-number').textContent = stats.roundNumber || 0;
        document.getElementById('current-pairs').textContent = stats.currentPairs || 0;
        
        const statusText = document.getElementById('round-status-text');
        
        if (stats.roundActive) {
            statusText.textContent = 'Active';
        } else if (stats.activePlayers > 0) {
            statusText.textContent = 'Waiting';
        } else {
            statusText.textContent = 'Inactive';
        }
        
        const startGameBtn = document.getElementById('start-game-btn');
        if (stats.roundActive) {
            startGameBtn.disabled = true;
            startGameBtn.textContent = 'Round in Progress';
        } else if (stats.activePlayers < 2) {
            startGameBtn.disabled = true;
            startGameBtn.textContent = 'Need 2+ Players';
        } else {
            startGameBtn.disabled = false;
            startGameBtn.textContent = 'Start Round';
        }
    }
    
    toggleAutoRefresh() {
        const autoRefreshBtn = document.getElementById('auto-refresh-btn');
        
        if (this.isAutoRefreshing) {
            this.stopAutoRefresh();
            autoRefreshBtn.textContent = 'Enable Auto-Refresh';
            autoRefreshBtn.classList.remove('danger');
        } else {
            this.startAutoRefresh();
            autoRefreshBtn.textContent = 'Disable Auto-Refresh';
            autoRefreshBtn.classList.add('danger');
        }
    }
    
    startAutoRefresh() {
        this.isAutoRefreshing = true;
        this.autoRefreshInterval = setInterval(() => {
            this.refreshStats();
        }, 5000);
    }
    
    stopAutoRefresh() {
        this.isAutoRefreshing = false;
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AdminPanel();
});

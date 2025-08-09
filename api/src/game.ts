import { Server, Socket } from 'socket.io';

enum PlayerState {
  WAITING = 'waiting',
  PLAYING = 'playing', 
  RECORDING = 'recording',
  COMPLETED = 'completed',
  ELIMINATED = 'eliminated'
}

interface Player {
  id: string;
  state: PlayerState;
  assignedTone: number;
  partnerId?: string;
  completionTime?: number;
}

interface GamePair {
  player1: string;
  player2: string;
  startTime: number;
  completed: boolean;
  completionTime?: number;
}

interface GameState {
  players: Map<string, Player>;
  currentPairs: GamePair[];
  eliminatedPlayers: Set<string>;
  roundActive: boolean;
  roundNumber: number;
}

export class GameManager {
  private io: Server;
  private game: GameState;
  private roundTimer: NodeJS.Timeout | null = null;
  
  //will expand later, but my previous range was too narrow
  private allTones = [520, 540, 560, 580, 600, 620, 640, 660, 680, 700, 720, 740, 760, 780, 800, 820, 840, 860, 880, 900, 920, 940, 960, 980, 1000, 1020, 1040, 1060, 1080, 1100, 1120, 1140, 1160, 1180, 1200, 1220, 1240, 1260, 1280];
  private usedTones: Set<number> = new Set();

  constructor(io: Server) {
    this.io = io;
    this.game = {
      players: new Map(),
      currentPairs: [],
      eliminatedPlayers: new Set(),
      roundActive: false,
      roundNumber: 0
    };
    this.setupEvents();
  }

  private setupEvents() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Player connected: ${socket.id}`);

      socket.on('join', () => this.addPlayer(socket));
      socket.on('start-recording', () => this.startRecording(socket));
      socket.on('cancel-recording', () => this.cancelRecording(socket));
      socket.on('heard-tone', (frequency: number) => this.heardTone(socket, frequency));
      
      socket.on('disconnect', () => this.removePlayer(socket));
    });
  }

  private addPlayer(socket: Socket) {
    if (this.game.eliminatedPlayers.has(socket.id)) {
      socket.emit('eliminated');
      return;
    }

    const player: Player = {
      id: socket.id,
      state: PlayerState.WAITING,
      assignedTone: 0
    };
    
    this.game.players.set(socket.id, player);
    
    socket.emit('joined', {
      playerCount: this.game.players.size,
      roundActive: this.game.roundActive
    });
    
    console.log(`Player count: ${this.game.players.size}`);
  }

  private removePlayer(socket: Socket) {
    this.game.players.delete(socket.id);
    this.usedTones.delete(this.game.players.get(socket.id)?.assignedTone || 0);
    
    this.game.currentPairs = this.game.currentPairs.filter(
      pair => pair.player1 !== socket.id && pair.player2 !== socket.id
    );
  }

  private startRecording(socket: Socket) {
    const player = this.game.players.get(socket.id);
    if (!player || !this.game.roundActive || player.state !== PlayerState.PLAYING) {
      return;
    }

    player.state = PlayerState.RECORDING;
    socket.emit('recording-started');
  }

  private heardTone(socket: Socket, frequency: number) {
    const player = this.game.players.get(socket.id);
    if (!player || player.state !== PlayerState.RECORDING) {
      return;
    }

    const partner = this.game.players.get(player.partnerId || '');
    if (!partner) return;

    const isCorrect = Math.abs(frequency - player.assignedTone) <= 10;
    
    if (isCorrect) {
      const diff = Math.round(Math.abs(frequency - player.assignedTone));
      this.completePair(player.id, partner.id, { tone: player.assignedTone, diff });
    } else {
      socket.emit('tone-incorrect');
    }
  }

  private cancelRecording(socket: Socket) {
    const player = this.game.players.get(socket.id);
    if (!player) {
      return;
    }
    if (player.state === PlayerState.RECORDING) {
      player.state = PlayerState.PLAYING;
      this.io.to(socket.id).emit('recording-stopped');
    }
  }

  public startRound() {
    const activePlayers = Array.from(this.game.players.values())
      .filter(p => p.state === PlayerState.WAITING);
    
    if (activePlayers.length < 2) {
      console.log('Not enough players to start round');
      return false;
    }

    this.game.currentPairs = [];
    this.usedTones.clear();

    const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
    const maxPairs = Math.floor(this.allTones.length);
    const plannedPairs = Math.min(Math.floor(shuffled.length / 2), maxPairs);
    const pairablePlayers = shuffled.slice(0, plannedPairs * 2);

    for (let i = 0; i < pairablePlayers.length - 1; i += 2) {
      const player1 = pairablePlayers[i];
      const player2 = pairablePlayers[i + 1];
      
      const sharedTone = this.getUniqueTone();
      
      player1.assignedTone = sharedTone;
      player2.assignedTone = sharedTone;
      player1.partnerId = player2.id;
      player2.partnerId = player1.id;
      player1.state = PlayerState.PLAYING;
      player2.state = PlayerState.PLAYING;

      this.game.currentPairs.push({
        player1: player1.id,
        player2: player2.id,
        startTime: Date.now(),
        completed: false
      });

      this.io.to(player1.id).emit('round-start', { 
        tone: sharedTone
      });
      this.io.to(player2.id).emit('round-start', { 
        tone: sharedTone
      });
    }

    this.game.roundActive = true;
    this.game.roundNumber++;

    this.roundTimer = setTimeout(() => this.endRound(), 120000); // default round time, will likely end earlier

    this.io.emit('round-started', { round: this.game.roundNumber });
    console.log(`Round ${this.game.roundNumber} started with ${this.game.currentPairs.length} pairs`);
    
    return true;
  }

  private getUniqueTone(): number {
    const availableTones = this.getAvailableTones();
    if (availableTones.length === 0) {
      throw new Error('No available tones');
    }
    
    const tone = availableTones[Math.floor(Math.random() * availableTones.length)];
    this.usedTones.add(tone);
    return tone;
  }

  // is aready used or not
  private getAvailableTones(): number[] {
    return this.allTones.filter(tone => !this.usedTones.has(tone));
  }

  private completePair(playerId: string, partnerId: string, details?: { tone: number; diff: number }) {
    const player = this.game.players.get(playerId);
    const partner = this.game.players.get(partnerId);
    const pair = this.game.currentPairs.find(
      p => (p.player1 === playerId && p.player2 === partnerId) ||
           (p.player1 === partnerId && p.player2 === playerId)
    );
    
    if (!player || !partner || !pair || pair.completed) return;

    pair.completed = true;
    pair.completionTime = Date.now() - pair.startTime;
    
    player.state = PlayerState.COMPLETED;
    partner.state = PlayerState.COMPLETED;
    player.completionTime = pair.completionTime;
    partner.completionTime = pair.completionTime;

    this.io.to(playerId).emit('pair-completed', { time: pair.completionTime, tone: details?.tone, diff: details?.diff });
    this.io.to(partnerId).emit('pair-completed', { time: pair.completionTime, tone: details?.tone, diff: details?.diff });

    console.log(`Pair completed: ${playerId} and ${partnerId} in ${pair.completionTime}ms`);

    const allPairsCompleted = this.game.currentPairs.every(p => p.completed);
    if (allPairsCompleted) {
      this.endRound();
    }
  }

  private endRound() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    this.game.roundActive = false;

    const completedPairs = this.game.currentPairs
      .filter(pair => pair.completed && pair.completionTime)
      .sort((a, b) => a.completionTime! - b.completionTime!);

    const uncompletedPairs = this.game.currentPairs.filter(pair => !pair.completed);
    
    const totalPairs = this.game.currentPairs.length;
    if (totalPairs === 1) {
      const onlyPair = this.game.currentPairs[0];
      if (onlyPair.completed) {
        const p1 = this.game.players.get(onlyPair.player1);
        const p2 = this.game.players.get(onlyPair.player2);
        if (p1) p1.state = PlayerState.WAITING;
        if (p2) p2.state = PlayerState.WAITING;
        this.game.currentPairs = [];
        setTimeout(() => this.endGame(), 3000);
        return;
      }
    }
    const eliminateCount = Math.max(1, Math.floor(totalPairs * 0.2));
    
    const pairsToEliminate = [
      ...completedPairs.slice(-eliminateCount),
      ...uncompletedPairs
    ];

    pairsToEliminate.forEach(pair => {
      this.eliminatePlayer(pair.player1);
      this.eliminatePlayer(pair.player2);
    });

    this.game.players.forEach(player => {
      if (player.state === PlayerState.COMPLETED) {
        player.state = PlayerState.WAITING;
        player.partnerId = undefined;
        player.completionTime = undefined;
      }
    });

    this.game.currentPairs = [];

    this.io.emit('round-ended', {
      eliminatedCount: pairsToEliminate.length * 2,
      remainingPlayers: Array.from(this.game.players.values()).filter(p => p.state === PlayerState.WAITING).length
    });

    console.log(`Round ${this.game.roundNumber} ended. Eliminated ${pairsToEliminate.length * 2} players.`);

    // auto starts next round
    setTimeout(() => {
      const remainingPlayers = Array.from(this.game.players.values()).filter(p => p.state === PlayerState.WAITING);
      if (remainingPlayers.length >= 2) {
        this.startRound();
      } else {
        this.endGame();
      }
    }, 5000);
  }

  private eliminatePlayer(playerId: string) {
    const player = this.game.players.get(playerId);
    if (player) {
      player.state = PlayerState.ELIMINATED;
      this.game.eliminatedPlayers.add(playerId);
      this.io.to(playerId).emit('eliminated');
      console.log(`Player eliminated: ${playerId}`);
    }
  }

  private endGame() {
    this.game.roundActive = false;
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    const remainingPlayers = Array.from(this.game.players.values())
      .filter(p => p.state === PlayerState.WAITING);

    this.io.emit('game-ended', {
      winners: remainingPlayers.map(p => p.id),
      totalRounds: this.game.roundNumber
    });

    console.log(`Game ended after ${this.game.roundNumber} rounds. Winners: ${remainingPlayers.map(p => p.id).join(', ')}`);

    setTimeout(() => {
      this.resetGame();
    }, 10000);
  }

  public forceEndGame() {
    this.endGame();
  }

  private resetGame() {
    this.game.players.clear();
    this.game.eliminatedPlayers.clear();
    this.game.currentPairs = [];
    this.game.roundNumber = 0;
    this.game.roundActive = false;
    this.usedTones.clear();
    
    this.io.emit('game-reset');
    console.log('Game reset');
  }

  public getGameStats() {
    return {
      totalPlayers: this.game.players.size,
      activePlayers: Array.from(this.game.players.values()).filter(p => p.state === PlayerState.WAITING).length,
      eliminatedPlayers: this.game.eliminatedPlayers.size,
      roundNumber: this.game.roundNumber,
      roundActive: this.game.roundActive,
      currentPairs: this.game.currentPairs.length
    };
  }
}
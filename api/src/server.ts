import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import express from 'express';
import { GameManager } from './game';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

const server = createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const gameManager = new GameManager(io);

app.post('/admin/start-game', (req, res) => {
  const { password } = req.body;

  if (password !== 'SHIPWRECKED113') { // lol, it's 1 time so I cannot be asked to do anything better
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  const success = gameManager.startRound();
  if (success) {
    res.json({ success: true, message: 'Game started' });
  } else {
    res.status(400).json({ error: 'Not enough players to start game' });
  }
});

app.get('/admin/stats', (req, res) => {
  const { password } = req.query;
  
  if (password !== 'SHIPWRECKED113') {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  res.json(gameManager.getGameStats());
});

const PORT = 5232;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
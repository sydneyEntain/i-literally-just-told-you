const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

var games = {};

function generateCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function gamecast(roomCode, event, data) {
  if (!games[roomCode]) return;
  var msg = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  games[roomCode].clients.forEach(function(res) { res.write(msg); });
}

app.post('/api/game/create', function(req, res) {
  var roomCode = generateCode();
  games[roomCode] = { players: [], state: 'lobby', quizQuestions: [], answers: {}, clients: [] };
  res.json({ roomCode: roomCode });
});

app.post('/api/game/join', function(req, res) {
  var roomCode = req.body.roomCode;
  var playerName = req.body.playerName;
  var game = games[roomCode];
  if (!game) return res.status(404).json({ error: 'Room not found' });
  if (game.state !== 'lobby') return res.status(400).json({ error: 'Game already started' });
  if (game.players.includes(playerName)) return res.status(400).json({ error: 'Name taken' });
  game.players.push(playerName);
  gamecast(roomCode, 'player_joined', { players: game.players });
  res.json({ ok: true });
});

app.get('/api/game/events/:roomCode', function(req, res) {
  var game = games[req.params.roomCode];
  if (!game) return res.status(404).json({ error: 'Room not found' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write('\n');
  game.clients.push(res);
  req.on('close', function() { game.clients = game.clients.filter(function(c) { return c !== res; }); });
});

app.post('/api/game/start-interviews', function(req, res) {
  var game = games[req.body.roomCode];
  if (!game) return res.status(404).json({ error: 'Room not found' });
  game.state = 'interviews';
  gamecast(req.body.roomCode, 'interviews_started', {});
  res.json({ ok: true });
});

app.post('/api/game/start-quiz', function(req, res) {
  var game = games[req.body.roomCode];
  if (!game) return res.status(404).json({ error: 'Room not found' });
  game.state = 'quiz';
  game.quizQuestions = req.body.quizQuestions;
  game.answers = {};
  res.json({ ok: true });
});

app.post('/api/game/send-question', function(req, res) {
  var game = games[req.body.roomCode];
  if (!game) return res.status(404).json({ error: 'Room not found' });
  var q = game.quizQuestions[req.body.questionIndex];
  game.answers[req.body.questionIndex] = {};
  gamecast(req.body.roomCode, 'question', { questionIndex: req.body.questionIndex, aboutPlayer: q.aboutPlayer, question: q.question });
  res.json({ ok: true });
});

app.post('/api/game/answer', function(req, res) {
  var game = games[req.body.roomCode];
  if (!game) return res.status(404).json({ error: 'Room not found' });
  if (!game.answers[req.body.questionIndex]) game.answers[req.body.questionIndex] = {};
  game.answers[req.body.questionIndex][req.body.playerName] = req.body.answer;
  gamecast(req.body.roomCode, 'answer_submitted', { player: req.body.playerName, answer: req.body.answer });
  res.json({ ok: true });
});

app.post('/api/game/reveal', function(req, res) {
  var game = games[req.body.roomCode];
  if (!game) return res.status(404).json({ error: 'Room not found' });
  gamecast(req.body.roomCode, 'reveal', { questionIndex: req.body.questionIndex, results: req.body.results, correctAnswer: req.body.correctAnswer });
  res.json({ ok: true });
});

app.post('/api/game/end', function(req, res) {
  var game = games[req.body.roomCode];
  if (!game) return res.status(404).json({ error: 'Room not found' });
  game.state = 'finished';
  gamecast(req.body.roomCode, 'game_over', { scores: req.body.scores });
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('Game running on port ' + PORT);
});

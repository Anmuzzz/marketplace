const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/register', (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) {
    return res.status(400).json({ error: 'Email или username уже заняты' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, username, password, displayName) VALUES (?, ?, ?, ?)')
    .run(email, username, hash, username);
  const user = db.prepare('SELECT id, email, username, displayName, avatar, role, balance FROM users WHERE id = ?').get(info.lastInsertRowid);
  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: 'Ошибка авторизации' });
    res.json({ user });
  });
});

router.post('/login', passport.authenticate('local'), (req, res) => {
  db.prepare('UPDATE users SET lastSeen = datetime(\'now\') WHERE id = ?').run(req.user.id);
  const user = db.prepare('SELECT id, email, username, displayName, avatar, role, balance, lastSeen FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

router.get('/logout', (req, res) => {
  req.logout(() => {
    res.json({ message: 'Вы вышли из системы' });
  });
});

router.put('/profile', isAuthenticated, upload.single('avatar'), (req, res) => {
  const { displayName } = req.body;
  if (displayName !== undefined) {
    if (!displayName || !displayName.trim()) return res.status(400).json({ error: 'Имя не может быть пустым' });
    db.prepare('UPDATE users SET displayName = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(displayName.trim(), req.user.id);
  }
  if (req.file) {
    db.prepare('UPDATE users SET avatar = ?, updatedAt = datetime(\'now\') WHERE id = ?').run('/uploads/' + req.file.filename, req.user.id);
  }
  const user = db.prepare('SELECT id, email, username, displayName, avatar, role, balance, lastSeen FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

router.get('/me', isAuthenticated, (req, res) => {
  db.prepare('UPDATE users SET lastSeen = datetime(\'now\') WHERE id = ?').run(req.user.id);
  const user = db.prepare('SELECT id, email, username, displayName, avatar, role, balance, lastSeen FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

router.get('/methods', (req, res) => {
  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id_here');
  res.json({ methods: { local: true, google: hasGoogle } });
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id_here') {
  router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
      res.redirect('/');
    }
  );
}

module.exports = router;

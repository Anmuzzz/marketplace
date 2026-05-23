const express = require('express');
const db = require('../config/db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', isAuthenticated, (req, res) => {
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  const transactions = db.prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT 50').all(req.user.id);
  res.json({ balance: user.balance, transactions });
});

router.post('/deposit', isAuthenticated, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Некорректная сумма' });
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(parseFloat(amount), req.user.id);
  db.prepare('INSERT INTO transactions (userId, type, amount, details) VALUES (?, \'deposit\', ?, ?)')
    .run(req.user.id, parseFloat(amount), 'Пополнение баланса');
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ balance: user.balance, message: 'Баланс пополнен' });
});

router.post('/withdraw', isAuthenticated, (req, res) => {
  const { amount, cryptoAddress, cryptoType } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Некорректная сумма' });
  if (!cryptoAddress) return res.status(400).json({ error: 'Укажите крипто-адрес' });
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  if (user.balance < amount) return res.status(400).json({ error: 'Недостаточно средств' });
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(parseFloat(amount), req.user.id);
  db.prepare('INSERT INTO transactions (userId, type, amount, details) VALUES (?, \'withdrawal\', ?, ?)')
    .run(req.user.id, -parseFloat(amount), `Вывод ${parseFloat(amount).toFixed(2)} USD в ${cryptoType || 'USDT'} на адрес ${cryptoAddress}`);
  const updated = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ balance: updated.balance, message: 'Заявка на вывод создана. Средства будут отправлены в течение 24 часов.' });
});

router.post('/admin/deposit/:userId', isAdmin, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Некорректная сумма' });
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(parseFloat(amount), req.params.userId);
  db.prepare('INSERT INTO transactions (userId, type, amount, details) VALUES (?, \'deposit\', ?, ?)')
    .run(req.params.userId, parseFloat(amount), `Пополнение от администратора`);
  const user = db.prepare('SELECT id, username, displayName, email, balance FROM users WHERE id = ?').get(req.params.userId);
  res.json({ user, message: 'Баланс пользователя пополнен' });
});

router.get('/admin/users', isAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, username, displayName, role, balance, createdAt FROM users ORDER BY createdAt DESC').all();
  res.json({ users });
});

module.exports = router;

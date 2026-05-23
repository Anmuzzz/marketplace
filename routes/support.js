const express = require('express');
const db = require('../config/db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/tickets', isAuthenticated, (req, res) => {
  let tickets;
  if (req.user.role === 'admin') {
    tickets = db.prepare(`SELECT t.*, u.displayName as userName, u.email as userEmail 
      FROM support_tickets t JOIN users u ON t.userId = u.id ORDER BY t.createdAt DESC`).all();
  } else {
    tickets = db.prepare('SELECT * FROM support_tickets WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
  }
  res.json({ tickets });
});

router.post('/tickets', isAuthenticated, (req, res) => {
  const { subject, message, priority } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Тема и сообщение обязательны' });
  const info = db.prepare('INSERT INTO support_tickets (userId, subject, message, priority) VALUES (?, ?, ?, ?)')
    .run(req.user.id, subject, message, priority || 'normal');
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ticket });
});

router.get('/tickets/:id', isAuthenticated, (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  if (ticket.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  const messages = db.prepare(`SELECT sm.*, u.displayName as userName, u.avatar as userAvatar
    FROM support_messages sm JOIN users u ON sm.userId = u.id
    WHERE sm.ticketId = ? ORDER BY sm.createdAt ASC`).all(req.params.id);
  res.json({ ticket, messages });
});

router.post('/tickets/:id/messages', isAuthenticated, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  if (ticket.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  const isAdminUser = req.user.role === 'admin' ? 1 : 0;
  const info = db.prepare('INSERT INTO support_messages (ticketId, userId, message, isAdmin) VALUES (?, ?, ?, ?)')
    .run(req.params.id, req.user.id, message, isAdminUser);
  if (!isAdminUser && ticket.status === 'closed') {
    db.prepare('UPDATE support_tickets SET updatedAt = datetime(\'now\'), status = \'open\' WHERE id = ?').run(req.params.id);
  } else {
    db.prepare('UPDATE support_tickets SET updatedAt = datetime(\'now\') WHERE id = ?').run(req.params.id);
  }
  const msg = db.prepare(`SELECT sm.*, u.displayName as userName, u.avatar as userAvatar
    FROM support_messages sm JOIN users u ON sm.userId = u.id WHERE sm.id = ?`).get(info.lastInsertRowid);
  res.json({ message: msg });
});

router.put('/tickets/:id/status', isAdmin, (req, res) => {
  const { status } = req.body;
  if (!['open', 'closed', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }
  db.prepare('UPDATE support_tickets SET status = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(status, req.params.id);
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  res.json({ ticket });
});

module.exports = router;

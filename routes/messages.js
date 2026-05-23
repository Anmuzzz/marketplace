const express = require('express');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/conversations', isAuthenticated, (req, res) => {
  const userId = req.user.id;
  const conversations = db.prepare(`
    SELECT otherUserId, u.displayName as otherUserName, u.avatar as otherUserAvatar,
      MAX(m.createdAt) as lastMessageTime,
      (SELECT message FROM messages m2 WHERE ((m2.senderId = ? AND m2.receiverId = conv.otherUserId) OR (m2.senderId = conv.otherUserId AND m2.receiverId = ?)) ORDER BY m2.createdAt DESC LIMIT 1) as lastMessage,
      (SELECT COUNT(*) FROM messages m3 WHERE m3.receiverId = ? AND m3.senderId = conv.otherUserId AND m3.read = 0) as unreadCount
    FROM (
      SELECT CASE WHEN senderId = ? THEN receiverId ELSE senderId END as otherUserId,
        MAX(createdAt) as maxTime
      FROM messages WHERE senderId = ? OR receiverId = ?
      GROUP BY otherUserId
    ) conv
    JOIN users u ON u.id = conv.otherUserId
    JOIN messages m ON m.createdAt = conv.maxTime AND ((m.senderId = ? AND m.receiverId = conv.otherUserId) OR (m.senderId = conv.otherUserId AND m.receiverId = ?))
    GROUP BY conv.otherUserId
    ORDER BY lastMessageTime DESC
  `).all(userId, userId, userId, userId, userId, userId, userId, userId);
  res.json({ conversations });
});

router.get('/', isAuthenticated, (req, res) => {
  const { userId, productId } = req.query;
  let query = `SELECT m.*, s.displayName as senderName, s.avatar as senderAvatar 
               FROM messages m JOIN users s ON m.senderId = s.id
               WHERE ((m.senderId = ? AND m.receiverId = ?) OR (m.senderId = ? AND m.receiverId = ?))`;
  const params = [req.user.id, userId, userId, req.user.id];
  if (productId) {
    query += ' AND (m.productId = ? OR m.productId IS NULL)';
    params.push(productId);
  }
  query += ' ORDER BY m.createdAt ASC';
  const messages = db.prepare(query).all(...params);
  db.prepare('UPDATE messages SET read = 1 WHERE receiverId = ? AND senderId = ?').run(req.user.id, userId);
  res.json({ messages });
});

router.post('/', isAuthenticated, (req, res) => {
  const { receiverId, message, productId } = req.body;
  if (!receiverId || !message) return res.status(400).json({ error: 'Получатель и сообщение обязательны' });
  const info = db.prepare('INSERT INTO messages (senderId, receiverId, productId, message) VALUES (?, ?, ?, ?)')
    .run(req.user.id, parseInt(receiverId), productId || null, message);
  const msg = db.prepare(`SELECT m.*, s.displayName as senderName, s.avatar as senderAvatar 
    FROM messages m JOIN users s ON m.senderId = s.id WHERE m.id = ?`).get(info.lastInsertRowid);
  res.json({ message: msg });
});

router.put('/read/:userId', isAuthenticated, (req, res) => {
  db.prepare('UPDATE messages SET read = 1 WHERE receiverId = ? AND senderId = ?').run(req.user.id, req.params.userId);
  res.json({ message: 'Прочитано' });
});

module.exports = router;

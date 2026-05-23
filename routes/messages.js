const express = require('express');
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
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/conversations', isAuthenticated, (req, res) => {
  const userId = req.user.id;
  const convs = db.prepare(`
    SELECT conv.otherUserId, u.displayName as otherUserName, u.avatar as otherUserAvatar, u.lastSeen,
      conv.lastMessageTime,
      (SELECT message FROM messages WHERE ((senderId = ? AND receiverId = conv.otherUserId) OR (senderId = conv.otherUserId AND receiverId = ?)) AND deleted = 0 ORDER BY createdAt DESC LIMIT 1) as lastMessage,
      (SELECT COUNT(*) FROM messages WHERE receiverId = ? AND senderId = conv.otherUserId AND read = 0 AND deleted = 0) as unreadCount
    FROM (SELECT CASE WHEN senderId = ? THEN receiverId ELSE senderId END as otherUserId, MAX(createdAt) as lastMessageTime FROM messages WHERE (senderId = ? OR receiverId = ?) AND deleted = 0 GROUP BY otherUserId) conv
    JOIN users u ON u.id = conv.otherUserId
    ORDER BY conv.lastMessageTime DESC
  `).all(userId, userId, userId, userId, userId, userId);
  res.json({ conversations: convs });
});

router.get('/unread-count', isAuthenticated, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM messages WHERE receiverId = ? AND read = 0 AND deleted = 0').get(req.user.id);
  res.json({ unread: count.count });
});

router.get('/', isAuthenticated, (req, res) => {
  const { userId, productId, after } = req.query;
  let query = `SELECT m.*, s.displayName as senderName, s.avatar as senderAvatar 
               FROM messages m JOIN users s ON m.senderId = s.id
               WHERE ((m.senderId = ? AND m.receiverId = ?) OR (m.senderId = ? AND m.receiverId = ?)) AND m.deleted = 0`;
  const params = [req.user.id, userId, userId, req.user.id];
  if (productId) { query += ' AND (m.productId = ? OR m.productId IS NULL)'; params.push(productId); }
  if (after) { query += ' AND m.id > ?'; params.push(after); }
  query += ' ORDER BY m.createdAt ASC';
  const messages = db.prepare(query).all(...params);
  for (const msg of messages) {
    if (msg.replyToId) {
      const replied = db.prepare('SELECT id, message, image, senderId FROM messages WHERE id = ?').get(msg.replyToId);
      if (replied) {
        const repliedSender = db.prepare('SELECT displayName FROM users WHERE id = ?').get(replied.senderId);
        msg.replyToMsg = { ...replied, senderName: repliedSender?.displayName };
      }
    }
  }
  db.prepare('UPDATE messages SET read = 1 WHERE receiverId = ? AND senderId = ? AND read = 0').run(req.user.id, userId);
  const io = req.app.get('io');
  if (io) io.to(`user_${userId}`).emit('read_receipt', { senderId: userId, receiverId: req.user.id });
  res.json({ messages });
});

router.post('/', isAuthenticated, upload.single('image'), (req, res) => {
  const { receiverId, message, productId, replyTo } = req.body;
  if ((!message || !message.trim()) && !req.file) return res.status(400).json({ error: 'Сообщение или изображение обязательно' });
  if (!receiverId) return res.status(400).json({ error: 'Получатель обязателен' });
  const image = req.file ? '/uploads/' + req.file.filename : null;
  const replyToId = replyTo ? parseInt(replyTo) : null;
  if (replyToId) {
    const exists = db.prepare('SELECT id FROM messages WHERE id = ? AND deleted = 0').get(replyToId);
    if (!exists) return res.status(400).json({ error: 'Сообщение для ответа не найдено' });
  }
  const info = db.prepare('INSERT INTO messages (senderId, receiverId, productId, message, image, replyToId) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, parseInt(receiverId), productId || null, (message || '').trim(), image, replyToId);
  const msg = db.prepare(`SELECT m.*, s.displayName as senderName, s.avatar as senderAvatar 
    FROM messages m JOIN users s ON m.senderId = s.id WHERE m.id = ?`).get(info.lastInsertRowid);
  if (msg.replyToId) {
    const replied = db.prepare('SELECT id, message, image, senderId FROM messages WHERE id = ?').get(msg.replyToId);
    if (replied) {
      const repliedSender = db.prepare('SELECT displayName FROM users WHERE id = ?').get(replied.senderId);
      msg.replyToMsg = { ...replied, senderName: repliedSender?.displayName };
    }
  }
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${receiverId}`).emit('new_message', msg);
    io.to(`user_${req.user.id}`).emit('message_sent', msg);
  }
  res.json({ message: msg });
});

router.delete('/:id', isAuthenticated, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND senderId = ?').get(req.params.id, req.user.id);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
  db.prepare('UPDATE messages SET message = \'[удалено]\', image = NULL, deleted = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Сообщение удалено' });
});

router.put('/read/:userId', isAuthenticated, (req, res) => {
  db.prepare('UPDATE messages SET read = 1 WHERE receiverId = ? AND senderId = ? AND read = 0').run(req.user.id, req.params.userId);
  const io = req.app.get('io');
  if (io) io.to(`user_${req.params.userId}`).emit('read_receipt', { senderId: req.params.userId, receiverId: req.user.id });
  res.json({ message: 'Прочитано' });
});

router.get('/online', (req, res) => {
  const onlineUsers = req.app.get('onlineUsers') || new Map();
  res.json({ online: Array.from(onlineUsers.keys()) });
});

module.exports = router;

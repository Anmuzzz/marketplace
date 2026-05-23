const express = require('express');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/product/:productId', (req, res) => {
  const reviews = db.prepare(`SELECT r.*, u.displayName as userName, u.avatar as userAvatar
    FROM reviews r JOIN users u ON r.userId = u.id
    WHERE r.productId = ? ORDER BY r.createdAt DESC`).all(req.params.productId);
  const stats = db.prepare(`SELECT COUNT(*) as count, AVG(rating) as avg, SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) as fives,
    SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) as fours, SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) as threes,
    SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) as twos, SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as ones
    FROM reviews WHERE productId = ?`).get(req.params.productId);
  res.json({ reviews, stats });
});

router.get('/my', isAuthenticated, (req, res) => {
  const reviews = db.prepare(`SELECT r.*, p.title as productTitle
    FROM reviews r JOIN products p ON r.productId = p.id
    WHERE r.userId = ? ORDER BY r.createdAt DESC`).all(req.user.id);
  res.json({ reviews });
});

router.post('/', isAuthenticated, (req, res) => {
  const { productId, rating, comment } = req.body;
  if (!productId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Рейтинг от 1 до 5 обязателен' });
  }
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  const existing = db.prepare('SELECT id FROM reviews WHERE productId = ? AND userId = ?').get(productId, req.user.id);
  if (existing) return res.status(400).json({ error: 'Вы уже оставили отзыв на этот товар' });
  const info = db.prepare('INSERT INTO reviews (productId, userId, rating, comment) VALUES (?, ?, ?, ?)')
    .run(productId, req.user.id, parseInt(rating), comment || '');
  const review = db.prepare(`SELECT r.*, u.displayName as userName, u.avatar as userAvatar
    FROM reviews r JOIN users u ON r.userId = u.id WHERE r.id = ?`).get(info.lastInsertRowid);
  res.json({ review });
});

router.put('/:id', isAuthenticated, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Отзыв не найден' });
  if (review.userId !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  const { rating, comment } = req.body;
  if (rating && (rating < 1 || rating > 5)) return res.status(400).json({ error: 'Рейтинг от 1 до 5' });
  db.prepare('UPDATE reviews SET rating = ?, comment = ? WHERE id = ?')
    .run(rating || review.rating, comment !== undefined ? comment : review.comment, req.params.id);
  const updated = db.prepare(`SELECT r.*, u.displayName as userName, u.avatar as userAvatar
    FROM reviews r JOIN users u ON r.userId = u.id WHERE r.id = ?`).get(req.params.id);
  res.json({ review: updated });
});

router.delete('/:id', isAuthenticated, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Отзыв не найден' });
  if (review.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.json({ message: 'Отзыв удален' });
});

module.exports = router;

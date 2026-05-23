const express = require('express');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/', isAuthenticated, (req, res) => {
  const items = db.prepare(`SELECT w.id as wishId, w.createdAt as addedAt, p.*, u.displayName as sellerName
    FROM wishlist w JOIN products p ON w.productId = p.id JOIN users u ON p.sellerId = u.id
    WHERE w.userId = ? ORDER BY w.createdAt DESC`).all(req.user.id);
  res.json({ items });
});

router.get('/check/:productId', isAuthenticated, (req, res) => {
  const item = db.prepare('SELECT id FROM wishlist WHERE userId = ? AND productId = ?')
    .get(req.user.id, req.params.productId);
  res.json({ inWishlist: !!item });
});

router.post('/:productId', isAuthenticated, (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.productId);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  const existing = db.prepare('SELECT id FROM wishlist WHERE userId = ? AND productId = ?')
    .get(req.user.id, req.params.productId);
  if (existing) return res.status(400).json({ error: 'Уже в избранном' });
  const info = db.prepare('INSERT INTO wishlist (userId, productId) VALUES (?, ?)')
    .run(req.user.id, req.params.productId);
  res.json({ id: info.lastInsertRowid, message: 'Добавлено в избранное' });
});

router.delete('/:productId', isAuthenticated, (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE userId = ? AND productId = ?')
    .run(req.user.id, req.params.productId);
  res.json({ message: 'Удалено из избранного' });
});

module.exports = router;

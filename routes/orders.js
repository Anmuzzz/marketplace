const express = require('express');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.post('/', isAuthenticated, (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'ID товара обязателен' });
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND status = \'active\'').get(productId);
  if (!product) return res.status(404).json({ error: 'Товар не найден или недоступен' });
  if (product.sellerId === req.user.id) return res.status(400).json({ error: 'Нельзя купить свой товар' });
  const buyer = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  if (buyer.balance < product.price) return res.status(400).json({ error: 'Недостаточно средств на балансе' });

  const buyOrder = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(product.price, req.user.id);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(product.price, product.sellerId);
    db.prepare('UPDATE products SET status = \'sold\', updatedAt = datetime(\'now\') WHERE id = ?').run(productId);
    const info = db.prepare('INSERT INTO orders (buyerId, productId, sellerId, amount, status) VALUES (?, ?, ?, ?, \'completed\')')
      .run(req.user.id, productId, product.sellerId, product.price);
    db.prepare('INSERT INTO transactions (userId, type, amount, details) VALUES (?, \'payment\', ?, ?)')
      .run(req.user.id, -product.price, `Покупка товара #${productId}`);
    db.prepare('INSERT INTO transactions (userId, type, amount, details) VALUES (?, \'deposit\', ?, ?)')
      .run(product.sellerId, product.price, `Продажа товара #${productId}`);
    return info.lastInsertRowid;
  })();

  const order = db.prepare(`SELECT o.*, p.title as productTitle, p.images as productImages,
    buyer.displayName as buyerName, seller.displayName as sellerName
    FROM orders o 
    JOIN products p ON o.productId = p.id
    JOIN users buyer ON o.buyerId = buyer.id
    JOIN users seller ON o.sellerId = seller.id
    WHERE o.id = ?`).get(buyOrder);
  res.json({ order });
});

router.get('/my', isAuthenticated, (req, res) => {
  const bought = db.prepare(`SELECT o.*, p.title as productTitle, p.images as productImages,
    u.displayName as sellerName, u.avatar as sellerAvatar
    FROM orders o JOIN products p ON o.productId = p.id
    JOIN users u ON o.sellerId = u.id WHERE o.buyerId = ? ORDER BY o.createdAt DESC`).all(req.user.id);
  const sold = db.prepare(`SELECT o.*, p.title as productTitle, p.images as productImages,
    u.displayName as buyerName, u.avatar as buyerAvatar
    FROM orders o JOIN products p ON o.productId = p.id
    JOIN users u ON o.buyerId = u.id WHERE o.sellerId = ? ORDER BY o.createdAt DESC`).all(req.user.id);
  res.json({ bought, sold });
});

router.get('/:id', isAuthenticated, (req, res) => {
  const order = db.prepare(`SELECT o.*, p.title as productTitle, p.images as productImages, p.description as productDescription,
    buyer.displayName as buyerName, buyer.avatar as buyerAvatar, buyer.email as buyerEmail,
    seller.displayName as sellerName, seller.avatar as sellerAvatar, seller.email as sellerEmail
    FROM orders o 
    JOIN products p ON o.productId = p.id
    JOIN users buyer ON o.buyerId = buyer.id
    JOIN users seller ON o.sellerId = seller.id
    WHERE o.id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.buyerId !== req.user.id && order.sellerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  res.json({ order });
});

module.exports = router;

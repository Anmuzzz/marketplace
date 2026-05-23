const express = require('express');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

router.get('/', (req, res) => {
  const { category, search, sellerId } = req.query;
  let query = `SELECT p.*, u.displayName as sellerName, u.avatar as sellerAvatar 
               FROM products p JOIN users u ON p.sellerId = u.id WHERE p.status = 'active'`;
  const params = [];
  if (category && category !== 'all') {
    query += ' AND p.category = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND (p.title LIKE ? OR p.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (sellerId) {
    query += ' AND p.sellerId = ?';
    params.push(sellerId);
  }
  query += ' ORDER BY p.createdAt DESC';
  const products = db.prepare(query).all(...params);
  res.json({ products });
});

router.get('/categories', (req, res) => {
  const categories = db.prepare('SELECT DISTINCT category FROM products WHERE status = \'active\' ORDER BY category').all();
  res.json({ categories: categories.map(c => c.category) });
});

router.get('/:id', (req, res) => {
  const product = db.prepare(`SELECT p.*, u.displayName as sellerName, u.avatar as sellerAvatar, u.id as sellerUserId
    FROM products p JOIN users u ON p.sellerId = u.id WHERE p.id = ?`).get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  res.json({ product });
});

router.post('/', isAuthenticated, upload.array('images', 5), (req, res) => {
  const { title, description, price, currency, category } = req.body;
  if (!title || !price) return res.status(400).json({ error: 'Название и цена обязательны' });
  const images = req.files ? req.files.map(f => '/uploads/' + f.filename) : [];
  const info = db.prepare('INSERT INTO products (sellerId, title, description, price, currency, category, images) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, title, description || '', parseFloat(price), currency || 'USD', category || 'other', JSON.stringify(images));
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.json({ product });
});

router.put('/:id', isAuthenticated, upload.array('images', 5), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  if (product.sellerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  const { title, description, price, currency, category } = req.body;
  const images = req.files && req.files.length > 0
    ? JSON.stringify(req.files.map(f => '/uploads/' + f.filename))
    : product.images;
  db.prepare('UPDATE products SET title=?, description=?, price=?, currency=?, category=?, images=?, updatedAt=datetime(\'now\') WHERE id=?')
    .run(title || product.title, description !== undefined ? description : product.description, price ? parseFloat(price) : product.price, currency || product.currency, category || product.category, images, req.params.id);
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json({ product: updated });
});

router.delete('/:id', isAuthenticated, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  if (product.sellerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  db.prepare('UPDATE products SET status = \'deleted\', updatedAt = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ message: 'Товар удален' });
});

module.exports = router;

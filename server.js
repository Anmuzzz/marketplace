require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const winston = require('winston');
const xss = require('xss');
const http = require('http');
const { Server } = require('socket.io');
const passport = require('./config/passport');
const db = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

const PORT = process.env.PORT || 3000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') req.body[key] = xss(req.body[key].trim());
    }
  }
  next();
});

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5000, message: { error: 'Слишком много запросов' } });
app.use('/api/', limiter);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Слишком много попыток входа' } });
app.use('/api/auth/login', authLimiter);

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => { req.logger = logger; next(); });

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/balance', require('./routes/balance'));
app.use('/api/support', require('./routes/support'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/wishlist', require('./routes/wishlist'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const onlineUsers = new Map();

io.use((socket, next) => {
  const userId = socket.handshake.query.userId;
  if (!userId) return next(new Error('No userId'));
  socket.userId = parseInt(userId);
  next();
});

io.on('connection', (socket) => {
  onlineUsers.set(socket.userId, { id: socket.userId, socketId: socket.id, lastSeen: new Date().toISOString() });
  db.prepare('UPDATE users SET lastSeen = datetime(\'now\') WHERE id = ?').run(socket.userId);
  io.emit('online_users', Array.from(onlineUsers.keys()));

  socket.join(`user_${socket.userId}`);

  socket.on('typing', ({ receiverId }) => {
    io.to(`user_${receiverId}`).emit('typing', { userId: socket.userId });
  });

  socket.on('stop_typing', ({ receiverId }) => {
    io.to(`user_${receiverId}`).emit('stop_typing', { userId: socket.userId });
  });

  socket.on('new_message', (msg) => {
    io.to(`user_${msg.receiverId}`).emit('new_message', msg);
    io.to(`user_${msg.senderId}`).emit('message_sent', msg);
  });

  socket.on('mark_read', ({ senderId, receiverId }) => {
    db.prepare('UPDATE messages SET read = 1 WHERE senderId = ? AND receiverId = ? AND read = 0').run(senderId, receiverId);
    io.to(`user_${receiverId}`).emit('read_receipt', { senderId, receiverId });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.userId);
    io.emit('online_users', Array.from(onlineUsers.keys()));
  });
});

app.set('io', io);
app.set('onlineUsers', onlineUsers);

function seedData() {
  const bcrypt = require('bcryptjs');
  const demoUsers = [
    { email: 'admin@marketplace.com', username: 'admin', password: 'admin123', displayName: 'Admin', role: 'admin', balance: 10000 },
    { email: 'demo@marketplace.com', username: 'demo', password: 'demo123', displayName: 'Demo User', role: 'user', balance: 5000 },
    { email: 'seller@marketplace.com', username: 'seller', password: 'seller123', displayName: 'Продавец', role: 'user', balance: 2500 }
  ];
  for (const u of demoUsers) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (!existing) {
      const info = db.prepare('INSERT INTO users (email, username, password, displayName, role, balance) VALUES (?, ?, ?, ?, ?, ?)')
        .run(u.email, u.username, bcrypt.hashSync(u.password, 10), u.displayName, u.role, u.balance);
      if (u.balance > 0) {
        db.prepare('INSERT INTO transactions (userId, type, amount, details) VALUES (?, \'deposit\', ?, ?)')
          .run(info.lastInsertRowid, u.balance, 'Приветственный бонус');
      }
      logger.info(`Создан ${u.role}: ${u.email} / ${u.password}`);
    }
  }
  const demoProducts = [
    { sellerEmail: 'seller@marketplace.com', title: 'iPhone 15 Pro Max', description: 'Новый iPhone 15 Pro Max, 256GB, глубокий синий. В идеальном состоянии, полный комплект.', price: 1199.99, category: 'electronics' },
    { sellerEmail: 'seller@marketplace.com', title: 'MacBook Air M3', description: 'MacBook Air на M3, 16GB RAM, 512GB SSD. Цвет midnight. Гарантия до 2027.', price: 1499.99, category: 'electronics' },
    { sellerEmail: 'seller@marketplace.com', title: 'AirPods Pro 2', description: 'AirPods Pro 2-го поколения с USB-C. Оригинал, запечатан.', price: 249.99, category: 'electronics' },
    { sellerEmail: 'demo@marketplace.com', title: 'PS5 Slim Digital', description: 'PlayStation 5 Slim Digital Edition. В наличии, новый.', price: 499.99, category: 'electronics' },
    { sellerEmail: 'demo@marketplace.com', title: 'Наушники Sony WH-1000XM5', description: 'Топовые беспроводные наушники с шумоподавлением. Черные.', price: 349.99, category: 'electronics' },
    { sellerEmail: 'demo@marketplace.com', title: 'Куртка кожаная', description: 'Натуральная кожа, размер M, новая с бирками.', price: 189.99, category: 'clothing' }
  ];
  const sellerIds = {};
  for (const u of demoUsers) {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (user) sellerIds[u.email] = user.id;
  }
  for (const p of demoProducts) {
    const existing = db.prepare('SELECT id FROM products WHERE title = ? AND sellerId = ?').get(p.title, sellerIds[p.sellerEmail]);
    if (!existing && sellerIds[p.sellerEmail]) {
      db.prepare('INSERT INTO products (sellerId, title, description, price, category) VALUES (?, ?, ?, ?, ?)')
        .run(sellerIds[p.sellerEmail], p.title, p.description, p.price, p.category);
      logger.info(`Создан товар: ${p.title}`);
    }
  }
}

server.listen(PORT, () => {
  logger.info(`Marketplace запущен на http://localhost:${PORT}`);
  seedData();
  logger.info('Сид-данные проверены');
});

process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err.message));
process.on('uncaughtException', (err) => { logger.error('Uncaught exception:', err.message); process.exit(1); });

module.exports = app;

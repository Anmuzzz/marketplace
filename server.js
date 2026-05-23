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
const passport = require('./config/passport');
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: 'Слишком много запросов, попробуйте позже' }
});
app.use('/api/', limiter);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Слишком много попыток входа, попробуйте позже' }
});
app.use('/api/auth/login', authLimiter);

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  req.logger = logger;
  next();
});

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

const server = app.listen(PORT, () => {
  logger.info(`Marketplace запущен на http://localhost:${PORT}`);
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@marketplace.com';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const bcrypt = require('bcryptjs');
    db.prepare('INSERT INTO users (email, username, password, displayName, role) VALUES (?, ?, ?, ?, ?)')
      .run(adminEmail, 'admin', bcrypt.hashSync('admin123', 10), 'Admin', 'admin');
    logger.info(`Создан admin: ${adminEmail} / admin123`);
  }
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err.message);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err.message);
  process.exit(1);
});

module.exports = app;

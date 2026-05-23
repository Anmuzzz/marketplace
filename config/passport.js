const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./db');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT id, email, username, displayName, avatar, role, balance, googleId FROM users WHERE id = ?').get(id);
  done(null, user || false);
});

passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return done(null, false, { message: 'Неверный email или пароль' });
  if (!user.password) return done(null, false, { message: 'Этот аккаунт привязан к Google. Войдите через Google.' });
  if (!bcrypt.compareSync(password, user.password)) return done(null, false, { message: 'Неверный email или пароль' });
  return done(null, user);
}));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id_here') {
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, (accessToken, refreshToken, profile, done) => {
  let user = db.prepare('SELECT * FROM users WHERE googleId = ?').get(profile.id);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.emails?.[0]?.value);
    if (user) {
      db.prepare('UPDATE users SET googleId = ?, displayName = ?, avatar = ?, updatedAt = datetime(\'now\') WHERE id = ?')
        .run(profile.id, profile.displayName, profile.photos?.[0]?.value || null, user.id);
    } else {
      const info = db.prepare('INSERT INTO users (email, googleId, displayName, avatar, username) VALUES (?, ?, ?, ?, ?)')
        .run(
          profile.emails?.[0]?.value || null,
          profile.id,
          profile.displayName,
          profile.photos?.[0]?.value || null,
          profile.username || `user_${Date.now()}`
        );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }
  }
  return done(null, user);
}));
}

module.exports = passport;

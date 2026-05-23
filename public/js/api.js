const API = {
  async request(method, url, data) {
    const opts = { method, headers: {} };
    if (data instanceof FormData) {
      opts.body = data;
    } else if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(url, opts);
    if (res.redirected && res.url) { window.location.href = res.url; return; }
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Ошибка запроса');
    return json;
  },
  get(url) { return this.request('GET', url); },
  post(url, data) { return this.request('POST', url, data); },
  put(url, data) { return this.request('PUT', url, data); },
  del(url) { return this.request('DELETE', url); }
};

let currentUser = null;
let socket = null;

async function checkAuth() {
  try {
    const data = await API.get('/api/auth/me');
    currentUser = data.user;
    return data.user;
  } catch {
    currentUser = null;
    if (socket) { socket.disconnect(); socket = null; }
    return null;
  }
}

function initSocket() {
  if (socket && socket.connected) return;
  if (!currentUser) return;
  socket = io({ query: { userId: currentUser.id } });
  socket.on('connect', () => {});
  socket.on('new_message', (msg) => {
    if (window.onNewMessage) window.onNewMessage(msg);
    updateUnreadCount();
    if (document.hidden) playNotification();
  });
  socket.on('message_sent', (msg) => {
    if (window.onMessageSent) window.onMessageSent(msg);
  });
  socket.on('typing', ({ userId }) => {
    if (window.onTyping) window.onTyping(userId);
  });
  socket.on('stop_typing', ({ userId }) => {
    if (window.onStopTyping) window.onStopTyping(userId);
  });
  socket.on('read_receipt', (data) => {
    if (window.onReadReceipt) window.onReadReceipt(data);
  });
  socket.on('online_users', (users) => {
    if (window.onOnlineUsers) window.onOnlineUsers(users);
  });
}

async function updateUnreadCount() {
  try {
    const data = await API.get('/api/messages/unread-count');
    const badge = document.getElementById('unreadBadge');
    if (badge) {
      if (data.unread > 0) { badge.textContent = data.unread > 99 ? '99+' : data.unread; badge.style.display = 'inline'; }
      else badge.style.display = 'none';
    }
  } catch {}
}

function playNotification() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => { osc.frequency.value = 1000; }, 50);
  } catch {}
}

function updateHeader(user) {
  const authLinks = document.getElementById('authLinks');
  const userMenu = document.getElementById('userMenu');
  if (user) {
    authLinks.style.display = 'none';
    userMenu.style.display = 'inline';
    document.getElementById('headerBalance').textContent = (user.balance || 0).toFixed(2);
    initSocket();
  } else {
    authLinks.style.display = 'inline';
    userMenu.style.display = 'none';
    if (socket) { socket.disconnect(); socket = null; }
  }
}

async function logout() {
  await API.get('/api/auth/logout');
  currentUser = null;
  if (socket) { socket.disconnect(); socket = null; }
  updateHeader(null);
  navigate('/');
  return false;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
  return false;
}
window.addEventListener('popstate', render);

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

function starsHTML(rating) {
  return '<span class="stars">' + Array.from({length:5}, (_,i) => i < rating ? '★' : '☆').join('') + '</span>';
}

function starsInputHTML(name) {
  return `<div class="stars-input">${[5,4,3,2,1].map(i => `<input type="radio" id="${name}_${i}" name="${name}" value="${i}"><label for="${name}_${i}">★</label>`).join('')}</div>`;
}

function notify(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function parseImages(images) {
  try { return JSON.parse(images); } catch { return []; }
}

function formatDate(date) {
  const d = new Date(date + 'Z');
  return d.toLocaleString('ru-RU');
}

async function render() {
  const user = await checkAuth();
  updateHeader(user);
  const path = window.location.pathname;
  const main = document.getElementById('mainContent');
  try {
    if (path === '/' || path === '') await renderHome(main, user);
    else if (path.startsWith('/catalog')) await renderCatalog(main, user);
    else if (path.startsWith('/product/')) await renderProduct(main, user, path.split('/')[2]);
    else if (path === '/login') renderLogin(main);
    else if (path === '/register') renderRegister(main);
    else if (path === '/profile') renderProfile(main, user);
    else if (path === '/messages') renderMessages(main, user);
    else if (path === '/balance') renderBalance(main, user);
    else if (path === '/support') renderSupport(main, user);
    else if (path === '/create-product') renderCreateProduct(main, user);
    else renderNotFound(main);
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

// ===================== HOME =====================
async function renderHome(main, user) {
  try {
    const data = await API.get('/api/products?category=all');
    const products = data.products || [];
    let html = `
      <div style="text-align:center;padding:40px 0">
        <h1 style="font-size:36px;margin-bottom:12px">Добро пожаловать на Marketplace</h1>
        <p style="color:#888;font-size:16px;margin-bottom:24px">Покупайте и продавайте товары с криптовалютной поддержкой</p>
        <a href="/catalog" class="btn btn-primary" onclick="return navigate('/catalog')">Перейти в каталог</a>
        ${!user ? `<a href="/register" class="btn btn-outline" onclick="return navigate('/register')" style="margin-left:8px">Создать аккаунт</a>` : `<a href="/create-product" class="btn btn-outline" onclick="return navigate('/create-product')" style="margin-left:8px">Продать товар</a>`}
      </div>
      <h2 class="page-title">Последние товары</h2>
      <div class="grid">`;
    if (products.length === 0) {
      html += '<div class="empty-state"><h3>Товаров пока нет</h3><p>Станьте первым продавцом!</p></div>';
    } else {
      for (const p of products.slice(0, 8)) {
        const imgs = parseImages(p.images);
        html += renderProductCard(p, imgs);
      }
    }
    html += '</div>';
    main.innerHTML = html;
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

// ===================== CATALOG =====================
async function renderCatalog(main, user) {
  const params = new URLSearchParams(window.location.search);
  const search = params.get('search') || '';
  const category = params.get('category') || 'all';
  try {
    const [data, catData] = await Promise.all([
      API.get(`/api/products?category=${category}&search=${encodeURIComponent(search)}`),
      API.get('/api/products/categories')
    ]);
    const products = data.products || [];
    const categories = catData.categories || [];
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
        <h1 class="page-title" style="margin-bottom:0">Каталог</h1>
        ${user ? '<a href="/create-product" class="btn btn-primary" onclick="return navigate(\'/create-product\')">+ Добавить товар</a>' : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
        <a href="/catalog" class="btn ${category === 'all' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="return navigate('/catalog')">Все</a>
        ${categories.map(c => `<a href="/catalog?category=${encodeURIComponent(c)}" class="btn ${category === c ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="return navigate('/catalog?category=${encodeURIComponent(c)}')">${escapeHtml(c)}</a>`).join('')}
        ${search ? `<span style="margin-left:8px;color:#888">Найдено: ${products.length}</span>` : ''}
      </div>
      <div class="grid">`;
    if (products.length === 0) {
      html += '<div class="empty-state"><h3>Товары не найдены</h3><p>Попробуйте изменить параметры поиска</p></div>';
    } else {
      for (const p of products) {
        const imgs = parseImages(p.images);
        html += renderProductCard(p, imgs);
      }
    }
    html += '</div>';
    main.innerHTML = html;
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

function renderProductCard(p, imgs) {
  return `<div class="card card-hover product-card">
    ${currentUser ? `<button class="wishlist-heart" id="wh_${p.id}" onclick="event.stopPropagation();toggleWishlist(${p.id})">♡</button>` : ''}
    <div onclick="navigate('/product/${p.id}')">
    ${imgs.length > 0 ? `<img src="${imgs[0]}" class="product-img" alt="${escapeHtml(p.title)}">` : '<div class="product-img-placeholder">📦</div>'}
    <h3>${escapeHtml(p.title)}</h3>
    <div class="price">${parseFloat(p.price).toFixed(2)} ${escapeHtml(p.currency || 'USD')}</div>
    <div class="seller">${escapeHtml(p.sellerName || 'Продавец')}</div>
    <div><span class="category">${escapeHtml(p.category || 'other')}</span></div>
    </div>
  </div>`;
}

// ===================== PRODUCT DETAIL =====================
async function renderProduct(main, user, id) {
  try {
    const [data, reviewData] = await Promise.all([
      API.get(`/api/products/${id}`),
      API.get(`/api/reviews/product/${id}`)
    ]);
    const p = data.product;
    const imgs = parseImages(p.images);
    const isOwner = user && (p.sellerUserId === user.id);
    const canBuy = user && !isOwner && p.status === 'active';
    let inWishlist = false;
    if (user) {
      try { const w = await API.get(`/api/wishlist/check/${id}`); inWishlist = w.inWishlist; } catch {}
    }
    const reviews = reviewData.reviews || [];
    const stats = reviewData.stats || { count: 0, avg: 0 };

    let html = `<div class="product-detail">
      <div>
        ${imgs.length > 0 ? `<img src="${imgs[0]}" alt="${escapeHtml(p.title)}">` : '<div class="product-img-placeholder" style="height:400px">📦</div>'}
        ${user ? `<button class="wishlist-heart active" style="position:static;display:inline-flex;margin-top:12px" onclick="toggleWishlist(${p.id})">${inWishlist ? '❤️' : '♡'}</button>` : ''}
      </div>
      <div>
        <span class="category">${escapeHtml(p.category || 'other')}</span>
        <h1>${escapeHtml(p.title)}</h1>
        <div class="price-large">${parseFloat(p.price).toFixed(2)} ${escapeHtml(p.currency || 'USD')}</div>
        <div style="margin-bottom:16px;color:var(--text-muted);font-size:14px">Продавец: <strong>${escapeHtml(p.sellerName)}</strong></div>
        ${stats.count > 0 ? `<div style="margin-bottom:16px">${starsHTML(Math.round(stats.avg))} <span style="font-size:13px;color:var(--text-muted)">${parseFloat(stats.avg).toFixed(1)} (${stats.count})</span></div>` : ''}
        <div class="desc">${escapeHtml(p.description || 'Нет описания')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px">`;
    if (p.status === 'sold') {
      html += '<div style="padding:10px 20px;background:#fef3c7;border-radius:8px;color:#92400e;font-weight:600">Товар продан</div>';
    } else if (p.status === 'deleted') {
      html += '<div style="padding:10px 20px;background:#fee2e2;border-radius:8px;color:#dc2626;font-weight:600">Товар удален</div>';
    } else if (canBuy) {
      html += `<button class="btn btn-success" onclick="buyProduct(${p.id})">Купить сейчас</button>`;
      html += `<button class="btn btn-outline" onclick="startChat(${p.sellerUserId}, ${p.id})">Написать продавцу</button>`;
    } else if (isOwner) {
      html += `<button class="btn btn-outline" onclick="navigate('/create-product?id=${p.id}')">Редактировать</button>`;
    }
    html += `</div></div></div>`;

    html += `<div class="card" style="margin-top:24px"><h3 style="margin-bottom:16px">Отзывы (${stats.count || 0})</h3>`;
    if (user && !isOwner && p.status !== 'deleted') {
      html += `<div id="reviewForm" style="margin-bottom:16px;padding:12px;background:var(--tab-bg);border-radius:8px">
        <h4 style="margin-bottom:8px">Оставить отзыв</h4>
        ${starsInputHTML('reviewRating')}
        <div class="form-group" style="margin-top:8px"><textarea id="reviewComment" placeholder="Ваш комментарий..." rows="3"></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="submitReview(${p.id})">Отправить</button>
      </div>`;
    }
    if (reviews.length === 0) {
      html += '<p style="color:var(--text-muted)">Отзывов пока нет</p>';
    } else {
      for (const r of reviews) {
        html += `<div class="review-card">
          <div class="review-header">
            <img src="${r.userAvatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" class="review-avatar" onerror="this.src='https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'">
            <div><div class="review-name">${escapeHtml(r.userName)} ${starsHTML(r.rating)}</div><div class="review-date">${formatDate(r.createdAt)}</div></div>
          </div>
          ${r.comment ? `<div class="review-comment">${escapeHtml(r.comment)}</div>` : ''}
        </div>`;
      }
    }
    html += '</div>';

    main.innerHTML = html;
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

async function submitReview(productId) {
  const rating = document.querySelector('input[name="reviewRating"]:checked');
  if (!rating) { notify('Выберите рейтинг', 'error'); return; }
  const comment = document.getElementById('reviewComment').value.trim();
  try {
    await API.post('/api/reviews', { productId, rating: parseInt(rating.value), comment });
    notify('Отзыв оставлен');
    navigate(`/product/${productId}`);
  } catch (e) { notify(e.message, 'error'); }
}

async function toggleWishlist(productId) {
  if (!currentUser) { notify('Войдите в систему', 'error'); return; }
  try {
    const check = await API.get(`/api/wishlist/check/${productId}`);
    if (check.inWishlist) {
      await API.del(`/api/wishlist/${productId}`);
      notify('Удалено из избранного');
    } else {
      await API.post(`/api/wishlist/${productId}`);
      notify('Добавлено в избранное');
    }
    render();
  } catch (e) { notify(e.message, 'error'); }
}

async function buyProduct(productId) {
  if (!currentUser) { notify('Войдите в систему', 'error'); return; }
  try {
    const data = await API.post('/api/orders', { productId });
    notify('Товар куплен!');
    navigate('/profile');
  } catch (e) {
    notify(e.message, 'error');
  }
}

async function startChat(userId, productId) {
  if (!currentUser) { notify('Войдите в систему', 'error'); return; }
  navigate(`/messages?userId=${userId}&productId=${productId || ''}`);
}

// ===================== LOGIN =====================
function renderLogin(main) {
  main.innerHTML = `<div class="auth-page card">
    <h2>Вход</h2>
    <div class="error-msg" id="loginError"></div>
    <div class="form-group"><label>Email</label><input type="email" id="loginEmail" placeholder="your@email.com"></div>
    <div class="form-group"><label>Пароль</label><input type="password" id="loginPassword" placeholder="••••••"></div>
    <button class="btn btn-primary" style="width:100%;margin-bottom:12px" onclick="doLogin()">Войти</button>
    <div id="googleLoginBtn"><div class="auth-divider">или</div><a href="/api/auth/google" class="btn-google">Войти через Google</a></div>
    <p style="text-align:center;margin-top:16px;font-size:14px;color:#888">Нет аккаунта? <a href="/register" onclick="return navigate('/register')" style="color:#2563eb">Зарегистрироваться</a></p>
  </div>`;
  checkGoogleAuth('googleLoginBtn');
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  try {
    const data = await API.post('/api/auth/login', { email, password });
    currentUser = data.user;
    updateHeader(currentUser);
    navigate('/');
  } catch (e) {
    errEl.style.display = 'block';
    errEl.textContent = e.message;
  }
}

// ===================== REGISTER =====================
function renderRegister(main) {
  main.innerHTML = `<div class="auth-page card">
    <h2>Регистрация</h2>
    <div class="error-msg" id="regError"></div>
    <div class="form-group"><label>Email</label><input type="email" id="regEmail" placeholder="your@email.com"></div>
    <div class="form-group"><label>Имя пользователя</label><input type="text" id="regUsername" placeholder="username"></div>
    <div class="form-group"><label>Пароль</label><input type="password" id="regPassword" placeholder="минимум 6 символов"></div>
    <button class="btn btn-primary" style="width:100%;margin-bottom:12px" onclick="doRegister()">Создать аккаунт</button>
    <div id="googleRegBtn"><div class="auth-divider">или</div><a href="/api/auth/google" class="btn-google">Войти через Google</a></div>
    <p style="text-align:center;margin-top:16px;font-size:14px;color:#888">Уже есть аккаунт? <a href="/login" onclick="return navigate('/login')" style="color:#2563eb">Войти</a></p>
  </div>`;
  checkGoogleAuth('googleRegBtn');
}

async function checkGoogleAuth(elId) {
  try {
    const data = await API.get('/api/auth/methods');
    if (!data.methods.google) document.getElementById(elId).style.display = 'none';
  } catch {}
}

async function doRegister() {
  const email = document.getElementById('regEmail').value;
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('regError');
  try {
    const data = await API.post('/api/auth/register', { email, username, password });
    currentUser = data.user;
    updateHeader(currentUser);
    notify('Аккаунт создан!');
    navigate('/');
  } catch (e) {
    errEl.style.display = 'block';
    errEl.textContent = e.message;
  }
}

// ===================== PROFILE =====================
async function renderProfile(main, user) {
  if (!user) { renderLogin(main); return; }
  try {
    const ordersData = await API.get('/api/orders/my');
    const [bought, sold] = [ordersData.bought || [], ordersData.sold || []];
    const myProducts = (await API.get(`/api/products?sellerId=${user.id}`)).products || [];
    main.innerHTML = `
      <h1 class="page-title">Личный кабинет</h1>
      <div class="profile-grid">
        <div class="card profile-sidebar">
          <img src="${user.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" class="profile-avatar" onerror="this.src='https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'">
          <div class="profile-name">${escapeHtml(user.displayName || user.username)}</div>
          <div class="profile-email">${escapeHtml(user.email)}</div>
          <div class="profile-balance">${(user.balance || 0).toFixed(2)}$</div>
          <div class="profile-label">Баланс</div>
          <div style="margin-top:12px"><a href="/balance" class="btn btn-primary btn-sm" onclick="return navigate('/balance')">Управление балансом</a></div>
          <div style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="showEditProfile()">✏️ Редактировать профиль</button></div>
          ${user.role === 'admin' ? `<div style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="toggleAdmin()">⚙️ Админ-панель</button></div>` : ''}
        </div>
        <div>
          <div class="tabs">
            <button class="tab active" onclick="switchProfileTab(this, 'my-products')">Мои товары (${myProducts.length})</button>
            <button class="tab" onclick="switchProfileTab(this, 'purchases')">Покупки (${bought.length})</button>
            <button class="tab" onclick="switchProfileTab(this, 'sales')">Продажи (${sold.length})</button>
            <button class="tab" onclick="switchProfileTab(this, 'wishlist')">⭐ Избранное</button>
          </div>
          <div id="profileTabContent">
            ${renderMyProducts(myProducts)}
          </div>
        </div>
      </div>
      <div id="adminPanel" style="display:none"></div>`;
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

function renderMyProducts(products) {
  if (products.length === 0) return '<div class="empty-state"><h3>У вас пока нет товаров</h3><a href="/create-product" class="btn btn-primary" onclick="return navigate(\'/create-product\')">Добавить товар</a></div>';
  return `<div class="grid">${products.map(p => {
    const imgs = parseImages(p.images);
    return `<div class="card product-card">
      ${imgs.length > 0 ? `<img src="${imgs[0]}" class="product-img">` : '<div class="product-img-placeholder">📦</div>'}
      <h3>${escapeHtml(p.title)}</h3>
      <div class="price">${parseFloat(p.price).toFixed(2)}$</div>
      <div style="margin-top:8px;display:flex;gap:4px">
        <span class="category">${p.status}</span>
        <button class="btn btn-outline btn-sm" onclick="navigate('/product/${p.id}')">Открыть</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function renderOrders(orders, type) {
  if (orders.length === 0) return `<div class="empty-state"><h3>${type === 'bought' ? 'Покупок пока нет' : 'Продаж пока нет'}</h3></div>`;
  return orders.map(o => {
    const imgs = parseImages(o.productImages);
    return `<div class="card" style="display:flex;align-items:center;gap:16px">
      ${imgs.length > 0 ? `<img src="${imgs[0]}" style="width:60px;height:60px;object-fit:cover;border-radius:8px">` : '<div style="width:60px;height:60px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center">📦</div>'}
      <div style="flex:1">
        <strong>${escapeHtml(o.productTitle)}</strong>
        <div style="font-size:13px;color:#888">${type === 'bought' ? 'Продавец: ' + escapeHtml(o.sellerName) : 'Покупатель: ' + escapeHtml(o.buyerName)}</div>
        <div style="font-size:12px;color:#aaa">${formatDate(o.createdAt)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;color:#2563eb">${parseFloat(o.amount).toFixed(2)}$</div>
        <span class="category">${o.status}</span>
      </div>
    </div>`;
  }).join('');
}

function switchProfileTab(el, tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const content = document.getElementById('profileTabContent');
  if (tab === 'my-products') {
    API.get(`/api/products?sellerId=${currentUser.id}`).then(d => { content.innerHTML = renderMyProducts(d.products || []); });
  } else if (tab === 'purchases') {
    API.get('/api/orders/my').then(d => { content.innerHTML = renderOrders(d.bought || [], 'bought'); });
  } else if (tab === 'sales') {
    API.get('/api/orders/my').then(d => { content.innerHTML = renderOrders(d.sold || [], 'sold'); });
  } else if (tab === 'wishlist') {
    API.get('/api/wishlist').then(d => {
      const items = d.items || [];
      if (items.length === 0) return content.innerHTML = '<div class="empty-state"><h3>Избранное пусто</h3></div>';
      content.innerHTML = `<div class="grid">${items.map(p => renderProductCard(p, parseImages(p.images))).join('')}</div>`;
    });
  }
}

async function toggleAdmin() {
  const panel = document.getElementById('adminPanel');
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  try {
    const data = await API.get('/api/balance/admin/users');
    let html = '<div class="admin-panel"><h3>⚙️ Админ-панель — управление балансом пользователей</h3>';
    for (const u of data.users) {
      html += `<div class="admin-user-row">
        <div style="flex:1"><strong>${escapeHtml(u.displayName || u.username)}</strong><br><span style="font-size:12px;color:#888">${escapeHtml(u.email)}</span></div>
        <div style="font-weight:600">${(u.balance || 0).toFixed(2)}$</div>
        <input type="number" class="balance-input" id="adminAmount_${u.id}" placeholder="Сумма" step="0.01">
        <button class="btn btn-success btn-sm" onclick="adminDeposit(${u.id})">Пополнить</button>
      </div>`;
    }
    html += '</div>';
    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

async function adminDeposit(userId) {
  const amount = parseFloat(document.getElementById(`adminAmount_${userId}`).value);
  if (!amount || amount <= 0) { notify('Введите сумму', 'error'); return; }
  try {
    await API.post(`/api/balance/admin/deposit/${userId}`, { amount });
    notify('Баланс пополнен');
    toggleAdmin();
  } catch (e) {
    notify(e.message, 'error');
  }
}

function showEditProfile() {
  const existing = document.getElementById('editProfileModal');
  if (existing) { existing.remove(); return; }
  const modal = document.createElement('div');
  modal.id = 'editProfileModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `<div class="card" style="width:90%;max-width:400px;margin:0">
    <h3 style="margin-bottom:16px">Редактировать профиль</h3>
    <div class="form-group"><label>Имя</label><input type="text" id="editDisplayName" value="${escapeHtml(currentUser.displayName || '')}"></div>
    <div class="form-group"><label>Аватар</label><input type="file" id="editAvatar" accept="image/*"></div>
    <div id="editAvatarPreview" style="display:none;margin-bottom:12px"><img id="editAvatarImg" style="max-width:100px;max-height:100px;border-radius:50%"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="saveProfile()">Сохранить</button>
      <button class="btn btn-outline" onclick="document.getElementById('editProfileModal').remove()">Отмена</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  document.getElementById('editAvatar')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => { document.getElementById('editAvatarImg').src = ev.target.result; document.getElementById('editAvatarPreview').style.display = 'block'; };
      reader.readAsDataURL(file);
    }
  });
}

async function saveProfile() {
  const displayName = document.getElementById('editDisplayName').value.trim();
  const avatarFile = document.getElementById('editAvatar').files[0];
  if (!displayName) { notify('Имя не может быть пустым', 'error'); return; }
  try {
    const formData = new FormData();
    formData.append('displayName', displayName);
    if (avatarFile) formData.append('avatar', avatarFile);
    const data = await API.put('/api/auth/profile', formData);
    currentUser = data.user;
    updateHeader(currentUser);
    notify('Профиль сохранён');
    document.getElementById('editProfileModal')?.remove();
    navigate('/profile');
  } catch (e) { notify(e.message, 'error'); }
}

// ===================== MESSAGES =====================
let messagesActiveChatUserId = null;
let messagesActiveProductId = null;
let messagesTypingTimeout = null;
let messagesLastId = 0;
let messagesReplyTo = null;

const EMOJIS = ['😀','😂','😍','🥰','😎','🤔','👍','❤️','🔥','🎉','💯','😢','😡','👋','🎁','💰','🚀','💪','🙏','⭐','✅','❌','💡','📦','🛒','🔒','🔓','📱','💻','⌚','🎧'];

window.onNewMessage = function(msg) {
  if (messagesActiveChatUserId && (msg.senderId === messagesActiveChatUserId || msg.senderId === currentUser.id)) {
    appendMessage(msg);
  }
  updateUnreadCount();
  refreshConversations();
};

window.onMessageSent = function(msg) {
  if (messagesActiveChatUserId && (msg.senderId === messagesActiveChatUserId || msg.senderId === currentUser.id)) {
    appendMessage(msg);
  }
};

window.onTyping = function(userId) {
  if (messagesActiveChatUserId == userId) {
    const el = document.getElementById('typingIndicator');
    if (el) el.style.display = 'block';
  }
};

window.onStopTyping = function(userId) {
  if (messagesActiveChatUserId == userId) {
    const el = document.getElementById('typingIndicator');
    if (el) el.style.display = 'none';
  }
};

window.onOnlineUsers = function(users) {
  document.querySelectorAll('.chat-item').forEach(item => {
    const id = item.dataset.userId;
    const dot = item.querySelector('.online-dot');
    if (dot) dot.style.display = users.includes(parseInt(id)) ? 'inline-block' : 'none';
  });
};

function appendMessage(m) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const isOut = m.senderId === currentUser.id;
  const replyHtml = m.replyToMsg ? `<div class="msg-reply">
    <div class="msg-reply-name">${escapeHtml(m.replyToMsg.senderName)}</div>
    <div class="msg-reply-text">${escapeHtml(m.replyToMsg.message || '')}${m.replyToMsg.image ? ' 📷' : ''}</div>
  </div>` : '';
  const html = `<div class="msg ${isOut ? 'msg-out' : 'msg-in'}" data-id="${m.id}">
    ${replyHtml}
    ${m.image ? `<img src="${m.image}" style="max-width:200px;border-radius:8px;display:block;margin-bottom:4px">` : ''}
    ${m.message ? escapeHtml(m.message) : ''}
    <div class="msg-time">${formatTime(m.createdAt)}</div>
    <div class="msg-actions"><button class="msg-reply-btn" data-reply-id="${m.id}" data-reply-name="${escapeHtml(m.senderName)}">↩</button></div>
  </div>`;
  container.insertAdjacentHTML('beforeend', html);
  container.scrollTop = container.scrollHeight;
  if (!isOut && socket) socket.emit('mark_read', { senderId: m.senderId, receiverId: currentUser.id });
}

function setReplyTo(msgId, senderName) {
  messagesReplyTo = msgId;
  const bar = document.getElementById('replyPreview');
  if (bar) {
    bar.style.display = 'flex';
    bar.querySelector('.reply-preview-name').textContent = 'Ответ ' + senderName;
    const msgEl = document.querySelector(`[data-id="${msgId}"]`);
    const textEl = msgEl?.querySelector('.msg-time')?.previousSibling;
    bar.querySelector('.reply-preview-text').textContent = textEl?.textContent?.trim()?.substring(0, 80) || '';
  }
  document.getElementById('msgInput')?.focus();
}

function cancelReply() {
  messagesReplyTo = null;
  const bar = document.getElementById('replyPreview');
  if (bar) bar.style.display = 'none';
}

function formatTime(dateStr) {
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const opts = { hour: '2-digit', minute: '2-digit' };
  return sameDay ? d.toLocaleTimeString('ru-RU', opts) : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...opts });
}

function formatDateChat(dateStr) {
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин. назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч. назад';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

async function refreshConversations() {
  try {
    const container = document.getElementById('chatList');
    if (!container) return;
    const convData = await API.get('/api/messages/conversations');
    const conversations = convData.conversations || [];
    const activeUserId = document.getElementById('chatMessages')?.dataset?.activeUserId;
    container.innerHTML = conversations.map(c => {
      const isActive = String(c.otherUserId) === activeUserId;
      const isOnline = window._onlineUsers && window._onlineUsers.includes(c.otherUserId);
      return `<div class="chat-item ${isActive ? 'active' : ''}" data-user-id="${c.otherUserId}" onclick="navigate('/messages?userId=${c.otherUserId}")">
        <div style="position:relative">
          <img src="${c.otherUserAvatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" class="chat-avatar" onerror="this.src='https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'">
          <span class="online-dot" style="display:${isOnline ? 'inline-block' : 'none'}"></span>
        </div>
        <div class="chat-info">
          <div class="chat-name">${escapeHtml(c.otherUserName)}</div>
          <div class="chat-preview">${escapeHtml((c.lastMessage || '').substring(0, 50))}</div>
        </div>
        <div style="text-align:right">
          <div class="chat-time">${c.lastMessageTime ? formatDateChat(c.lastMessageTime) : ''}</div>
          ${c.unreadCount > 0 ? `<span class="chat-unread">${c.unreadCount}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch {}
}

async function renderMessages(main, user) {
  if (!user) { renderLogin(main); return; }
  const params = new URLSearchParams(window.location.search);
  messagesActiveChatUserId = params.get('userId') ? parseInt(params.get('userId')) : null;
  messagesActiveProductId = params.get('productId') || null;
  messagesLastId = 0;

  try {
    const [convData, onlineData] = await Promise.all([
      API.get('/api/messages/conversations'),
      API.get('/api/messages/online')
    ]);
    window._onlineUsers = onlineData.online || [];
    const conversations = convData.conversations || [];
    let html = `<h1 class="page-title">Сообщения</h1>
      <div class="chat-layout">
      <div class="card chat-sidebar">
        <div style="padding:8px 12px;font-size:13px;color:var(--text-muted);border-bottom:1px solid var(--border)">Диалоги</div>
        <div class="chat-list" id="chatList">`;
    if (conversations.length === 0) {
      html += '<div class="empty-state" style="padding:20px"><h3>Нет диалогов</h3></div>';
    } else {
      for (const c of conversations) {
        const isActive = String(c.otherUserId) === String(messagesActiveChatUserId);
        const isOnline = window._onlineUsers.includes(c.otherUserId);
        html += `<div class="chat-item ${isActive ? 'active' : ''}" data-user-id="${c.otherUserId}" onclick="navigate('/messages?userId=${c.otherUserId}')">
          <div style="position:relative">
            <img src="${c.otherUserAvatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" class="chat-avatar" onerror="this.src='https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'">
            <span class="online-dot" style="display:${isOnline ? 'inline-block' : 'none'}"></span>
          </div>
          <div class="chat-info">
            <div class="chat-name">${escapeHtml(c.otherUserName)}</div>
            <div class="chat-preview">${escapeHtml((c.lastMessage || '').substring(0, 50))}</div>
          </div>
          <div style="text-align:right">
            <div class="chat-time">${c.lastMessageTime ? formatDateChat(c.lastMessageTime) : ''}</div>
            ${c.unreadCount > 0 ? `<span class="chat-unread">${c.unreadCount}</span>` : ''}
          </div>
        </div>`;
      }
    }
    html += `</div></div>`;

    if (messagesActiveChatUserId) {
      const otherUser = conversations.find(c => String(c.otherUserId) === String(messagesActiveChatUserId));
      html += `<div class="card chat-main">
        <div class="chat-header">
          <img src="${otherUser?.otherUserAvatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" class="chat-avatar" onerror="this.src='https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'">
          <div>
            <div class="chat-name">${escapeHtml(otherUser?.otherUserName || 'Пользователь')}</div>
            <div style="font-size:11px;color:var(--text-muted)" id="chatStatus"></div>
          </div>
        </div>
        <div class="chat-messages" id="chatMessages" data-active-user-id="${messagesActiveChatUserId}">
          <div class="loading" style="padding:20px">Загрузка сообщений...</div>
        </div>
        <div id="typingIndicator" style="display:none;font-size:12px;color:var(--text-muted);padding:4px 16px">печатает...</div>
        <div id="replyPreview" style="display:none;align-items:center;gap:8px;padding:8px 16px;border-top:1px solid var(--border);background:var(--tab-bg);font-size:13px">
          <div style="flex:1"><span class="reply-preview-name" style="font-weight:600;font-size:12px;color:var(--primary)"></span><br><span class="reply-preview-text" style="color:var(--text-muted);font-size:12px"></span></div>
          <button class="btn btn-sm btn-danger" onclick="cancelReply()">✕</button>
        </div>
        <div class="chat-input">
          <div class="emoji-btn" onclick="toggleEmojiPicker()">😊</div>
          <input type="text" id="msgInput" placeholder="Введите сообщение..." autocomplete="off">
          <label class="attach-btn" title="Прикрепить изображение">📎
            <input type="file" id="msgImage" accept="image/*" style="display:none">
          </label>
          <button class="btn btn-primary" onclick="sendMessage()">Отправить</button>
        </div>
        <div id="emojiPicker" style="display:none" class="emoji-picker">
          ${EMOJIS.map(e => `<span onclick="insertEmoji('${e}')">${e}</span>`).join('')}
        </div>
        <div id="imagePreview" style="display:none;padding:8px 16px;border-top:1px solid var(--border)">
          <img id="previewImg" style="max-height:60px;border-radius:4px">
          <button class="btn btn-sm btn-danger" onclick="clearImage()">✕</button>
        </div>
      </div>`;
    } else {
      html += `<div class="card chat-main"><div class="empty-state"><h3>Выберите диалог</h3><p>Начните общение с продавцом или покупателем</p></div></div>`;
    }
    html += `</div>`;
    main.innerHTML = html;
    if (messagesActiveChatUserId) {
      initChatListeners();
      loadMessages();
    }
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

function initChatListeners() {
  const input = document.getElementById('msgInput');
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', () => {
    if (socket) {
      socket.emit('typing', { receiverId: messagesActiveChatUserId });
      clearTimeout(messagesTypingTimeout);
      messagesTypingTimeout = setTimeout(() => {
        if (socket) socket.emit('stop_typing', { receiverId: messagesActiveChatUserId });
      }, 1500);
    }
  });
  document.getElementById('chatMessages')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.msg-reply-btn');
    if (btn) setReplyTo(parseInt(btn.dataset.replyId), btn.dataset.replyName);
  });
  document.getElementById('msgImage')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById('previewImg').src = ev.target.result;
        document.getElementById('imagePreview').style.display = 'flex';
      };
      reader.readAsDataURL(file);
    }
  });
  if (window._onlineUsers) {
    const isOnline = window._onlineUsers.includes(messagesActiveChatUserId);
    document.getElementById('chatStatus').textContent = isOnline ? '🟢 в сети' : '○ не в сети';
  }
}

async function loadMessages() {
  if (!messagesActiveChatUserId) return;
  try {
    const data = await API.get(`/api/messages?userId=${messagesActiveChatUserId}${messagesActiveProductId ? '&productId=' + messagesActiveProductId : ''}`);
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const msgs = data.messages || [];
    if (msgs.length > 0) messagesLastId = msgs[msgs.length - 1].id;
    let lastDate = null;
    container.innerHTML = msgs.map(m => {
      const isOut = m.senderId === currentUser.id;
      const msgDate = new Date(m.createdAt + 'Z').toDateString();
      let dateDiv = '';
      if (msgDate !== lastDate) { lastDate = msgDate; dateDiv = `<div class="msg-date">${new Date(m.createdAt + 'Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>`; }
      const replyHtml = m.replyToMsg ? `<div class="msg-reply">
        <div class="msg-reply-name">${escapeHtml(m.replyToMsg.senderName)}</div>
        <div class="msg-reply-text">${escapeHtml(m.replyToMsg.message || '')}${m.replyToMsg.image ? ' 📷' : ''}</div>
      </div>` : '';
      return dateDiv + `<div class="msg ${isOut ? 'msg-out' : 'msg-in'}" data-id="${m.id}">
        ${replyHtml}
        ${m.image ? `<img src="${m.image}" style="max-width:200px;border-radius:8px;display:block;margin-bottom:4px">` : ''}
        ${m.message ? escapeHtml(m.message) : ''}
        <div class="msg-time">${formatTime(m.createdAt)}</div>
        <div class="msg-actions"><button class="msg-reply-btn" data-reply-id="${m.id}" data-reply-name="${escapeHtml(m.senderName)}">↩</button></div>
      </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
    if (socket) socket.emit('mark_read', { senderId: messagesActiveChatUserId, receiverId: currentUser.id });
    updateUnreadCount();
    document.getElementById('typingIndicator').style.display = 'none';
  } catch {}
}

async function sendMessage() {
  const input = document.getElementById('msgInput');
  const fileInput = document.getElementById('msgImage');
  const text = input?.value?.trim() || '';
  const file = fileInput?.files?.[0];
  if (!text && !file) return;
  input.value = '';
  clearImage();
  try {
    const formData = new FormData();
    if (text) formData.append('message', text);
    if (file) formData.append('image', file);
    formData.append('receiverId', messagesActiveChatUserId);
    if (messagesActiveProductId) formData.append('productId', messagesActiveProductId);
    if (messagesReplyTo) formData.append('replyTo', messagesReplyTo);
    await API.post('/api/messages', formData);
    cancelReply();
    fileInput.value = '';
  } catch (e) { notify(e.message, 'error'); }
}

function toggleEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
}

function insertEmoji(emoji) {
  const input = document.getElementById('msgInput');
  input.value += emoji;
  input.focus();
  document.getElementById('emojiPicker').style.display = 'none';
}

function clearImage() {
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('msgImage').value = '';
}

// ===================== BALANCE =====================
async function renderBalance(main, user) {
  if (!user) { renderLogin(main); return; }
  try {
    const data = await API.get('/api/balance');
    const transactions = data.transactions || [];
    main.innerHTML = `
      <h1 class="page-title">Баланс</h1>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <div class="card" style="text-align:center;padding:30px">
          <div style="font-size:14px;color:#888;margin-bottom:8px">Текущий баланс</div>
          <div style="font-size:42px;font-weight:700;color:#2563eb">${(data.balance || 0).toFixed(2)}$</div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:16px">Пополнить баланс</h3>
          <div class="form-group"><label>Сумма (USD)</label><input type="number" id="depositAmount" placeholder="100" step="0.01"></div>
          <button class="btn btn-success" onclick="deposit()">Пополнить</button>
          <hr style="margin:16px 0">
          <h3 style="margin-bottom:16px">Вывод в криптовалюту</h3>
          <div class="form-group"><label>Сумма (USD)</label><input type="number" id="withdrawAmount" placeholder="50" step="0.01"></div>
          <div class="form-group"><label>Крипто-адрес</label><input type="text" id="cryptoAddress" placeholder="0x... или адрес кошелька"></div>
          <div class="form-group"><label>Валюта</label><select id="cryptoType"><option value="USDT">USDT (ERC-20)</option><option value="BTC">Bitcoin</option><option value="ETH">Ethereum</option></select></div>
          <button class="btn btn-primary" onclick="withdraw()">Вывести</button>
        </div>
      </div>
      <h3 style="margin-bottom:12px">История операций</h3>
      ${transactions.length === 0 ? '<div class="empty-state"><p>История пуста</p></div>' : transactions.map(t => `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px">
          <div>
            <strong>${t.type === 'deposit' ? 'Пополнение' : t.type === 'withdrawal' ? 'Вывод' : t.type === 'payment' ? 'Оплата' : 'Возврат'}</strong>
            <div style="font-size:12px;color:#888">${escapeHtml(t.details || '')}</div>
            <div style="font-size:11px;color:#aaa">${formatDate(t.createdAt)}</div>
          </div>
          <div style="font-weight:700;font-size:18px;color:${t.amount > 0 ? '#059669' : '#dc2626'}">${t.amount > 0 ? '+' : ''}${parseFloat(t.amount).toFixed(2)}$</div>
        </div>
      `).join('')}`;
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

async function deposit() {
  const amount = parseFloat(document.getElementById('depositAmount').value);
  if (!amount || amount <= 0) { notify('Введите сумму', 'error'); return; }
  try {
    const data = await API.post('/api/balance/deposit', { amount });
    if (currentUser) currentUser.balance = data.balance;
    notify(data.message || 'Баланс пополнен');
    navigate('/balance');
  } catch (e) { notify(e.message, 'error'); }
}

async function withdraw() {
  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  const cryptoAddress = document.getElementById('cryptoAddress').value;
  const cryptoType = document.getElementById('cryptoType').value;
  if (!amount || amount <= 0) { notify('Введите сумму', 'error'); return; }
  if (!cryptoAddress) { notify('Введите крипто-адрес', 'error'); return; }
  try {
    const data = await API.post('/api/balance/withdraw', { amount, cryptoAddress, cryptoType });
    if (currentUser) currentUser.balance = data.balance;
    notify(data.message);
    navigate('/balance');
  } catch (e) { notify(e.message, 'error'); }
}

// ===================== SUPPORT =====================
async function renderSupport(main, user) {
  if (!user) { renderLogin(main); return; }
  const params = new URLSearchParams(window.location.search);
  const ticketId = params.get('ticket');
  if (ticketId) return renderSupportTicket(main, user, ticketId);
  try {
    const data = await API.get('/api/support/tickets');
    const tickets = data.tickets || [];
    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h1 class="page-title" style="margin-bottom:0">Техническая поддержка</h1>
        <button class="btn btn-primary" onclick="showNewTicketForm()">+ Новый тикет</button>
      </div>
      <div id="newTicketForm" style="display:none" class="card">
        <h3 style="margin-bottom:12px">Создать тикет</h3>
        <div class="form-group"><label>Тема</label><input type="text" id="ticketSubject" placeholder="Кратко опишите проблему"></div>
        <div class="form-group"><label>Сообщение</label><textarea id="ticketMessage" placeholder="Подробно опишите вашу проблему..."></textarea></div>
        <button class="btn btn-success" onclick="createTicket()">Отправить</button>
        <button class="btn btn-outline" style="margin-left:8px" onclick="document.getElementById('newTicketForm').style.display='none'">Отмена</button>
      </div>
      <h3 style="margin-bottom:12px">Мои обращения</h3>
      ${tickets.length === 0 ? '<div class="empty-state"><p>У вас нет обращений в поддержку</p></div>' : tickets.map(t => `
        <div class="ticket-card" onclick="navigate('/support?ticket=${t.id}')">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div class="ticket-subject">${escapeHtml(t.subject)}</div>
            <span class="ticket-status ${t.status}">${t.status === 'open' ? 'Открыт' : t.status === 'resolved' ? 'Решен' : 'Закрыт'}</span>
          </div>
          <div style="font-size:12px;color:#888;margin-top:4px">${formatDate(t.createdAt)}</div>
        </div>
      `).join('')}`;
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

function showNewTicketForm() {
  document.getElementById('newTicketForm').style.display = 'block';
}

async function createTicket() {
  const subject = document.getElementById('ticketSubject').value;
  const message = document.getElementById('ticketMessage').value;
  if (!subject || !message) { notify('Заполните все поля', 'error'); return; }
  try {
    await API.post('/api/support/tickets', { subject, message });
    notify('Тикет создан');
    navigate('/support');
  } catch (e) { notify(e.message, 'error'); }
}

async function renderSupportTicket(main, user, ticketId) {
  try {
    const data = await API.get(`/api/support/tickets/${ticketId}`);
    const ticket = data.ticket;
    const messages = data.messages || [];
    const isClosed = ticket.status === 'closed';
    main.innerHTML = `
      <a href="/support" class="btn btn-outline btn-sm" onclick="return navigate('/support')">← Назад к тикетам</a>
      <div class="card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px">
          <div>
            <h2 style="margin-bottom:4px">${escapeHtml(ticket.subject)}</h2>
            <div style="font-size:12px;color:#888">${formatDate(ticket.createdAt)}</div>
          </div>
          <span class="ticket-status ${ticket.status}">${ticket.status === 'open' ? 'Открыт' : ticket.status === 'resolved' ? 'Решен' : 'Закрыт'}</span>
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:16px">
          ${messages.map(m => `
            <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #eee">
              <div style="font-size:13px;font-weight:600">${escapeHtml(m.userName)} ${m.isAdmin ? '<span style="color:#2563eb;font-size:11px">(Поддержка)</span>' : ''}</div>
              <div style="font-size:14px;margin:4px 0;white-space:pre-wrap">${escapeHtml(m.message)}</div>
              <div style="font-size:11px;color:#aaa">${formatDate(m.createdAt)}</div>
            </div>
          `).join('')}
        </div>
        ${user.role === 'admin' && !isClosed ? `
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <button class="btn btn-sm btn-outline" onclick="changeTicketStatus(${ticketId},'closed')">🔒 Закрыть тикет</button>
            ${ticket.status !== 'resolved' ? `<button class="btn btn-sm btn-success" onclick="changeTicketStatus(${ticketId},'resolved')">✅ Решено</button>` : ''}
          </div>
        ` : ''}
        ${user.role === 'admin' && isClosed ? `
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <button class="btn btn-sm btn-outline" onclick="changeTicketStatus(${ticketId},'open')">↩ Открыть снова</button>
          </div>
        ` : ''}
        ${!isClosed ? `
          <div class="chat-input">
            <input type="text" id="ticketReply" placeholder="Введите ответ..." onkeydown="if(event.key==='Enter') replyTicket(${ticketId})">
            <button class="btn btn-primary" onclick="replyTicket(${ticketId})">Отправить</button>
          </div>
        ` : '<p style="color:#888;font-size:14px">Тикет закрыт</p>'}
      </div>`;
  } catch (e) {
    main.innerHTML = `<div class="error-msg" style="display:block">${escapeHtml(e.message)}</div>`;
  }
}

async function replyTicket(ticketId) {
  const input = document.getElementById('ticketReply');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await API.post(`/api/support/tickets/${ticketId}/messages`, { message: text });
    navigate(`/support?ticket=${ticketId}`);
  } catch (e) { notify(e.message, 'error'); }
}

async function changeTicketStatus(ticketId, status) {
  try {
    await API.put(`/api/support/tickets/${ticketId}/status`, { status });
    notify('Статус тикета изменён');
    navigate(`/support?ticket=${ticketId}`);
  } catch (e) { notify(e.message, 'error'); }
}

// ===================== CREATE PRODUCT =====================
async function renderCreateProduct(main, user) {
  if (!user) { renderLogin(main); return; }
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');
  let product = null;
  if (editId) {
    try {
      const data = await API.get(`/api/products/${editId}`);
      product = data.product;
    } catch {}
  }
  main.innerHTML = `
    <h1 class="page-title">${product ? 'Редактировать товар' : 'Новый товар'}</h1>
    <div class="card" style="max-width:600px">
      <div class="error-msg" id="prodError"></div>
      <div class="form-group"><label>Название</label><input type="text" id="prodTitle" value="${product ? escapeHtml(product.title) : ''}"></div>
      <div class="form-group"><label>Описание</label><textarea id="prodDesc">${product ? escapeHtml(product.description || '') : ''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Цена</label><input type="number" id="prodPrice" step="0.01" value="${product ? product.price : ''}"></div>
        <div class="form-group"><label>Валюта</label>
          <select id="prodCurrency">
            <option value="USD" ${product && product.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="USDT" ${product && product.currency === 'USDT' ? 'selected' : ''}>USDT</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Категория</label>
        <select id="prodCategory">
          <option value="electronics" ${product && product.category === 'electronics' ? 'selected' : ''}>Электроника</option>
          <option value="clothing" ${product && product.category === 'clothing' ? 'selected' : ''}>Одежда</option>
          <option value="digital" ${product && product.category === 'digital' ? 'selected' : ''}>Цифровые товары</option>
          <option value="services" ${product && product.category === 'services' ? 'selected' : ''}>Услуги</option>
          <option value="other" ${(!product || product.category === 'other') ? 'selected' : ''}>Другое</option>
        </select>
      </div>
      <div class="form-group"><label>Изображения</label><input type="file" id="prodImages" multiple accept="image/*"></div>
      <button class="btn btn-primary" onclick="saveProduct(${product ? product.id : 'null'})">${product ? 'Сохранить' : 'Создать товар'}</button>
    </div>`;
}

async function saveProduct(editId) {
  const title = document.getElementById('prodTitle').value;
  const description = document.getElementById('prodDesc').value;
  const price = document.getElementById('prodPrice').value;
  const currency = document.getElementById('prodCurrency').value;
  const category = document.getElementById('prodCategory').value;
  const files = document.getElementById('prodImages').files;
  if (!title || !price) { notify('Название и цена обязательны', 'error'); return; }
  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('price', price);
  formData.append('currency', currency);
  formData.append('category', category);
  for (const f of files) formData.append('images', f);
  try {
    if (editId) {
      await API.put(`/api/products/${editId}`, formData);
      notify('Товар обновлен');
    } else {
      await API.post('/api/products', formData);
      notify('Товар создан');
    }
    navigate('/profile');
  } catch (e) { notify(e.message, 'error'); }
}

function renderNotFound(main) {
  main.innerHTML = '<div class="empty-state"><h1>404</h1><p>Страница не найдена</p></div>';
}

// INIT
initTheme();
render();

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
    if (res.redirected && res.url) {
      window.location.href = res.url;
      return;
    }
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

async function checkAuth() {
  try {
    const data = await API.get('/api/auth/me');
    currentUser = data.user;
    return data.user;
  } catch {
    currentUser = null;
    return null;
  }
}

function updateHeader(user) {
  const authLinks = document.getElementById('authLinks');
  const userMenu = document.getElementById('userMenu');
  if (user) {
    authLinks.style.display = 'none';
    userMenu.style.display = 'inline';
    document.getElementById('headerBalance').textContent = (user.balance || 0).toFixed(2);
  } else {
    authLinks.style.display = 'inline';
    userMenu.style.display = 'none';
  }
}

async function logout() {
  await API.get('/api/auth/logout');
  currentUser = null;
  updateHeader(null);
  navigate('/');
  return false;
}

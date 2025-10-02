
// ===== Join Modal (Events & Workshops) =====
let __joinModalState = {
  backdrop: null,
  form: null,
  submitBtn: null,
  cancelBtn: null,
  firstInput: null,
  type: null,
  id: null,
  btn: null,
  lastFocused: null
};

function setupJoinModal() {
  const backdrop = document.getElementById('joinModalBackdrop');
  if (!backdrop) return; // only exists on events/workshops page
  const form = document.getElementById('joinForm');
  const submitBtn = document.getElementById('joinSubmit');
  const cancelBtn = backdrop.querySelector('[data-cancel-join]');
  const firstInput = document.getElementById('joinFirst');
  const lastInput = document.getElementById('joinPhone');

  __joinModalState.backdrop = backdrop;
  __joinModalState.form = form;
  __joinModalState.submitBtn = submitBtn;
  __joinModalState.cancelBtn = cancelBtn;
  __joinModalState.firstInput = firstInput;

  function validate() {
    const firstEl = document.getElementById('joinFirst');
    const lastEl = document.getElementById('joinLast');
    const emailEl = document.getElementById('joinEmail');
    const phoneEl = document.getElementById('joinPhone');
    const first = firstEl.value.trim();
    const last = lastEl.value.trim();
    const email = emailEl.value.trim();
    const phone = phoneEl.value.trim();
    let ok = true;
    if (!first) { showError('joinFirstError', 'First name is required'); ok = false; } else hideError('joinFirstError');
    if (!last) { showError('joinLastError', 'Last name is required'); ok = false; } else hideError('joinLastError');
    if (!emailIsValid(email)) { showError('joinEmailError', 'Please enter a valid email'); ok = false; } else hideError('joinEmailError');
    if (!/^\d{7,15}$/.test(phone)) { showError('joinPhoneError', 'Enter 7–15 digits'); ok = false; } else hideError('joinPhoneError');
    submitBtn.disabled = !ok;
    return ok;
  }

  ;['input','blur'].forEach(evt => {
    form.addEventListener(evt, (e) => {
      if (e.target && e.target.id === 'joinPhone') {
        // strip non-digits softly for UX on input
        e.target.value = e.target.value.replace(/[^\d]/g, '');
      }
      validate();
    }, true);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) return;
    const u = getCurrentUser();
    if (!u) { location.href = 'login.html'; return; }
    const { type, id, btn } = __joinModalState;
    if (!type || !id) { closeJoinModal(); return; }
    if (type === 'event') {
      const b = getEventBookings(u.id);
      if (!b.includes(id)) { b.push(id); saveEventBookings(u.id, b); if (btn) btn.textContent = 'Joined'; }
    } else if (type === 'workshop') {
      const b = getWorkshopBookings(u.id);
      if (!b.includes(id)) { b.push(id); saveWorkshopBookings(u.id, b); if (btn) btn.textContent = 'Joined'; }
    }
    closeJoinModal();
  });

  cancelBtn?.addEventListener('click', () => closeJoinModal());

  // Outside click closes
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) {
      closeJoinModal();
    }
  });

  // ESC key and focus trap
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeJoinModal(); return; }
    if (e.key === 'Tab') {
      const focusables = Array.from(backdrop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

function openJoinModal(type, id, btn) {
  const backdrop = __joinModalState.backdrop || document.getElementById('joinModalBackdrop');
  if (!backdrop) return; // safety
  __joinModalState.type = type;
  __joinModalState.id = id;
  __joinModalState.btn = btn || null;
  __joinModalState.lastFocused = document.activeElement;

  // reset form
  const form = __joinModalState.form || document.getElementById('joinForm');
  if (form) form.reset();
  const hiddenType = document.getElementById('joinItemType');
  const hiddenId = document.getElementById('joinItemId');
  if (hiddenType) hiddenType.value = type;
  if (hiddenId) hiddenId.value = id;

  // Prefill from user profile if available
  try {
    const u = getCurrentUser();
    if (u) {
      const emailEl = document.getElementById('joinEmail');
      if (emailEl && !emailEl.value) emailEl.value = u.email || '';
      // split name if possible
      const firstEl = document.getElementById('joinFirst');
      const lastEl = document.getElementById('joinLast');
      if (u.name && firstEl && lastEl && !firstEl.value && !lastEl.value) {
        const parts = String(u.name).trim().split(/\s+/);
        firstEl.value = parts[0] || '';
        lastEl.value = parts.slice(1).join(' ') || '';
      }
    }
  } catch(_) {}

  // disable submit until valid
  if (__joinModalState.submitBtn) __joinModalState.submitBtn.disabled = true;

  backdrop.classList.add('show');
  backdrop.setAttribute('aria-hidden', 'false');
  // move focus
  setTimeout(() => { (__joinModalState.firstInput || document.getElementById('joinFirst'))?.focus(); }, 0);
}

function closeJoinModal() {
  const backdrop = __joinModalState.backdrop || document.getElementById('joinModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('show');
  backdrop.setAttribute('aria-hidden', 'true');
  const prev = __joinModalState.lastFocused;
  __joinModalState.type = null;
  __joinModalState.id = null;
  __joinModalState.btn = null;
  __joinModalState.lastFocused = null;
  if (prev && typeof prev.focus === 'function') {
    setTimeout(() => prev.focus(), 0);
  }
}
/**
 * Bean Boutique — Frontend Logic (script.js)
 * Purpose: Auth, cart, orders, events, UI rendering, and page bootstrapping using localStorage.
 * Last updated: 2025-09-18
 */
// Core storage keys
const STORAGE_KEYS = {
  users: 'bb_users',
  currentUser: 'bb_current_user',
  carts: 'bb_carts',
  orders: 'bb_orders',
  events: 'bb_events', // global list of events
  workshops: 'bb_workshops', // global list of workshops
  eventBookings: 'bb_event_bookings', // userId -> [eventId]
  workshopBookings: 'bb_workshop_bookings', // userId -> [workshopId]
  subscriptions: 'bb_subscriptions' // userId -> [{id,name,price,features[]}]
};

// Utilities
// Read a JSON value from localStorage. If parsing fails or value is missing, return the fallback.
function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
// Write a JSON value to localStorage.
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Image mapping: Product base names -> IMAGE path
// Base name is the part before any dash suffix in titles (e.g., "Shan Highlands Arabica" from "Shan Highlands Arabica – Medium Roast")
const PRODUCT_IMAGE_MAP = {
  'Shan Highlands Arabica': '../IMAGE/Shan Highlands Arabica.jpg',
  'Mandalay Mountain Dark Roast': '../IMAGE/Mandalay Mountain Dark Roast.jpg',
  'Golden Triangle Blend': '../IMAGE/Golden Triangle Blend.jpg',
  'Yangon Morning Blend': '../IMAGE/Yangon Morning Blend.jpg',
  'Myanmar Estate Reserve': '../IMAGE/Myanmar Estate Reserve.jpg',
  'Robusta Strength': '../IMAGE/Robusta Strength.jpg',
  'Signature Espresso Blend': '../IMAGE/Signature Espresso Blend.jpg',
  'Bean Boutique House Blend': '../IMAGE/Bean Boutique House Blend.jpg',
  'Shwe Instant Coffee': '../IMAGE/Shwe Instant Coffee.jpg',
  '3-in-1 Myanmar Coffee Mix': '../IMAGE/3-in-1 Myanmar Coffee Mix.jpg',
  'Cold Brew Special': '../IMAGE/Cold Brew Special.jpg',
  'Limited Edition': '../IMAGE/Limited Edition.jpg'
};

function getBaseNameFromTitle(title) {
  // Split by en dash, em dash, or hyphen surrounded by spaces
  return String(title).split('–')[0].split('—')[0].split(' - ')[0].trim();
}

function getProductImage(title) {
  const base = getBaseNameFromTitle(title);
  return PRODUCT_IMAGE_MAP[base] || `../IMAGE/${base}.jpg`;
}

// Equipment image mapping uses the FULL title as the filename (including any dashes)
const EQUIPMENT_IMAGE_MAP = {
  'Manual Hand Grinder – Classic': '../IMAGE/Manual Hand Grinder.jpg',
  'Electric Burr Grinder – Pro Series': '../IMAGE/Electric Burr Grinder.jpg',
  'Pour-Over Dripper Set': '../IMAGE/Pour-Over Dripper Set.jpg',
  'French Press – Glass & Steel': '../IMAGE/French Press.jpg',
  'Espresso Machine – Compact Home Barista': '../IMAGE/Espresso Machine.jpg',
  'Stainless Steel Milk Frother': '../IMAGE/Stainless Steel Milk Frother.jpg',
  'Digital Coffee Scale with Timer': '../IMAGE/Digital Coffee Scale with Timer.jpg',
  'Cold Brew Maker – 1L Glass Bottle': '../IMAGE/Cold Brew Maker.jpg',
  'AeroPress Style Brewer': '../IMAGE/AeroPress Style Brewer.jpg',
  'Moka Pot – Classic Stovetop Espresso': '../IMAGE/Moka Pot.jpg',
  'Reusable Stainless Steel Coffee Filter': '../IMAGE/Reusable Stainless Steel Coffee Filter.jpg',
  'Latte Art Starter Kit': '../IMAGE/Latte Art Starter Kit.jpg'
};

function getEquipmentImage(title) {
  const base = getBaseNameFromTitle(title);
  return EQUIPMENT_IMAGE_MAP[base] || `../IMAGE/${base}.jpg`;
}

// Session helpers
function getUsers() { return readJSON(STORAGE_KEYS.users, []); }
function saveUsers(users) { writeJSON(STORAGE_KEYS.users, users); }
function getCurrentUser() { return readJSON(STORAGE_KEYS.currentUser, null); }
function setCurrentUser(user) { writeJSON(STORAGE_KEYS.currentUser, user); }
function clearCurrentUser() { localStorage.removeItem(STORAGE_KEYS.currentUser); }

// Cart helpers (per user by id/email)
function getCartKey(userId) { return `${STORAGE_KEYS.carts}:${userId}`; }
function getCart(userId) { return readJSON(getCartKey(userId), []); }
function saveCart(userId, cart) { writeJSON(getCartKey(userId), cart); }

// Orders helpers
function getOrdersKey(userId) { return `${STORAGE_KEYS.orders}:${userId}`; }
function getOrders(userId) { return readJSON(getOrdersKey(userId), []); }
function saveOrders(userId, orders) { writeJSON(getOrdersKey(userId), orders); }

// Events & Workshops
function getEvents() { return readJSON(STORAGE_KEYS.events, []); }
function getWorkshops() { return readJSON(STORAGE_KEYS.workshops, []); }
function seedEventsAndWorkshops() {
  if (!localStorage.getItem(STORAGE_KEYS.events)) {
    writeJSON(STORAGE_KEYS.events, [
      { id: 'ev_ygn_latte_art', title: 'Yangon – Latte Art Basics', location: 'Bean Boutique Yangon', date: 'Oct 12, 2025 – 2:00 PM to 5:00 PM', price: 25, description: 'Learn how to steam milk and pour latte art.' },
      { id: 'ev_mdy_cold_brew', title: 'Mandalay – Cold Brew Creations', location: 'Bean Boutique Mandalay', date: 'Oct 19, 2025 – 10:00 AM to 1:00 PM', price: 30, description: 'Hands-on cold brew recipes and techniques.' },
      { id: 'ev_online_home_brew', title: 'Online – Home Brewing Masterclass', location: 'Zoom', date: 'Oct 26, 2025 – 7:00 PM MMT', price: 20, description: 'Make café-style coffee at home with live Q&A.' },
      { id: 'ev_ygn_cupping', title: 'Yangon – Coffee Cupping & Tasting Night', location: 'Bean Boutique Yangon', date: 'Nov 2, 2025 – 6:00 PM to 8:00 PM', price: 28, description: 'Guided tasting of Myanmar beans.' }
    ]);
  }
  if (!localStorage.getItem(STORAGE_KEYS.workshops)) {
    writeJSON(STORAGE_KEYS.workshops, [
      { id: 'ws_ygn', title: 'Yangon Coffee Workshops', location: 'Downtown Yangon', price: 25, includes: ['Home Brewing Basics','Latte Art for Beginners','Coffee Tasting & Cupping'] },
      { id: 'ws_mdy', title: 'Mandalay Coffee Sessions', location: 'Central Mandalay', price: 30, includes: ['Barista Skills Training','Cold Brew & Summer Drinks','From Bean to Cup'] },
      { id: 'ws_online', title: 'Online Coffee Workshops', location: 'Zoom / Google Meet', price: 20, includes: ['Brew at Home Masterclass','Coffee & Culture Talks','Virtual Cupping Session'] }
    ]);
  }
}
function getEventBookingsKey(userId) { return `${STORAGE_KEYS.eventBookings}:${userId}`; }
function getWorkshopBookingsKey(userId) { return `${STORAGE_KEYS.workshopBookings}:${userId}`; }
function getEventBookings(userId) { return readJSON(getEventBookingsKey(userId), []); }
function getWorkshopBookings(userId) { return readJSON(getWorkshopBookingsKey(userId), []); }
function saveEventBookings(userId, bookings) { writeJSON(getEventBookingsKey(userId), bookings); }
function saveWorkshopBookings(userId, bookings) { writeJSON(getWorkshopBookingsKey(userId), bookings); }

// Subscriptions helpers (per user)
function getSubscriptionsKey(userId) { return `${STORAGE_KEYS.subscriptions}:${userId}`; }
function getSubscriptions(userId) { return readJSON(getSubscriptionsKey(userId), []); }
function saveSubscriptions(userId, list) { writeJSON(getSubscriptionsKey(userId), list); }

// Offers page: wire subscribe buttons to store selected plan
function initOffersSubscribe() {
  const buttons = document.querySelectorAll('[data-subscribe][data-plan]');
  if (!buttons || buttons.length === 0) return;
  const u = getCurrentUser();
  // Reflect existing subscriptions on load
  if (u) {
    const subs = getSubscriptions(u.id);
    buttons.forEach(btn => {
      try {
        const plan = JSON.parse(btn.getAttribute('data-plan'));
        if (subs.some(p => p.id === plan.id)) {
          btn.textContent = 'Subscribed';
          btn.disabled = true;
        }
      } catch (_) {}
    });
  }
  buttons.forEach(btn => btn.addEventListener('click', () => {
    const user = getCurrentUser();
    if (!user) { location.href = 'login.html'; return; }
    let plan;
    try { plan = JSON.parse(btn.getAttribute('data-plan') || '{}'); } catch (_) { plan = null; }
    if (!plan || !plan.id) { alert('Unable to subscribe to this plan.'); return; }
    const list = getSubscriptions(user.id);
    if (!list.some(p => p.id === plan.id)) {
      list.push({ id: plan.id, name: plan.name, price: plan.price, features: plan.features || [] });
      saveSubscriptions(user.id, list);
    }
    btn.textContent = 'Subscribed';
    btn.disabled = true;
    alert(`Subscribed to ${plan.name}`);
  }));
}

// Auth actions
function registerUser({ name, email, password }) {
  const users = getUsers();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email already registered');
  }
  const user = { id: `u_${Date.now()}`, name, email, password };
  users.push(user);
  saveUsers(users);
  setCurrentUser({ id: user.id, name: user.name, email: user.email });
  return user;
}

function loginUser({ email, password }) {
  const users = getUsers();
  const found = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!found) throw new Error('Invalid credentials');
  setCurrentUser({ id: found.id, name: found.name, email: found.email });
  return found;
}

function logoutUser() { clearCurrentUser(); }

// Google Auth (Firebase) with graceful fallback
let firebaseAuth = null;
function initFirebaseAuth() {
  try {
    const cfg = window.BB_FIREBASE_CONFIG || null;
    if (window.firebase && cfg) {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(cfg);
      }
      firebaseAuth = firebase.auth();
    }
  } catch (_) { /* ignore */ }
}

async function googleAuthSignInOrRegister() {
  if (firebaseAuth && window.firebase) {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebaseAuth.signInWithPopup(provider);
    const user = result.user;
    const profile = { id: `g_${user.uid}`, name: user.displayName || 'Google User', email: user.email || `user${Date.now()}@gmail.com` };
    const users = getUsers();
    if (!users.some(u => u.email.toLowerCase() === profile.email.toLowerCase())) {
      users.push({ ...profile, password: '' });
      saveUsers(users);
    }
    setCurrentUser({ id: profile.id, name: profile.name, email: profile.email });
    return profile;
  }
  // Fallback demo user if Firebase not configured
  const demo = { id: `g_${Date.now()}`, name: 'Google User', email: `user${Date.now()}@gmail.com` };
  const users = getUsers();
  if (!users.some(u => u.email.toLowerCase() === demo.email.toLowerCase())) {
    users.push({ ...demo, password: '' });
    saveUsers(users);
  }
  setCurrentUser({ id: demo.id, name: demo.name, email: demo.email });
  return demo;
}

function onTelegramAuth(user) {
  // Telegram widget callback: receives user object
  const profile = { id: `tg_${user.id}`, name: user.first_name, email: `${user.username || user.id}@telegram.local` };
  const users = getUsers();
  if (!users.some(u => u.email.toLowerCase() === profile.email.toLowerCase())) {
    users.push({ ...profile, password: '' });
    saveUsers(users);
  }
  setCurrentUser({ id: profile.id, name: profile.name, email: profile.email });
}
window.onTelegramAuth = onTelegramAuth;

// UI helpers
function updateAuthUI() {
  const isAuthed = !!getCurrentUser();
  document.querySelectorAll('.auth-on').forEach(el => el.classList.toggle('hidden', !isAuthed));
  document.querySelectorAll('.auth-off').forEach(el => el.classList.toggle('hidden', isAuthed));
}

function guardRestrictedPages() {
  const restricted = ['profile.html','cart.html','checkout.html','eventsandworkshops.html','offers.html'];
  const path = location.pathname.split('/').pop() || 'index.html';
  if (restricted.includes(path) && !getCurrentUser()) {
    location.href = 'login.html';
  }
}

function renderYear() {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
}

// Responsive navbar (hamburger) toggle
function initResponsiveNav() {
  const header = document.querySelector('header.navbar');
  if (!header) return;
  const toggle = header.querySelector('.nav-toggle');
  const menu = header.querySelector('.nav-menu');
  if (!toggle || !menu) return;
  function setOpen(open) {
    header.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  toggle.addEventListener('click', () => {
    const isOpen = header.classList.contains('open');
    setOpen(!isOpen);
  });
  // Close when a nav link is clicked (mobile UX)
  menu.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.tagName === 'A') setOpen(false);
  });
  // Close on ESC
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  // Reset on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 600) setOpen(false);
  });
}

// ===== Validation helpers =====
function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}
function passwordStrength(pw) {
  const lengthOK = pw.length >= 8;
  const upper = /[A-Z]/.test(pw);
  const lower = /[a-z]/.test(pw);
  const number = /[0-9]/.test(pw);
  const special = /[^A-Za-z0-9]/.test(pw);
  const score = [lengthOK, upper, lower, number, special].filter(Boolean).length;
  if (!pw) return { label: '', level: 0 };
  if (score <= 2) return { label: 'Weak', level: 1 };
  if (score === 3 || score === 4) return { label: 'Medium', level: 2 };
  return { label: 'Strong', level: 3 };
}
function setStrengthEl(el, data) {
  if (!el) return;
  el.textContent = data.label ? `Password strength: ${data.label}` : '';
  el.style.color = data.level === 1 ? 'var(--danger)' : (data.level === 2 ? '#c28b00' : 'var(--success)');
}
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
  // Also toggle aria-invalid on the control that references this error via aria-describedby
  try {
    const ctrl = document.querySelector(`[aria-describedby~="${id}"]`);
    if (ctrl) ctrl.setAttribute('aria-invalid', msg ? 'true' : 'false');
  } catch (_) { /* ignore */ }
}
function hideError(id) { showError(id, ''); }

// Home: featured
function renderFeatured() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  const items = [
    { id: 'c_shan_arabica', title: 'Shan Highlands Arabica – Medium Roast', price: 18, type: 'coffee' },
    { id: 'c_mdy_dark', title: 'Mandalay Mountain Dark Roast', price: 19, type: 'coffee' },
    { id: 'c_house_blend', title: 'Bean Boutique House Blend', price: 18, type: 'coffee' }
  ];
  grid.innerHTML = items.map(i => `
    <div class="card">
      <img class="product-img" src="${getProductImage(i.title)}" alt="${i.title}">
      <div class="card-body">
        <h3>${i.title}</h3>
        <div class="price">$${i.price.toFixed(2)}<span class="muted">/kg</span></div>
        <div class="field" style="margin-top:10px;">
          <label for="w_${i.id}" class="muted">Select Weight (kg)</label>
          <select id="w_${i.id}" name="weight" required>
            <option value="">-- Choose --</option>
            <option value="0.25">0.25 kg</option>
            <option value="0.5">0.5 kg</option>
            <option value="1">1 kg</option>
            <option value="2">2 kg</option>
          </select>
        </div>
      </div>
      <button data-add data-id="${i.id}" data-title="${i.title}" data-price="${i.price}" data-type="${i.type}">Add to Cart</button>
    </div>
  `).join('');
  grid.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addToCartFromBtn(btn)));

  // Add a "See More" button under the featured grid (once)
  const moreId = 'featuredSeeMore';
  if (!document.getElementById(moreId)) {
    const moreWrap = document.createElement('div');
    moreWrap.id = moreId;
    moreWrap.className = 'actions center';
    moreWrap.style.marginTop = '16px';
    moreWrap.innerHTML = `<a class="btn" href="coffee.html">See More</a>`;
    // Insert after the grid
    grid.parentElement?.insertBefore(moreWrap, grid.nextSibling);
  }
}

// Coffee and Equipment pages
function getCoffeeItems() {
  return [
    { id: 'c_shan_arabica', title: 'Shan Highlands Arabica – Medium Roast', price: 18, type: 'coffee', desc: 'Grown in Shan State, floral notes with a smooth chocolate finish. Great for pour-over/drip.' },
    { id: 'c_mdy_dark', title: 'Mandalay Mountain Dark Roast', price: 19, type: 'coffee', desc: 'Bold and smoky, perfect for espresso lovers.' },
    { id: 'c_gt_blend', title: 'Golden Triangle Blend', price: 17, type: 'coffee', desc: 'Arabica + Robusta blend with mild acidity and nutty undertones.' },
    { id: 'c_ygn_morning', title: 'Yangon Morning Blend', price: 16, type: 'coffee', desc: 'Everyday smooth coffee with hints of caramel and toasted nuts.' },
    { id: 'c_estate_reserve', title: 'Myanmar Estate Reserve', price: 25, type: 'coffee', desc: 'Premium estate beans with berry-like sweetness, limited batch.' },
    { id: 'c_robusta_classic', title: 'Robusta Strength – Myanmar Classic', price: 15, type: 'coffee', desc: 'Strong-bodied Robusta, earthy flavor, traditional Myanmar coffee style.' },
    { id: 'c_sig_espresso', title: 'Signature Espresso Blend', price: 20, type: 'coffee', desc: 'Arabica + Robusta crafted blend for crema and boldness.' },
    { id: 'c_house_blend', title: 'Bean Boutique House Blend', price: 18, type: 'coffee', desc: 'Our signature, versatile everyday blend.' },
    { id: 'c_shwe_instant', title: 'Shwe Instant Coffee – Premium', price: 12, type: 'coffee', desc: 'Freeze-dried instant coffee, 100% Myanmar beans.' },
    { id: 'c_3in1_mix', title: '3-in-1 Myanmar Coffee Mix', price: 10, type: 'coffee', desc: 'Coffee, sugar, creamer in one sachet.' },
    { id: 'c_coldbrew_coarse', title: 'Cold Brew Special – Coarse Grind', price: 19, type: 'coffee', desc: 'Pre-ground beans for cold brew, naturally sweet.' },
    { id: 'c_peaberry_limited', title: 'Limited Edition – Peaberry Selection', price: 28, type: 'coffee', desc: 'Rare peaberry beans, bright acidity and citrus hints.' }
  ];
}

function renderCoffeePage(filterText = '') {
  const grid = document.getElementById('coffeeGrid');
  if (!grid) return;
  const items = getCoffeeItems();
  const q = String(filterText || '').trim().toLowerCase();
  const list = q
    ? items.filter(i => i.title.toLowerCase().includes(q) || (i.desc || '').toLowerCase().includes(q))
    : items;
  const html = list.length > 0 ? list.map(i => `
    <div class="card">
      <img class="product-img" src="${getProductImage(i.title)}" alt="${i.title}">
      <div class="card-body">
        <h3>${i.title}</h3>
        <div class="muted">${i.desc || ''}</div>
        <div class="price">$${i.price.toFixed(2)}<span class="muted">/kg</span></div>
        <div class="field" style="margin-top:10px;">
          <label for="w_${i.id}" class="muted">Select Weight (kg)</label>
          <select id="w_${i.id}" name="weight" required>
            <option value="">-- Choose --</option>
            <option value="0.25">0.25 kg</option>
            <option value="0.5">0.5 kg</option>
            <option value="1">1 kg</option>
            <option value="2">2 kg</option>
          </select>
        </div>
      </div>
      <button data-add data-id="${i.id}" data-title="${i.title}" data-price="${i.price}" data-type="${i.type}">Add to Cart</button>
    </div>
  `).join('') : `<div class="panel center" style="grid-column: 1/-1;">No products found.</div>`;
  // Smooth fade transition
  grid.style.opacity = '0';
  setTimeout(() => {
    grid.innerHTML = html;
    grid.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addToCartFromBtn(btn)));
    requestAnimationFrame(() => { grid.style.opacity = '1'; });
  }, 120);
}

function getEquipmentItems() {
  return [
    { id: 'eq_grinder_manual', title: 'Manual Hand Grinder – Classic', price: 35, type: 'equipment', desc: 'Portable manual grinder for consistent grind sizes.' },
    { id: 'eq_grinder_elec', title: 'Electric Burr Grinder – Pro Series', price: 120, type: 'equipment', desc: 'Powerful electric grinder with multiple settings.' },
    { id: 'eq_pourover_set', title: 'Pour-Over Dripper Set', price: 45, type: 'equipment', desc: 'Complete dripper set for precise pour-over brewing.' },
    { id: 'eq_french_press', title: 'French Press – Glass & Steel', price: 40, type: 'equipment', desc: 'Classic French press with durable glass and steel.' },
    { id: 'eq_espresso_compact', title: 'Espresso Machine – Compact Home Barista', price: 280, type: 'equipment', desc: 'Compact espresso machine for home baristas.' },
    { id: 'eq_milk_frother', title: 'Stainless Steel Milk Frother', price: 25, type: 'equipment', desc: 'Create silky microfoam for lattes and cappuccinos.' },
    { id: 'eq_scale_timer', title: 'Digital Coffee Scale with Timer', price: 30, type: 'equipment', desc: 'Accurate scale with built-in timer for brewing.' },
    { id: 'eq_coldbrew_maker', title: 'Cold Brew Maker – 1L Glass Bottle', price: 38, type: 'equipment', desc: 'Brew smooth cold brew at home with ease.' },
    { id: 'eq_aeropress', title: 'AeroPress Style Brewer', price: 45, type: 'equipment', desc: 'Versatile brewer for rich, clean coffee.' },
    { id: 'eq_moka_pot', title: 'Moka Pot – Classic Stovetop Espresso', price: 35, type: 'equipment', desc: 'Traditional stovetop espresso maker.' },
    { id: 'eq_reusable_filter', title: 'Reusable Stainless Steel Coffee Filter', price: 15, type: 'equipment', desc: 'Eco-friendly reusable filter for drip coffee.' },
    { id: 'eq_latte_art_kit', title: 'Latte Art Starter Kit', price: 28, type: 'equipment', desc: 'Beginner kit with tools for latte art.' }
  ];
}

function renderEquipmentPage(filterText = '') {
  const grid = document.getElementById('equipmentGrid');
  if (!grid) return;
  const items = getEquipmentItems();
  const q = String(filterText || '').trim().toLowerCase();
  const list = q
    ? items.filter(i => i.title.toLowerCase().includes(q) || (i.desc || '').toLowerCase().includes(q))
    : items;
  const html = list.length > 0 ? list.map(i => `
    <div class="card">
      <img class="product-img" src="${getEquipmentImage(i.title)}" alt="${i.title}">
      <div class="card-body">
        <h3>${i.title}</h3>
        <div class="muted">${i.desc || ''}</div>
        <div class="price">$${i.price.toFixed(2)}</div>
        <div class="field" style="margin-top:10px;">
          <label for="q_${i.id}" class="muted">Quantity</label>
          <input id="q_${i.id}" name="quantity" type="number" min="1" max="10" placeholder="Select quantity" />
        </div>
      </div>
      <button data-add data-id="${i.id}" data-title="${i.title}" data-price="${i.price}" data-type="${i.type}">Add to Cart</button>
    </div>
  `).join('') : `<div class=\"panel center\" style=\"grid-column: 1/-1;\">No products found.</div>`;
  // Smooth fade transition
  grid.style.opacity = '0';
  setTimeout(() => {
    grid.innerHTML = html;
    grid.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addToCartFromBtn(btn)));
    requestAnimationFrame(() => { grid.style.opacity = '1'; });
  }, 120);
}

function addToCartFromBtn(btn) {
  const user = getCurrentUser();
  if (!user) { location.href = 'login.html'; return; }
  const type = btn.getAttribute('data-type');
  const baseItem = {
    id: btn.getAttribute('data-id'),
    title: btn.getAttribute('data-title'),
    price: Number(btn.getAttribute('data-price')),
    type,
    qty: 1
  };
  // Locate inputs within the same card
  const card = btn.closest('.card');
  if (type === 'coffee') {
    const weightSel = card ? card.querySelector('select[name="weight"]') : null;
    const weightVal = weightSel ? parseFloat(weightSel.value) : NaN;
    if (!weightSel || isNaN(weightVal)) {
      alert('Please select a weight before adding to the cart.');
      return;
    }
    baseItem.weightKg = weightVal; // store selected weight (kg)
    // Optionally, include a label for display convenience
    baseItem.weightLabel = `${weightVal} kg`;
  } else if (type === 'equipment') {
    const qtyInp = card ? card.querySelector('[name="quantity"]') : null;
    let q = qtyInp ? parseInt(qtyInp.value, 10) : NaN;
    if (!qtyInp || isNaN(q) || q < 1) {
      alert('Please select a quantity before adding to the cart.');
      return;
    }
    if (q > 10) q = 10;
    baseItem.qty = q; // initial quantity from selection
  }
  const cart = getCart(user.id);
  // Merge logic: consider weight for coffee as part of uniqueness
  function keyMatch(c) {
    return c.id === baseItem.id && (type !== 'coffee' || c.weightKg === baseItem.weightKg);
  }
  const existing = cart.find(keyMatch);
  if (existing) {
    existing.qty += baseItem.qty;
  } else {
    cart.push(baseItem);
  }
  saveCart(user.id, cart);
  alert('Added to cart');
}

// Cart rendering
function renderCart() {
  const table = document.getElementById('cartTable');
  if (!table) return;
  const user = getCurrentUser(); if (!user) return;
  const cart = getCart(user.id);
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = cart.map(item => {
    const isCoffee = item.type === 'coffee';
    const weightInfo = isCoffee && item.weightKg ? `<div class="muted">Weight: ${item.weightKg} kg</div>` : '';
    const subtotal = isCoffee
      ? item.price * (item.weightKg || 1) * item.qty
      : item.price * item.qty;
    const qtyAria = `Quantity for ${item.title}${isCoffee && item.weightKg ? `, ${item.weightKg} kg` : ''}`;
    const remAria = `Remove ${item.title}${isCoffee && item.weightKg ? `, ${item.weightKg} kg` : ''} from cart`;
    return `
      <tr>
        <td>${item.title}${weightInfo}</td>
        <td>$${item.price.toFixed(2)}${isCoffee ? '<span class="muted">/kg</span>' : ''}</td>
        <td>
          <input type="number" min="1" value="${item.qty}" aria-label="${qtyAria}" data-qty data-id="${item.id}" ${isCoffee && item.weightKg !== undefined ? `data-weight="${item.weightKg}"` : ''} style="width:70px" />
        </td>
        <td class="right">$${subtotal.toFixed(2)}</td>
        <td><button class="btn danger" aria-label="${remAria}" data-remove data-id="${item.id}" ${isCoffee && item.weightKg !== undefined ? `data-weight="${item.weightKg}"` : ''}>Remove</button></td>
      </tr>
    `;
  }).join('');
  const total = cart.reduce((s, i) => s + (i.type === 'coffee' ? i.price * (i.weightKg || 1) * i.qty : i.price * i.qty), 0);
  const totalEl = document.getElementById('cartTotal');
  if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
  tbody.querySelectorAll('[data-qty]').forEach(inp => inp.addEventListener('change', onQtyChange));
  tbody.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', onRemoveItem));
}
function onQtyChange(e) {
  const user = getCurrentUser(); if (!user) return;
  const id = e.target.getAttribute('data-id');
  const weight = e.target.getAttribute('data-weight');
  const cart = getCart(user.id);
  const item = cart.find(i => i.id === id && (weight ? String(i.weightKg) === String(weight) : true));
  item.qty = Math.max(1, Number(e.target.value || 1));
  saveCart(user.id, cart);
  renderCart();
}
function onRemoveItem(e) {
  const user = getCurrentUser(); if (!user) return;
  const id = e.target.getAttribute('data-id');
  const weight = e.target.getAttribute('data-weight');
  const cart = getCart(user.id).filter(i => !(i.id === id && (weight ? String(i.weightKg) === String(weight) : true)));
  saveCart(user.id, cart);
  renderCart();
}

// Checkout
function initCheckout() {
  const form = document.getElementById('checkoutForm');
  if (!form) return;
  const user = getCurrentUser(); if (!user) return;
  // Validate new fields accessibly
  function validate() {
    const nameEl = document.getElementById('fullName');
    const phoneEl = document.getElementById('phone');
    const postalEl = document.getElementById('postal');
    const addressEl = document.getElementById('address');
    const paymentEl = document.getElementById('payment');
    let ok = true;
    if (!nameEl || !nameEl.value.trim()) { showError('fullNameError', 'Full name is required'); ok = false; } else hideError('fullNameError');
    if (phoneEl) {
      const raw = String(phoneEl.value || '').replace(/[^\d]/g, '');
      if (!/^\d{7,15}$/.test(raw)) { showError('phoneError', 'Enter 7–15 digits'); ok = false; } else hideError('phoneError');
    }
    if (!postalEl || !String(postalEl.value || '').trim()) { showError('postalError', 'Postal code is required'); ok = false; } else hideError('postalError');
    if (!addressEl || !addressEl.value.trim()) { showError('addressError', 'Address is required'); ok = false; } else hideError('addressError');
    if (!paymentEl || !paymentEl.value) { showError('paymentError', 'Payment method is required'); ok = false; } else hideError('paymentError');
    return ok;
  }
  // Live validation
  ['input','blur','change'].forEach(evt => form.addEventListener(evt, (e) => {
    if (e && e.target && e.target.id === 'phone') {
      // Soft sanitize to digits only while typing
      e.target.value = e.target.value.replace(/[^\d]/g, '');
    }
    validate();
  }, true));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) {
      const firstInvalid = form.querySelector('[aria-invalid="true"], .error');
      if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const cart = getCart(user.id);
    if (cart.length === 0) { alert('Your cart is empty'); return; }
    // Compute total with a simple loop (beginner-friendly) -> same behavior as previous reduce
    var totalSimple = 0;
    for (var i = 0; i < cart.length; i++) {
      totalSimple += cart[i].price * cart[i].qty;
    }
    const order = {
      id: `o_${Date.now()}`,
      items: cart,
      total: totalSimple,
      address: data.address,
      payment: data.payment,
      date: new Date().toISOString()
    };
    const orders = getOrders(user.id);
    orders.push(order);
    saveOrders(user.id, orders);
    saveCart(user.id, []);
    alert('Order placed!');
    location.href = 'profile.html';
  });
}

// Profile rendering
function renderProfile() {
  const ordersEl = document.getElementById('ordersList');
  const eventsEl = document.getElementById('myEvents');
  const workshopsEl = document.getElementById('myWorkshops');
  const subsEl = document.getElementById('mySubscriptions');
  const user = getCurrentUser();
  if (!user) return;
  if (ordersEl) {
    const orders = getOrders(user.id);
    if (orders.length === 0) {
      ordersEl.innerHTML = '<p class="muted">No orders yet.</p>';
    } else {
      ordersEl.innerHTML = orders.map(o => `
        <div class="card">
          <div class="card-body">
            <h3>Order ${o.id}</h3>
            <div class="muted">${new Date(o.date).toLocaleString()}</div>
            <ul>
              ${o.items.map(i=>`<li>${i.qty} × ${i.title} — $${(i.qty*i.price).toFixed(2)}`).join('')}
            </ul>
            <div class="actions" style="justify-content: space-between; align-items: center;">
              <strong>Total: $${o.total.toFixed(2)}</strong>
              <button class="btn" data-cancel-order data-id="${o.id}">Cancel Order</button>
            </div>
          </div>
        </div>
      `).join('');
      // Wire up cancel order buttons
      ordersEl.querySelectorAll('[data-cancel-order]').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to cancel this order?')) return;
        const id = btn.getAttribute('data-id');
        const list = getOrders(user.id).filter(o => o.id !== id);
        saveOrders(user.id, list);
        alert('Order cancelled');
        renderProfile();
      }));
    }
  }
  if (eventsEl) {
    const eventBookings = getEventBookings(user.id);
    const events = getEvents().filter(ev => eventBookings.includes(ev.id));
    if (events.length === 0) {
      eventsEl.innerHTML = '<p class="muted">No event bookings yet.</p>';
    } else {
      eventsEl.innerHTML = events.map(ev => `
        <div class="panel" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div>${ev.title} — ${ev.date}</div>
          <button class="btn" data-cancel-event data-id="${ev.id}">Cancel</button>
        </div>
      `).join('');
      // Wire up cancel event buttons
      eventsEl.querySelectorAll('[data-cancel-event]').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to cancel this event?')) return;
        const id = btn.getAttribute('data-id');
        const bookings = getEventBookings(user.id).filter(eid => eid !== id);
        saveEventBookings(user.id, bookings);
        alert('Event cancelled');
        renderProfile();
      }));
    }
  }
  if (workshopsEl) {
    const wsBookings = getWorkshopBookings(user.id);
    const ws = getWorkshops().filter(w => wsBookings.includes(w.id));
    if (ws.length === 0) {
      workshopsEl.innerHTML = '<p class="muted">No workshop bookings yet.</p>';
    } else {
      workshopsEl.innerHTML = ws.map(w => `
        <div class="panel" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div>${w.title} — ${w.location}</div>
          <button class="btn" data-cancel-workshop data-id="${w.id}">Cancel</button>
        </div>
      `).join('');
      // Wire up cancel workshop buttons
      workshopsEl.querySelectorAll('[data-cancel-workshop]').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to cancel this workshop?')) return;
        const id = btn.getAttribute('data-id');
        const bookings = getWorkshopBookings(user.id).filter(wid => wid !== id);
        saveWorkshopBookings(user.id, bookings);
        alert('Workshop cancelled');
        renderProfile();
      }));
    }
  }
  if (subsEl) {
    const subs = getSubscriptions(user.id);
    if (!subs || subs.length === 0) {
      subsEl.innerHTML = '<p class="muted">You have no active subscriptions.</p>';
    } else {
      subsEl.innerHTML = subs.map(p => `
        <div class="card">
          <div class="card-body">
            <h3>${p.name}</h3>
            <div class="price">$${Number(p.price || 0).toFixed(0)}<span class="muted">/month</span></div>
            ${Array.isArray(p.features) && p.features.length ? `<ul>${p.features.map(f=>`<li>${f}</li>`).join('')}</ul>` : ''}
          </div>
        </div>
      `).join('');
    }
  }
}

// Events & Workshops page
function renderEventsAndWorkshopsPage() {
  const evList = document.getElementById('eventsList');
  const wsList = document.getElementById('workshopsList');
  if (!evList && !wsList) return;
  seedEventsAndWorkshops();
  const user = getCurrentUser();
  const evJoined = user ? getEventBookings(user.id) : [];
  const wsJoined = user ? getWorkshopBookings(user.id) : [];
  const events = getEvents();
  const workshops = getWorkshops();

  if (evList) {
    evList.innerHTML = events.map(ev => `
      <div class="card">
        <div class="card-body">
          <h3>${ev.title}</h3>
          <div class="muted">📍 ${ev.location}</div>
          <div class="muted">📆 ${ev.date}</div>
          <div class="price">$${ev.price.toFixed(2)}/person</div>
          <p class="muted">${ev.description}</p>
          <div class="actions">
            <button class="btn" data-join-event data-id="${ev.id}">${evJoined.includes(ev.id) ? 'Joined' : 'Join'}</button>
          </div>
        </div>
      </div>
    `).join('');
  }
  if (wsList) {
    wsList.innerHTML = workshops.map(w => `
      <div class="card">
        <div class="card-body">
          <h3>${w.title}</h3>
          <div class="muted">Location: ${w.location}</div>
          <div class="price">From $${w.price.toFixed(2)}/person</div>
          <ul>${(w.includes||[]).map(i=>`<li>${i}</li>`).join('')}</ul>
          <div class="actions">
            <button class="btn" data-join-workshop data-id="${w.id}">${wsJoined.includes(w.id) ? 'Joined' : 'Join'}</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  document.querySelectorAll('[data-join-event]').forEach(btn => btn.addEventListener('click', () => {
    const u = getCurrentUser();
    if (!u) { location.href = 'login.html'; return; }
    const id = btn.getAttribute('data-id');
    openJoinModal('event', id, btn);
  }));
  document.querySelectorAll('[data-join-workshop]').forEach(btn => btn.addEventListener('click', () => {
    const u = getCurrentUser();
    if (!u) { location.href = 'login.html'; return; }
    const id = btn.getAttribute('data-id');
    openJoinModal('workshop', id, btn);
  }));
}

// Offers modal on home for guests (accessible)
function initOfferModal() {
  const backdrop = document.getElementById('offerModal');
  if (!backdrop) return;
  const closeBtn = backdrop.querySelector('[data-close-offer]');
  let lastFocused = null;

  function open() {
    if (getCurrentUser()) return; // do not show for logged-in users
    lastFocused = document.activeElement;
    backdrop.classList.add('show');
    backdrop.setAttribute('aria-hidden', 'false');
    // move focus to first interactive element inside the modal
    setTimeout(() => {
      const first = backdrop.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      first?.focus();
    }, 0);
  }

  function close() {
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden', 'true');
    // restore focus to previously focused element
    setTimeout(() => { if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus(); }, 0);
  }

  // Show immediately for guests
  if (!getCurrentUser()) open();

  // Close handlers
  closeBtn?.addEventListener('click', () => close());
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const focusables = Array.from(backdrop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

// Accessible Contact form handling with aria-live error messages
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const nameEl = document.getElementById('contactName');
  const emailEl = document.getElementById('contactEmail');
  const msgEl = document.getElementById('contactMessage');
  const statusEl = document.getElementById('contactFormStatus');

  function setErr(el, errId, msg) {
    const p = document.getElementById(errId);
    if (p) p.textContent = msg || '';
    if (el) el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validate() {
    let ok = true;
    if (!nameEl.value.trim()) { setErr(nameEl, 'contactNameError', 'Name is required'); ok = false; } else setErr(nameEl, 'contactNameError', '');
    const email = (emailEl.value || '').trim();
    if (!emailIsValid(email)) { setErr(emailEl, 'contactEmailError', 'Please enter a valid email'); ok = false; } else setErr(emailEl, 'contactEmailError', '');
    if (!msgEl.value.trim()) { setErr(msgEl, 'contactMessageError', 'Message is required'); ok = false; } else setErr(msgEl, 'contactMessageError', '');
    return ok;
  }

  ['input', 'blur'].forEach(evt => form.addEventListener(evt, () => validate(), true));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = validate();
    if (!ok) {
      if (statusEl) statusEl.textContent = 'Please fix the errors in the form.';
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();
      return;
    }
    if (statusEl) statusEl.textContent = 'Message sent successfully.';
    form.reset();
  });
}

// Page boot
document.addEventListener('DOMContentLoaded', () => {
  initFirebaseAuth();
  initResponsiveNav();
  updateAuthUI();
  guardRestrictedPages();
  renderYear();

  // Ensure all auth-related errors are hidden by default on page load
  (function resetAuthErrors() {
    const ids = [
      // Login
      'loginEmailError','loginPasswordError','loginCaptchaError',
      // Register
      'regNameError','regEmailError','regPasswordError','regConfirmError','regCaptchaError'
    ];
    ids.forEach(id => hideError(id));
  })();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => { logoutUser(); location.href = 'index.html'; });

  // Forms
  const reg = document.getElementById('registerForm');
  if (reg) {
    const nameEl = document.getElementById('regName');
    const emailEl = document.getElementById('regEmail');
    const pwEl = document.getElementById('regPassword');
    const pw2El = document.getElementById('regConfirm');
    const notRobotEl = document.getElementById('regNotRobot');
    const strengthEl = document.getElementById('regPasswordStrength');

    // Live password strength
    pwEl?.addEventListener('input', () => {
      const s = passwordStrength(pwEl.value);
      setStrengthEl(strengthEl, s);
    });

    // Show errors on blur only
    nameEl?.addEventListener('blur', () => { if (!nameEl.value.trim()) showError('regNameError', 'Name is required'); else hideError('regNameError'); });
    emailEl?.addEventListener('blur', () => { if (!emailIsValid(emailEl.value.trim())) showError('regEmailError', 'Please enter a valid email'); else hideError('regEmailError'); });
    pwEl?.addEventListener('blur', () => {
      const v = pwEl.value;
      const valid = v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v);
      if (!valid) showError('regPasswordError', 'Password does not meet requirements'); else hideError('regPasswordError');
    });
    pw2El?.addEventListener('blur', () => { if (pw2El.value !== pwEl.value) showError('regConfirmError', 'Passwords do not match'); else hideError('regConfirmError'); });

    reg.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = nameEl.value.trim();
      const email = emailEl.value.trim();
      const password = pwEl.value;
      const confirm = pw2El.value;
      let ok = true;
      if (!name) { showError('regNameError', 'Name is required'); ok = false; }
      if (!emailIsValid(email)) { showError('regEmailError', 'Please enter a valid email'); ok = false; }
      const validPw = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
      if (!validPw) { showError('regPasswordError', 'Password does not meet requirements'); ok = false; }
      if (confirm !== password) { showError('regConfirmError', 'Passwords do not match'); ok = false; }
      // reCAPTCHA validation for Register
      try {
        if (typeof grecaptcha === 'undefined') {
          showError('regCaptchaError', 'Captcha service unavailable, please try again later');
          ok = false;
        } else {
          const token = grecaptcha.getResponse();
          if (!token) { showError('regCaptchaError', 'Please complete reCAPTCHA'); ok = false; }
          else { hideError('regCaptchaError'); }
        }
      } catch (_) {
        showError('regCaptchaError', 'Captcha service unavailable, please try again later');
        ok = false;
      }
      if (!ok) return;
      try {
        registerUser({ name, email, password });
        location.href = 'index.html';
      } catch (err) { alert(err.message); }
    });

    // Fake social buttons
    document.getElementById('googleRegister')?.addEventListener('click', () => alert('Google signup is currently unavailable – please use email signup.'));
    document.getElementById('facebookRegister')?.addEventListener('click', () => alert('Facebook signup is currently unavailable – please use email signup.'));
  }

  const login = document.getElementById('loginForm');
  if (login) {
    const emailEl = document.getElementById('loginEmail');
    const pwEl = document.getElementById('loginPassword');
    // reCAPTCHA is rendered in HTML; no checkbox fallback

    // Show errors on blur only
    emailEl?.addEventListener('blur', () => { if (!emailEl.value.trim()) showError('loginEmailError', 'Email is required'); else hideError('loginEmailError'); });
    pwEl?.addEventListener('blur', () => { if (!pwEl.value) showError('loginPasswordError', 'Password is required'); else hideError('loginPasswordError'); });

    login.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = emailEl.value.trim();
      const password = pwEl.value;
      let ok = true;
      if (!email) { showError('loginEmailError', 'Email is required'); ok = false; }
      if (!password) { showError('loginPasswordError', 'Password is required'); ok = false; }
      // reCAPTCHA validation for Login
      try {
        if (typeof grecaptcha === 'undefined') {
          showError('loginCaptchaError', 'Captcha service unavailable, please try again later');
          ok = false;
        } else {
          const token = grecaptcha.getResponse();
          if (!token) { showError('loginCaptchaError', 'Please complete reCAPTCHA'); ok = false; }
          else { hideError('loginCaptchaError'); }
        }
      } catch (_) {
        showError('loginCaptchaError', 'Captcha service unavailable, please try again later');
        ok = false;
      }
      if (!ok) return;
      try {
        loginUser({ email, password });
        location.href = 'index.html';
      } catch (err) {
        showError('loginPasswordError', 'Invalid email or password');
      }
    });

    // Fake social buttons
    document.getElementById('googleLogin')?.addEventListener('click', () => alert('Google login is currently unavailable – please use email login.'));
    document.getElementById('facebookLogin')?.addEventListener('click', () => alert('Facebook login is currently unavailable – please use email login.'));
  }

  // Keep optional Google auth buttons functional on pages that still include them intentionally
  const gLoginReal = document.getElementById('googleLoginReal');
  if (gLoginReal) gLoginReal.addEventListener('click', async ()=> { await googleAuthSignInOrRegister(); location.href = 'index.html'; });
  const gRegReal = document.getElementById('googleRegisterReal');
  if (gRegReal) gRegReal.addEventListener('click', async ()=> { await googleAuthSignInOrRegister(); location.href = 'index.html'; });

  renderFeatured();
  renderCoffeePage();
  renderEquipmentPage();

  // Wire up live search inputs (case-insensitive), without breaking add-to-cart
  const coffeeSearch = document.getElementById('searchCoffee');
  if (coffeeSearch) {
    coffeeSearch.addEventListener('input', (e) => {
      renderCoffeePage(e.target.value || '');
    });
  }
  const equipmentSearch = document.getElementById('searchEquipment');
  if (equipmentSearch) {
    equipmentSearch.addEventListener('input', (e) => {
      renderEquipmentPage(e.target.value || '');
    });
  }
  renderCart();
  initCheckout();
  renderProfile();
  renderEventsAndWorkshopsPage();
  setupJoinModal();
  initOfferModal();
  initOffersSubscribe();
  initContactForm();
});



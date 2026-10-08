'use strict';
/* =========================================================================
   Фотостудия «Малина» — г. Белорецк
   Сервер на чистом Node.js (без внешних зависимостей).

   Запуск:   node server.js
   Адрес:    http://localhost:4321
   Данные:   data/db.json  +  data/uploads/*
   ========================================================================= */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = __dirname;
// Папку с данными можно вынести на постоянный диск хостинга:  DATA_DIR=/var/data npm start
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 80 * 1024 * 1024;      // общий лимит тела запроса
const MAX_PHOTO_BYTES = 12 * 1024 * 1024; // одно фото, байт
const TOKEN_TTL = 12 * 60 * 60 * 1000;  // сессия админа — 12 часов

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* =========================== НАСТРОЙКИ ПО УМОЛЧАНИЮ ======================= */

const DEFAULT_SETTINGS = {
  studioName: 'Малина',
  tagline: 'фотостудия',
  city: 'Белорецк',
  address: 'г. Белорецк, ул. Ленина, 24, 2 этаж, студия «Малина»',
  phone: '+7 (999) 123-45-67',
  whatsapp: '+79991234567',
  telegram: 'malina_beloretsk',
  email: 'hello@malina-studio.ru',
  instagram: 'malina.studio',
  vk: 'malina_beloretsk',
  workHours: 'Ежедневно с 09:00 до 21:00',
  heroTitle: 'Ваши истории в мягком свете',
  heroSubtitle:
    'Портретные, семейные и Love Story съёмки в Белорецке. Уютная студия, естественный свет и фотограф, который помогает расслабиться перед камерой.',
  about:
    '«Малина» — небольшая студия в центре Белорецка. Мы работаем с естественным светом, любим тёплые оттенки и спокойный ритм съёмки. Приходите с семьёй, второй половинкой или просто за красивым портретом — поможем выбрать образ, позу и настроение.',
  // время, доступное для брони
  slotTimes: ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'],
  services: [
    { id: 's1', name: 'Портретная съёмка', price: 3500, duration: '1 час', note: '1 образ, 30 обработанных кадров' },
    { id: 's2', name: 'Love Story', price: 5500, duration: '1,5 часа', note: '2 локации, 50 обработанных кадров' },
    { id: 's3', name: 'Семейная съёмка', price: 5000, duration: '1,5 часа', note: 'до 5 человек, 50 обработанных кадров' },
    { id: 's4', name: 'Детская съёмка', price: 3000, duration: '1 час', note: 'с 6 месяцев, 30 обработанных кадров' },
    { id: 's5', name: 'Свадебная съёмка', price: 14000, duration: '4 часа', note: 'полный день, 200+ обработанных кадров' },
    { id: 's6', name: 'Съёмка для бренда', price: 6500, duration: '2 часа', note: 'контент для соцсетей и маркетплейсов' },
  ],
  adminLogin: 'admin',
  paymentNote: 'Бронирование без предоплаты. Оплата на месте — картой или наличными.',
  bookingNote: 'Слот закрепляется за вами сразу после отправки заявки и становится недоступен другим гостям.',
};

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function makePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashPassword(password, salt) };
}

/* ============================== БАЗА ДАННЫХ ============================== */

let db = null;
let saveTimer = null;

function defaultDb() {
  const pass = makePassword('malina2024');
  return {
    secret: crypto.randomBytes(32).toString('hex'),
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      adminPassSalt: pass.salt,
      adminPassHash: pass.hash,
    }),
    photos: [],
    bookings: [],
    guests: [],
    blocks: [],
    createdAt: new Date().toISOString(),
  };
}

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = Object.assign(defaultDb(), parsed);
    db.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {});
    if (!Array.isArray(db.photos)) db.photos = [];
    if (!Array.isArray(db.bookings)) db.bookings = [];
    if (!Array.isArray(db.guests)) db.guests = [];
    if (!Array.isArray(db.blocks)) db.blocks = [];
    if (!db.secret) db.secret = crypto.randomBytes(32).toString('hex');
    if (!db.settings.adminPassHash) {
      const pass = makePassword('malina2024');
      db.settings.adminPassSalt = pass.salt;
      db.settings.adminPassHash = pass.hash;
    }
  } catch (err) {
    db = defaultDb();
    saveDb(true);
  }
}

function saveDb(immediate) {
  const write = () => {
    try {
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('[db] не удалось сохранить:', err.message);
    }
  };
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    write();
    return;
  }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    write();
  }, 120);
}

function uid(prefix) {
  return (prefix || 'id') + '-' + crypto.randomBytes(5).toString('hex');
}

/* ============================ ЖИВЫЕ ОБНОВЛЕНИЯ (SSE) ===================== */

const sseClients = new Set();

function broadcast(type, payload) {
  const chunk = `event: ${type}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(chunk);
    } catch (err) {
      sseClients.delete(res);
    }
  }
}

/* ============================== УТИЛИТЫ ================================= */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Слишком большой файл. Максимум ~60 МБ за раз.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (err) {
    throw new Error('Некорректный JSON в запросе');
  }
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function todayStr() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function isDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function normalizePhone(phone) {
  let d = digitsOnly(phone);
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d;
}

function publicSettings() {
  const s = db.settings;
  return {
    studioName: s.studioName,
    tagline: s.tagline,
    city: s.city,
    address: s.address,
    phone: s.phone,
    whatsapp: s.whatsapp,
    telegram: s.telegram,
    email: s.email,
    instagram: s.instagram,
    vk: s.vk,
    workHours: s.workHours,
    heroTitle: s.heroTitle,
    heroSubtitle: s.heroSubtitle,
    about: s.about,
    slotTimes: s.slotTimes,
    services: s.services,
    paymentNote: s.paymentNote,
    bookingNote: s.bookingNote,
    // подсказка на лендинге видна только пока пароль остался стандартным
    defaultPassword: hashPassword('malina2024', s.adminPassSalt) === s.adminPassHash,
  };
}

/* ============================== СЕССИИ АДМИНА =========================== */

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', db.secret).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', db.secret).update(parts[0]).digest('base64url');
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
  if (!payload || payload.role !== 'admin') return null;
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function isAdmin(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return !!verifyToken(token);
}

const loginAttempts = new Map();

function tooManyAttempts(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (rec.until < Date.now()) {
    loginAttempts.delete(ip);
    return false;
  }
  return rec.count >= 8;
}

function noteFailedLogin(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, until: Date.now() + 10 * 60 * 1000 };
  rec.count += 1;
  rec.until = Date.now() + 10 * 60 * 1000;
  loginAttempts.set(ip, rec);
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

/* ============================== ЗАНЯТОСТЬ =============================== */

const OCCUPYING_STATUSES = ['new', 'confirmed'];

function occupiedMap() {
  const map = new Map(); // "дата|время" -> { type, booking }
  for (const b of db.bookings) {
    if (!OCCUPYING_STATUSES.includes(b.status)) continue;
    map.set(b.date + '|' + b.time, { type: 'booking', booking: b });
  }
  for (const bl of db.blocks) {
    map.set(bl.date + '|' + bl.time, { type: 'block', block: bl });
  }
  return map;
}

function slotsForDate(date) {
  const map = occupiedMap();
  return (db.settings.slotTimes || []).map((time) => {
    const hit = map.get(date + '|' + time);
    return {
      time,
      status: hit ? (hit.type === 'block' ? 'blocked' : 'busy') : 'free',
    };
  });
}

function scheduleForRange(fromDate, days) {
  const out = [];
  const start = new Date(fromDate + 'T00:00:00');
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start.getTime());
    d.setDate(start.getDate() + i);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const date = `${d.getFullYear()}-${m}-${day}`;
    const slots = slotsForDate(date);
    const busy = slots.filter((s) => s.status !== 'free').length;
    out.push({ date, total: slots.length, busy, free: slots.length - busy });
  }
  return out;
}

/* ============================== ФОТО =================================== */

const ALLOWED_IMAGE_MIME = {
  'image/jpeg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

function savePhotoFromDataUrl(dataUrl, originalName) {
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Не удалось прочитать файл изображения');
  const mime = match[1].toLowerCase();
  const ext = ALLOWED_IMAGE_MIME[mime];
  if (!ext) throw new Error('Поддерживаются JPG, PNG, WEBP, GIF, AVIF и SVG');
  const buf = Buffer.from(match[2], 'base64');
  if (!buf.length) throw new Error('Пустой файл');
  if (buf.length > MAX_PHOTO_BYTES) {
    throw new Error(`Файл больше ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} МБ — сожмите фото и попробуйте снова`);
  }
  const id = uid('photo');
  const fileName = id + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buf);
  return {
    id,
    file: fileName,
    url: '/media/' + fileName,
    size: buf.length,
    originalName: String(originalName || '').slice(0, 160),
    mime,
  };
}

function deletePhotoFile(url) {
  const name = path.basename(String(url || ''));
  if (!name) return;
  const full = path.join(UPLOAD_DIR, name);
  if (full.startsWith(UPLOAD_DIR) && fs.existsSync(full)) {
    try {
      fs.unlinkSync(full);
    } catch (err) {
      /* файл мог быть уже удалён */
    }
  }
}

function publicPhotos() {
  return db.photos
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((p) => ({
      id: p.id,
      url: p.url,
      title: p.title || '',
      category: p.category || '',
      createdAt: p.createdAt,
    }));
}

/* ============================ ОБРАБОТКА API ============================= */

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const q = url.searchParams;
  const ip = (req.socket.remoteAddress || 'local') + '';

  /* ---------------------------- публичное ---------------------------- */

  if (p === '/api/settings' && method === 'GET') {
    return sendJson(res, 200, { ok: true, settings: publicSettings() });
  }

  if (p === '/api/photos' && method === 'GET') {
    return sendJson(res, 200, { ok: true, photos: publicPhotos() });
  }

  if (p === '/api/slots' && method === 'GET') {
    const date = String(q.get('date') || '');
    if (!isDateStr(date)) return sendError(res, 400, 'Укажите дату в формате ГГГГ-ММ-ДД');
    return sendJson(res, 200, { ok: true, date, slots: slotsForDate(date) });
  }

  if (p === '/api/schedule' && method === 'GET') {
    const from = isDateStr(q.get('from')) ? q.get('from') : todayStr();
    const days = Math.min(31, Math.max(1, Number(q.get('days')) || 14));
    return sendJson(res, 200, { ok: true, from, days, days_list: scheduleForRange(from, days) });
  }

  if (p === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: hello\ndata: {"ok":true}\n\n`);
    sseClients.add(res);
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (err) {
        /* соединение уже закрыто */
      }
    }, 25000);
    req.on('close', () => {
      clearInterval(ping);
      sseClients.delete(res);
    });
    return;
  }

  /* --------------------------- бронирование -------------------------- */

  if (p === '/api/bookings' && method === 'POST') {
    const body = await readJson(req);
    const name = String(body.name || '').trim();
    const phoneRaw = String(body.phone || '').trim();
    const phone = normalizePhone(phoneRaw);
    const date = String(body.date || '');
    const time = String(body.time || '');
    const serviceId = String(body.serviceId || '');
    const people = Math.min(20, Math.max(1, Number(body.people) || 1));
    const comment = String(body.comment || '').slice(0, 2000);
    const preferences = String(body.preferences || '').slice(0, 2000);
    const email = String(body.email || '').trim().slice(0, 120);
    const source = String(body.source || '').slice(0, 120);
    const agree = !!body.agree;

    if (name.length < 2) return sendError(res, 400, 'Укажите имя (минимум 2 символа)');
    if (phone.length !== 11) return sendError(res, 400, 'Укажите телефон в формате +7 (999) 123-45-67');
    if (!isDateStr(date)) return sendError(res, 400, 'Выберите дату съёмки');
    if (!(db.settings.slotTimes || []).includes(time)) return sendError(res, 400, 'Выберите время съёмки');
    if (date < todayStr()) return sendError(res, 400, 'Эта дата уже прошла — выберите другую');
    if (!agree) return sendError(res, 400, 'Нужно согласие на обработку данных');
    const service = (db.settings.services || []).find((s) => s.id === serviceId) || null;

    // Проверка и запись — синхронно, в одном тике: два гостя не займут один слот
    const map = occupiedMap();
    const key = date + '|' + time;
    const hit = map.get(key);
    if (hit) {
      return sendJson(res, 409, {
        ok: false,
        error:
          hit.type === 'block'
            ? 'Это время занято в студии. Пожалуйста, выберите другое.'
            : 'Это время только что забронировал другой гость. Пожалуйста, выберите другое.',
        slots: slotsForDate(date),
      });
    }

    const booking = {
      id: uid('bk'),
      code: 'ML-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      name,
      phone: phoneRaw,
      phoneDigits: phone,
      email,
      serviceId: service ? service.id : '',
      serviceName: service ? service.name : 'Съёмка',
      servicePrice: service ? service.price : 0,
      date,
      time,
      people,
      preferences,
      comment,
      source,
      status: 'new',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [{ at: new Date().toISOString(), action: 'Заявка создана гостем' }],
    };
    db.bookings.push(booking);

    // карточка гостя (не регистрация — просто история визитов)
    let guest = db.guests.find((g) => g.phoneDigits === phone);
    if (!guest) {
      guest = {
        id: uid('guest'),
        name,
        phone: phoneRaw,
        phoneDigits: phone,
        email,
        createdAt: new Date().toISOString(),
        visits: 0,
      };
      db.guests.push(guest);
    }
    guest.name = name;
    guest.lastBookingAt = booking.createdAt;
    saveDb(true);

    broadcast('bookings', { reason: 'created', date, time });
    broadcast('slots', { date });

    return sendJson(res, 201, {
      ok: true,
      booking: {
        code: booking.code,
        name: booking.name,
        date: booking.date,
        time: booking.time,
        serviceName: booking.serviceName,
        status: booking.status,
      },
    });
  }

  if (p === '/api/my-bookings' && method === 'GET') {
    const phone = normalizePhone(q.get('phone'));
    if (phone.length !== 11) return sendError(res, 400, 'Введите номер телефона полностью');
    const list = db.bookings
      .filter((b) => b.phoneDigits === phone)
      .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1))
      .map((b) => ({
        id: b.id,
        code: b.code,
        date: b.date,
        time: b.time,
        serviceName: b.serviceName,
        status: b.status,
        people: b.people,
        createdAt: b.createdAt,
      }));
    return sendJson(res, 200, { ok: true, bookings: list });
  }

  /* ------------------------------- вход ------------------------------ */

  if (p === '/api/login' && method === 'POST') {
    if (tooManyAttempts(ip)) {
      return sendError(res, 429, 'Слишком много попыток входа. Подождите 10 минут.');
    }
    const body = await readJson(req);
    const login = String(body.login || '').trim();
    const password = String(body.password || '');
    const s = db.settings;
    const okLogin = login.toLowerCase() === String(s.adminLogin).toLowerCase();
    const okPass =
      okLogin && hashPassword(password, s.adminPassSalt) === s.adminPassHash;
    if (!okLogin || !okPass) {
      noteFailedLogin(ip);
      return sendError(res, 401, 'Неверный логин или пароль');
    }
    clearAttempts(ip);
    const token = signToken({ role: 'admin', exp: Date.now() + TOKEN_TTL, login: s.adminLogin });
    return sendJson(res, 200, { ok: true, token, login: s.adminLogin });
  }

  /* ---------------------------- админ: проверка ---------------------- */

  if (p === '/api/admin/me' && method === 'GET') {
    if (!isAdmin(req)) return sendError(res, 401, 'Требуется вход администратора');
    return sendJson(res, 200, {
      ok: true,
      login: db.settings.adminLogin,
      stats: adminStats(),
    });
  }

  /* ------------------------------ админ API -------------------------- */

  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return sendError(res, 401, 'Требуется вход администратора');
    return handleAdmin(req, res, url);
  }

  return sendError(res, 404, 'Не найдено');
}

function adminStats() {
  const bookings = db.bookings;
  const map = occupiedMap();
  let busySlots = 0;
  for (const key of map.keys()) {
    if (map.get(key).type === 'booking') busySlots += 1;
  }
  return {
    photos: db.photos.length,
    bookingsTotal: bookings.length,
    newBookings: bookings.filter((b) => b.status === 'new').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    bookedSlots: busySlots,
    guests: db.guests.length,
    revenuePlanned: bookings
      .filter((b) => ['new', 'confirmed', 'done'].includes(b.status))
      .reduce((sum, b) => sum + (Number(b.servicePrice) || 0), 0),
    today: todayStr(),
  };
}

async function handleAdmin(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const q = url.searchParams;

  if (p === '/api/admin/stats' && method === 'GET') {
    return sendJson(res, 200, { ok: true, stats: adminStats() });
  }

  /* --- фото --- */

  if (p === '/api/admin/photos' && method === 'POST') {
    const body = await readJson(req);
    const incoming = Array.isArray(body.files) ? body.files : [];
    if (!incoming.length) return sendError(res, 400, 'Выберите хотя бы один файл');
    const baseOrder = db.photos.length
      ? Math.max.apply(null, db.photos.map((x) => Number(x.order) || 0)) + 1
      : 0;
    const added = [];
    const errors = [];
    incoming.slice(0, 30).forEach((item, index) => {
      try {
        const saved = savePhotoFromDataUrl(item.dataUrl, item.name);
        const photo = Object.assign(saved, {
          title: String(item.title || body.title || '').slice(0, 120),
          category: String(item.category || body.category || 'Съёмки').slice(0, 60),
          order: baseOrder + index,
          createdAt: new Date().toISOString(),
        });
        db.photos.push(photo);
        added.push({ id: photo.id, url: photo.url, title: photo.title, category: photo.category });
      } catch (err) {
        errors.push(`${item && item.name ? item.name : 'файл'}: ${err.message}`);
      }
    });
    if (added.length) {
      saveDb(true);
      broadcast('photos', { added: added.length });
    }
    if (!added.length) return sendError(res, 400, errors.join('; ') || 'Не удалось загрузить фото');
    return sendJson(res, 200, { ok: true, added, errors });
  }

  if (p.startsWith('/api/admin/photos/') && method === 'DELETE') {
    const id = decodeURIComponent(p.split('/').pop());
    const idx = db.photos.findIndex((x) => x.id === id);
    if (idx < 0) return sendError(res, 404, 'Фото не найдено');
    const [photo] = db.photos.splice(idx, 1);
    deletePhotoFile(photo.url);
    db.photos.forEach((x, i) => {
      x.order = i;
    });
    saveDb(true);
    broadcast('photos', { removed: id });
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/photos/update' && method === 'POST') {
    const body = await readJson(req);
    const id = String(body.id || '');
    const photo = db.photos.find((x) => x.id === id);
    if (!photo) return sendError(res, 404, 'Фото не найдено');
    if (typeof body.title === 'string') photo.title = body.title.slice(0, 120);
    if (typeof body.category === 'string') photo.category = body.category.slice(0, 60);
    saveDb(true);
    broadcast('photos', { updated: id });
    return sendJson(res, 200, { ok: true, photo: { id: photo.id, title: photo.title, category: photo.category } });
  }

  if (p === '/api/admin/photos/reorder' && method === 'POST') {
    const body = await readJson(req);
    const order = Array.isArray(body.order) ? body.order.map(String) : [];
    if (!order.length) return sendError(res, 400, 'Пустой порядок');
    order.forEach((id, index) => {
      const photo = db.photos.find((x) => x.id === id);
      if (photo) photo.order = index;
    });
    saveDb(true);
    broadcast('photos', { reordered: true });
    return sendJson(res, 200, { ok: true, photos: publicPhotos() });
  }

  if (p === '/api/admin/photos/move' && method === 'POST') {
    const body = await readJson(req);
    const id = String(body.id || '');
    const dir = body.direction === 'up' ? -1 : 1;
    const sorted = db.photos.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = sorted.findIndex((x) => x.id === id);
    if (idx < 0) return sendError(res, 404, 'Фото не найдено');
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= sorted.length) return sendJson(res, 200, { ok: true, photos: publicPhotos() });
    const tmp = sorted[idx];
    sorted[idx] = sorted[swapWith];
    sorted[swapWith] = tmp;
    sorted.forEach((photo, i) => {
      photo.order = i;
    });
    saveDb(true);
    broadcast('photos', { reordered: true });
    return sendJson(res, 200, { ok: true, photos: publicPhotos() });
  }

  /* --- заявки --- */

  if (p === '/api/admin/bookings' && method === 'GET') {
    const status = String(q.get('status') || '');
    let list = db.bookings.slice();
    if (status && status !== 'all') list = list.filter((b) => b.status === status);
    list.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
    return sendJson(res, 200, { ok: true, bookings: list, stats: adminStats() });
  }

  if (p.startsWith('/api/admin/bookings/') && method === 'PATCH') {
    const id = decodeURIComponent(p.split('/').pop());
    const booking = db.bookings.find((b) => b.id === id);
    if (!booking) return sendError(res, 404, 'Заявка не найдена');
    const body = await readJson(req);
    const allowed = ['new', 'confirmed', 'cancelled', 'done'];
    if (body.status) {
      if (!allowed.includes(body.status)) return sendError(res, 400, 'Неизвестный статус');
      booking.status = body.status;
      booking.history = booking.history || [];
      booking.history.push({
        at: new Date().toISOString(),
        action: 'Статус изменён администратором: ' + statusLabel(body.status),
      });
      if (body.status === 'done') {
        const guest = db.guests.find((g) => g.phoneDigits === booking.phoneDigits);
        if (guest) guest.visits = (guest.visits || 0) + 1;
      }
    }
    if (typeof body.adminNote === 'string') booking.adminNote = body.adminNote.slice(0, 1000);
    if (typeof body.date === 'string' && isDateStr(body.date)) booking.date = body.date;
    if (typeof body.time === 'string' && (db.settings.slotTimes || []).includes(body.time)) booking.time = body.time;
    booking.updatedAt = new Date().toISOString();
    saveDb(true);
    broadcast('bookings', { reason: 'updated', id });
    broadcast('slots', { date: booking.date });
    return sendJson(res, 200, { ok: true, booking });
  }

  if (p.startsWith('/api/admin/bookings/') && method === 'DELETE') {
    const id = decodeURIComponent(p.split('/').pop());
    const idx = db.bookings.findIndex((b) => b.id === id);
    if (idx < 0) return sendError(res, 404, 'Заявка не найдена');
    const [removed] = db.bookings.splice(idx, 1);
    saveDb(true);
    broadcast('bookings', { reason: 'deleted', id });
    broadcast('slots', { date: removed.date });
    return sendJson(res, 200, { ok: true });
  }

  /* --- блокировка времени студией --- */

  if (p === '/api/admin/blocks' && method === 'GET') {
    return sendJson(res, 200, { ok: true, blocks: db.blocks });
  }

  if (p === '/api/admin/blocks' && method === 'POST') {
    const body = await readJson(req);
    const date = String(body.date || '');
    const times = Array.isArray(body.times) ? body.times : [String(body.time || '')];
    if (!isDateStr(date)) return sendError(res, 400, 'Укажите дату');
    const reason = String(body.reason || 'Занято студией').slice(0, 160);
    const map = occupiedMap();
    const added = [];
    for (const time of times) {
      if (!(db.settings.slotTimes || []).includes(time)) continue;
      const key = date + '|' + time;
      if (map.has(key)) continue;
      const block = { id: uid('blk'), date, time, reason, createdAt: new Date().toISOString() };
      db.blocks.push(block);
      map.set(key, { type: 'block', block });
      added.push(block);
    }
    saveDb(true);
    broadcast('slots', { date });
    return sendJson(res, 200, { ok: true, added, blocks: db.blocks });
  }

  if (p.startsWith('/api/admin/blocks/') && method === 'DELETE') {
    const id = decodeURIComponent(p.split('/').pop());
    const idx = db.blocks.findIndex((b) => b.id === id);
    if (idx < 0) return sendError(res, 404, 'Блокировка не найдена');
    const [removed] = db.blocks.splice(idx, 1);
    saveDb(true);
    broadcast('slots', { date: removed.date });
    return sendJson(res, 200, { ok: true, blocks: db.blocks });
  }

  /* --- гости --- */

  if (p === '/api/admin/guests' && method === 'GET') {
    const list = db.guests
      .slice()
      .sort((a, b) => String(b.lastBookingAt || b.createdAt).localeCompare(String(a.lastBookingAt || a.createdAt)));
    return sendJson(res, 200, { ok: true, guests: list });
  }

  /* --- настройки --- */

  if (p === '/api/admin/settings' && method === 'GET') {
    const s = Object.assign({}, db.settings);
    delete s.adminPassHash;
    delete s.adminPassSalt;
    return sendJson(res, 200, { ok: true, settings: s });
  }

  if (p === '/api/admin/settings' && method === 'PUT') {
    const body = await readJson(req);
    const s = db.settings;
    const textFields = [
      'studioName', 'tagline', 'city', 'address', 'phone', 'whatsapp', 'telegram',
      'email', 'instagram', 'vk', 'workHours', 'heroTitle', 'heroSubtitle', 'about',
      'paymentNote', 'bookingNote',
    ];
    for (const field of textFields) {
      if (typeof body[field] === 'string') s[field] = body[field].slice(0, 1200);
    }
    if (Array.isArray(body.slotTimes)) {
      s.slotTimes = body.slotTimes
        .map((t) => String(t).trim())
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
        .map((t) => (t.length === 4 ? '0' + t : t))
        .sort()
        .slice(0, 40);
      if (!s.slotTimes.length) s.slotTimes = DEFAULT_SETTINGS.slotTimes.slice();
    }
    if (Array.isArray(body.services)) {
      s.services = body.services
        .slice(0, 30)
        .map((item, i) => ({
          id: String(item.id || 's' + (i + 1)).slice(0, 40),
          name: String(item.name || 'Услуга').slice(0, 120),
          price: Math.max(0, Number(item.price) || 0),
          duration: String(item.duration || '').slice(0, 60),
          note: String(item.note || '').slice(0, 200),
        }))
        .filter((item) => item.name.trim());
    }
    saveDb(true);
    broadcast('settings', {});
    const clean = Object.assign({}, s);
    delete clean.adminPassHash;
    delete clean.adminPassSalt;
    return sendJson(res, 200, { ok: true, settings: clean });
  }

  if (p === '/api/admin/password' && method === 'POST') {
    const body = await readJson(req);
    const current = String(body.current || '');
    const next = String(body.next || '');
    const s = db.settings;
    if (hashPassword(current, s.adminPassSalt) !== s.adminPassHash) {
      return sendError(res, 400, 'Текущий пароль указан неверно');
    }
    if (next.length < 6) return sendError(res, 400, 'Новый пароль — минимум 6 символов');
    const pass = makePassword(next);
    s.adminPassSalt = pass.salt;
    s.adminPassHash = pass.hash;
    saveDb(true);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/login' && method === 'POST') {
    const body = await readJson(req);
    const next = String(body.login || '').trim();
    const password = String(body.password || '');
    const s = db.settings;
    if (hashPassword(password, s.adminPassSalt) !== s.adminPassHash) {
      return sendError(res, 400, 'Пароль указан неверно');
    }
    if (next.length < 3) return sendError(res, 400, 'Логин — минимум 3 символа');
    s.adminLogin = next;
    saveDb(true);
    return sendJson(res, 200, { ok: true, login: next });
  }

  if (p === '/api/admin/export' && method === 'GET') {
    const safe = JSON.parse(JSON.stringify(db));
    delete safe.settings.adminPassHash;
    delete safe.settings.adminPassSalt;
    delete safe.secret;
    return sendJson(res, 200, { ok: true, data: safe });
  }

  return sendError(res, 404, 'Не найдено');
}

function statusLabel(status) {
  return (
    {
      new: 'новая',
      confirmed: 'подтверждена',
      cancelled: 'отменена',
      done: 'проведена',
    }[status] || status
  );
}

/* ============================ СТАТИЧНЫЕ ФАЙЛЫ =========================== */

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  // медиафайлы из data/uploads
  if (pathname.startsWith('/media/')) {
    const name = path.basename(pathname);
    const full = path.join(UPLOAD_DIR, name);
    if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Файл не найден');
    }
    const ext = path.extname(full).toLowerCase();
    const stat = fs.statSync(full);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=86400',
    });
    return fs.createReadStream(full).pipe(res);
  }

  const full = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^([/\\])+/, ''));
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Доступ запрещён');
  }
  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      const notFound = path.join(PUBLIC_DIR, '404.html');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      if (fs.existsSync(notFound)) return fs.createReadStream(notFound).pipe(res);
      return res.end('<h1>404 — страница не найдена</h1>');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(full).pipe(res);
  });
}

/* ================================ СЕРВЕР =============================== */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  // базовые заголовки безопасности
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    return res.end();
  }

  try {
    // проверка живости для хостинга (Render и др.)
    if (url.pathname === '/healthz') {
      return sendJson(res, 200, {
        ok: true,
        uptime: Math.round(process.uptime()),
        photos: db.photos.length,
        bookings: db.bookings.length,
        dataDir: DATA_DIR,
      });
    }
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    return serveStatic(req, res, url);
  } catch (err) {
    console.error('[error]', req.method, url.pathname, err.message);
    if (!res.headersSent) return sendError(res, 500, err.message || 'Внутренняя ошибка');
    return res.end();
  }
});

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

loadDb();

server.listen(PORT, HOST, () => {
  const line = '─'.repeat(58);
  const hosted = !!process.env.RENDER || !!process.env.DATA_DIR;
  console.log('\n' + line);
  console.log('  🍓  ФОТОСТУДИЯ «МАЛИНА» — г. Белорецк');
  console.log(line);
  console.log('  Сайт для гостей:   http://localhost:' + PORT + '/');
  console.log('  Вход для админа:   http://localhost:' + PORT + '/admin.html');
  if (!hosted) {
    for (const ip of lanAddresses()) {
      console.log('  С телефона (Wi-Fi): http://' + ip + ':' + PORT + '/');
    }
  } else {
    console.log('  Режим хостинга: порт ' + PORT + ', адрес ' + HOST);
  }
  console.log(line);
  console.log('  Логин админа:  ' + db.settings.adminLogin);
  console.log('  Пароль:        ' + (db.settings.adminPassHash === hashPassword('malina2024', db.settings.adminPassSalt)
    ? 'malina2024   (стандартный — смените в панели → Настройки)'
    : 'задан свой (стандартный изменён)'));
  console.log('  Данные:        ' + DATA_DIR);
  console.log(line + '\n');
});

process.on('SIGTERM', () => {
  // хостинг присылает SIGTERM при перезапуске — успеваем сохранить данные
  console.log('\nПолучен SIGTERM, сохраняю данные…');
  saveDb(true);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nСохраняю данные и выключаюсь…');
  saveDb(true);
  process.exit(0);
});

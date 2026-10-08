/* =========================================================================
   Админ-панель фотостудии «Малина»
   ========================================================================= */
(function () {
  'use strict';

  const TOKEN_KEY = 'malina_admin_token';
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    settings: null,
    photos: [],
    bookings: [],
    guests: [],
    blocks: [],
    filter: 'all',
    schedDate: '',
    slotTimes: [],
    services: [],
  };

  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const STATUS_LABEL = { new: 'Новая', confirmed: 'Подтверждена', cancelled: 'Отменена', done: 'Проведена' };

  const $ = (id) => document.getElementById(id);

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function money(value) {
    return new Intl.NumberFormat('ru-RU').format(Number(value) || 0) + ' ₽';
  }

  function humanDate(str) {
    if (!str) return '—';
    const d = new Date(str + 'T00:00:00');
    return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function humanStamp(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function ymd(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  /* ------------------------------ тосты ------------------------------ */
  function toast(text, kind, ms) {
    const wrap = $('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .35s ease, transform .35s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => el.remove(), 360);
    }, ms || 3400);
  }

  /* ------------------------------- API ------------------------------- */
  async function api(path, options) {
    const opts = Object.assign({}, options);
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (state.token) opts.headers.Authorization = 'Bearer ' + state.token;
    const res = await fetch(path, opts);
    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      data = {};
    }
    if (res.status === 401) {
      showLogin('Сессия истекла — войдите заново');
      throw new Error('Требуется вход администратора');
    }
    if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
    return data;
  }

  /* --------------------------- вход / выход --------------------------- */

  function showLogin(message) {
    $('loginScreen').classList.remove('hidden');
    $('dashboard').classList.add('hidden');
    if (message) {
      const box = $('loginError');
      box.textContent = message;
      box.classList.remove('hidden');
    }
  }

  function showDashboard() {
    $('loginScreen').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('whoLogin').textContent = localStorage.getItem('malina_admin_login') || 'admin';
  }

  $('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('adminLoginBtn');
    const errBox = $('loginError');
    errBox.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Проверяем…';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: $('adminLogin').value, password: $('adminPass').value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Не удалось войти');
      state.token = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem('malina_admin_login', data.login || 'admin');
      $('adminPass').value = '';
      toast('Вход выполнен', 'ok');
      await boot();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  });

  $('logoutBtn').addEventListener('click', () => {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    showLogin('Вы вышли из панели');
    toast('Вы вышли из панели');
  });

  fetch('/api/settings')
    .then((r) => r.json())
    .then((data) => {
      if (data && data.ok && data.settings.defaultPassword) $('loginHint').hidden = false;
    })
    .catch(() => {});

  /* ------------------------------- вкладки --------------------------- */

  $('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
    if (tab === 'schedule') loadSchedule();
    if (tab === 'guests') loadGuests();
    if (tab === 'settings') loadSettings();
    if (tab === 'bookings') loadBookings();
    if (tab === 'photos') loadPhotos();
  });

  /* ------------------------------ заявки ----------------------------- */

  async function loadBookings() {
    try {
      const data = await api('/api/admin/bookings?status=' + encodeURIComponent(state.filter));
      state.bookings = data.bookings || [];
      renderBookings();
      if (data.stats) renderStats(data.stats);
      $('badgeBookings').textContent = data.stats ? data.stats.newBookings : 0;
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  function renderStats(stats) {
    const items = [
      { value: stats.newBookings, label: 'новых заявок', accent: true },
      { value: stats.confirmed, label: 'подтверждено' },
      { value: stats.bookedSlots, label: 'занятых слотов' },
      { value: stats.photos, label: 'фото в галерее' },
      { value: stats.guests, label: 'гостей в базе' },
      { value: money(stats.revenuePlanned), label: 'сумма по заявкам' },
    ];
    $('statsRow').innerHTML = items
      .map((i) => `<div class="stat ${i.accent ? 'accent' : ''}"><b>${esc(i.value)}</b><span>${esc(i.label)}</span></div>`)
      .join('');
    $('badgePhotos').textContent = stats.photos;
  }

  function renderBookings() {
    const list = $('bookingList');
    $('bookingsEmpty').classList.toggle('hidden', state.bookings.length > 0);
    list.innerHTML = state.bookings
      .map((b) => {
        const wa = String(b.phoneDigits || '').replace(/\D/g, '');
        const actions = [];
        if (b.status === 'new') actions.push(`<button class="btn small" data-act="confirmed" data-id="${b.id}">Подтвердить</button>`);
        if (b.status !== 'done') actions.push(`<button class="btn small ghost" data-act="done" data-id="${b.id}">Съёмка проведена</button>`);
        if (b.status !== 'cancelled') actions.push(`<button class="btn small soft" data-act="cancelled" data-id="${b.id}">Отменить</button>`);
        actions.push(`<a class="btn small ghost" href="tel:${esc(b.phone)}">📞 Позвонить</a>`);
        if (wa) actions.push(`<a class="btn small ghost" href="https://wa.me/${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
        actions.push(`<button class="btn small danger" data-act="delete" data-id="${b.id}">Удалить</button>`);

        return `
          <article class="booking-card" data-status="${esc(b.status)}">
            <div class="booking-top">
              <div>
                <div class="booking-when">${humanDate(b.date)} в ${esc(b.time)}
                  <span>· ${esc(b.serviceName)}${b.servicePrice ? ' · ' + money(b.servicePrice) : ''}</span>
                </div>
                <div class="muted" style="font-size:.84rem;margin-top:2px">
                  Создана ${humanStamp(b.createdAt)} · заявка <span class="pill code">${esc(b.code)}</span>
                </div>
              </div>
              <span class="pill ${esc(b.status)}">${esc(STATUS_LABEL[b.status] || b.status)}</span>
            </div>

            <div class="booking-meta">
              <div><span>Гость</span><b>${esc(b.name)}</b></div>
              <div><span>Телефон</span><b><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></b></div>
              <div><span>E-mail</span><b>${esc(b.email || '—')}</b></div>
              <div><span>Человек в кадре</span><b>${esc(b.people)}</b></div>
              <div><span>Как узнал(а)</span><b>${esc(b.source || '—')}</b></div>
            </div>

            ${b.preferences ? `<div class="booking-pref"><b>Пожелания гостя:</b>\n${esc(b.preferences)}</div>` : ''}
            ${b.comment ? `<div class="booking-pref"><b>Комментарий:</b>\n${esc(b.comment)}</div>` : ''}

            <textarea class="note-input" data-note="${b.id}" placeholder="Заметка администратора (видна только вам)">${esc(b.adminNote || '')}</textarea>

            <div class="booking-actions">${actions.join('')}</div>
          </article>`;
      })
      .join('');

    list.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        if (act === 'delete') {
          if (!confirm('Удалить заявку безвозвратно?')) return;
          try {
            await api('/api/admin/bookings/' + encodeURIComponent(id), { method: 'DELETE' });
            toast('Заявка удалена', 'ok');
            await loadBookings();
          } catch (err) {
            toast(err.message, 'err');
          }
          return;
        }
        try {
          await api('/api/admin/bookings/' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify({ status: act }),
          });
          toast('Статус изменён: ' + (STATUS_LABEL[act] || act), 'ok');
          await loadBookings();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });

    list.querySelectorAll('[data-note]').forEach((area) => {
      area.addEventListener('blur', async () => {
        const id = area.getAttribute('data-note');
        try {
          await api('/api/admin/bookings/' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify({ adminNote: area.value }),
          });
          toast('Заметка сохранена', 'ok', 1800);
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  }

  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.getAttribute('data-filter');
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b === btn));
      loadBookings();
    });
  });

  $('refreshBookings').addEventListener('click', () => loadBookings());

  /* ------------------------------- фото ------------------------------ */

  async function loadPhotos() {
    try {
      const data = await api('/api/photos');
      state.photos = data.photos || [];
      renderPhotos();
      $('badgePhotos').textContent = state.photos.length;
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  function renderPhotos() {
    const grid = $('photoGrid');
    $('photosEmpty').classList.toggle('hidden', state.photos.length > 0);
    grid.innerHTML = state.photos
      .map((p, i) => `
        <div class="photo-cell" data-id="${esc(p.id)}">
          <div class="thumb"><img src="${esc(p.url)}" alt="${esc(p.title || '')}" loading="lazy"></div>
          <div class="body">
            <input type="text" value="${esc(p.title || '')}" placeholder="Подпись" data-field="title">
            <input type="text" value="${esc(p.category || '')}" placeholder="Раздел галереи" data-field="category">
            <div class="row">
              <button class="icon-btn" data-move="up" ${i === 0 ? 'disabled' : ''} title="Выше">↑</button>
              <button class="icon-btn" data-move="down" ${i === state.photos.length - 1 ? 'disabled' : ''} title="Ниже">↓</button>
              <button class="icon-btn" data-save="1">Сохранить</button>
              <button class="icon-btn danger" data-del="1">Удалить</button>
            </div>
          </div>
        </div>`)
      .join('');

    grid.querySelectorAll('.photo-cell').forEach((cell) => {
      const id = cell.getAttribute('data-id');
      cell.querySelector('[data-del]').addEventListener('click', async () => {
        if (!confirm('Удалить это фото с сайта?')) return;
        try {
          await api('/api/admin/photos/' + encodeURIComponent(id), { method: 'DELETE' });
          toast('Фото удалено', 'ok');
          await loadPhotos();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
      cell.querySelector('[data-save]').addEventListener('click', async () => {
        const title = cell.querySelector('[data-field="title"]').value;
        const category = cell.querySelector('[data-field="category"]').value;
        try {
          await api('/api/admin/photos/update', {
            method: 'POST',
            body: JSON.stringify({ id, title, category }),
          });
          toast('Подпись сохранена', 'ok', 2000);
        } catch (err) {
          toast(err.message, 'err');
        }
      });
      cell.querySelectorAll('[data-move]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api('/api/admin/photos/move', {
              method: 'POST',
              body: JSON.stringify({ id, direction: btn.getAttribute('data-move') }),
            });
            await loadPhotos();
          } catch (err) {
            toast(err.message, 'err');
          }
        });
      });
    });
  }

  const dropzone = $('dropzone');
  const fileInput = $('fileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length) uploadFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('over');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('over');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) uploadFiles(files);
    else toast('Перетащите файлы изображений', 'err');
  });

  window.addEventListener('paste', (e) => {
    if ($('panel-photos').classList.contains('active') === false) return;
    const items = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (items.length) uploadFiles(items);
  });

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFiles(files, skipConfirm) {
    const images = files.filter((f) => /^image\//.test(f.type));
    const skipped = files.length - images.length;
    if (skipped) toast('Пропущено файлов не-изображений: ' + skipped, 'err');
    if (!images.length) return;

    const big = images.filter((f) => f.size > 12 * 1024 * 1024);
    if (big.length) {
      toast('Эти файлы больше 12 МБ и не загрузятся: ' + big.map((f) => f.name).join(', '), 'err', 5200);
    }
    const ok = images.filter((f) => f.size <= 12 * 1024 * 1024);
    if (!ok.length) return;

    const progress = $('uploadProgress');
    const bar = progress.querySelector('i');
    progress.classList.add('show');
    bar.style.width = '6%';
    $('uploadStatus').textContent = 'Готовим ' + ok.length + ' файл(ов)…';

    const title = $('uploadTitle').value.trim();
    const category = $('uploadCategory').value.trim() || 'Съёмки';
    const payload = [];
    for (let i = 0; i < ok.length; i += 1) {
      try {
        payload.push({ name: ok[i].name, dataUrl: await readAsDataUrl(ok[i]) });
      } catch (err) {
        toast(err.message, 'err');
      }
      bar.style.width = Math.round(((i + 1) / ok.length) * 45) + '%';
    }

    const BATCH = 4;
    let added = 0;
    const errors = [];
    for (let i = 0; i < payload.length; i += BATCH) {
      const chunk = payload.slice(i, i + BATCH);
      $('uploadStatus').textContent = 'Загружаем: ' + (i + chunk.length) + ' из ' + payload.length + '…';
      try {
        const data = await api('/api/admin/photos', {
          method: 'POST',
          body: JSON.stringify({ files: chunk, title, category }),
        });
        added += (data.added || []).length;
        (data.errors || []).forEach((msg) => errors.push(msg));
      } catch (err) {
        errors.push(err.message);
      }
      bar.style.width = 45 + Math.round(((i + chunk.length) / payload.length) * 55) + '%';
    }

    $('uploadStatus').textContent = 'Загружено фото: ' + added + (errors.length ? ' · ошибок: ' + errors.length : '');
    if (added) toast('Загружено фото: ' + added, 'ok');
    errors.forEach((msg) => toast(msg, 'err', 5000));

    setTimeout(() => {
      progress.classList.remove('show');
      bar.style.width = '0%';
      $('uploadStatus').textContent = '';
    }, 2600);

    await loadPhotos();
  }

  /* ---------------------------- расписание --------------------------- */

  async function loadSchedule() {
    if (!$('schedDate').value) $('schedDate').value = ymd(new Date());
    state.schedDate = $('schedDate').value;
    try {
      const [slotsData, blocksData, bookData, schedData] = await Promise.all([
        api('/api/slots?date=' + encodeURIComponent(state.schedDate)),
        api('/api/admin/blocks'),
        api('/api/admin/bookings?status=all'),
        api('/api/schedule?days=14'),
      ]);
      state.blocks = blocksData.blocks || [];
      state.bookings = bookData.bookings || state.bookings;
      const byTime = {};
      (state.bookings || []).forEach((b) => {
        if (b.date === state.schedDate && ['new', 'confirmed'].includes(b.status)) byTime[b.time] = b;
      });

      $('schedTitle').textContent = humanDate(state.schedDate);
      const free = (slotsData.slots || []).filter((s) => s.status === 'free').length;
      $('schedSub').textContent = 'Свободно слотов: ' + free + ' из ' + (slotsData.slots || []).length;

      $('schedGrid').innerHTML = (slotsData.slots || [])
        .map((slot) => {
          const booking = byTime[slot.time];
          const block = state.blocks.find((b) => b.date === state.schedDate && b.time === slot.time);
          const label = slot.status === 'free' ? 'свободно' : slot.status === 'busy' ? 'занято' : 'закрыто студией';
          const info = booking
            ? esc(booking.name) + ' · ' + esc(booking.phone)
            : block
              ? esc(block.reason || 'закрыто студией')
              : 'нажмите, чтобы закрыть';
          return `<button class="sched-slot ${slot.status === 'free' ? '' : slot.status}" type="button"
                    data-time="${esc(slot.time)}" data-block="${block ? block.id : ''}" data-status="${slot.status}">
                    <b>${esc(slot.time)}</b>
                    <span>${label}</span><br>
                    <span>${info}</span>
                  </button>`;
        })
        .join('');

      $('schedGrid').querySelectorAll('.sched-slot').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const time = btn.getAttribute('data-time');
          const blockId = btn.getAttribute('data-block');
          const status = btn.getAttribute('data-status');
          try {
            if (blockId) {
              await api('/api/admin/blocks/' + encodeURIComponent(blockId), { method: 'DELETE' });
              toast('Время ' + time + ' снова открыто для брони', 'ok');
            } else if (status === 'busy') {
              toast('Здесь бронь гостя — откройте заявку во вкладке «Заявки»', 'err');
              return;
            } else {
              const reason = prompt('Причина закрытия времени ' + time + ':', 'Занято студией');
              if (reason === null) return;
              await api('/api/admin/blocks', {
                method: 'POST',
                body: JSON.stringify({ date: state.schedDate, times: [time], reason }),
              });
              toast('Время ' + time + ' закрыто для гостей', 'ok');
            }
            await loadSchedule();
          } catch (err) {
            toast(err.message, 'err');
          }
        });
      });

      $('dayList').innerHTML = (schedData.days_list || [])
        .map((d) => {
          const pct = d.total ? Math.round((d.busy / d.total) * 100) : 0;
          return `<div class="day-row">
            <b style="min-width:190px">${humanDate(d.date)}</b>
            <span class="bar"><i style="width:${pct}%"></i></span>
            <span class="muted">занято ${d.busy} · свободно ${d.free}</span>
            <button class="icon-btn" data-day="${d.date}">Открыть</button>
          </div>`;
        })
        .join('');
      $('dayList').querySelectorAll('[data-day]').forEach((btn) => {
        btn.addEventListener('click', () => {
          $('schedDate').value = btn.getAttribute('data-day');
          loadSchedule();
        });
      });
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  $('schedDate').addEventListener('change', loadSchedule);
  $('schedToday').addEventListener('click', () => {
    $('schedDate').value = ymd(new Date());
    loadSchedule();
  });

  /* ------------------------------- гости ----------------------------- */

  async function loadGuests() {
    try {
      const [guestsData, bookingsData] = await Promise.all([
        api('/api/admin/guests'),
        api('/api/admin/bookings?status=all'),
      ]);
      state.guests = guestsData.guests || [];
      state.bookings = bookingsData.bookings || [];
      const body = $('guestsBody');
      $('guestsEmpty').classList.toggle('hidden', state.guests.length > 0);
      body.innerHTML = state.guests
        .map((g) => {
          const count = state.bookings.filter((b) => b.phoneDigits === g.phoneDigits).length;
          return `<tr>
            <td><b>${esc(g.name)}</b></td>
            <td><a href="tel:${esc(g.phone)}">${esc(g.phone)}</a></td>
            <td>${esc(g.email || '—')}</td>
            <td>${count}</td>
            <td>${esc(g.visits || 0)}</td>
            <td>${humanStamp(g.createdAt)}</td>
          </tr>`;
        })
        .join('');
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  /* ----------------------------- настройки --------------------------- */

  const SETTING_FIELDS = [
    'studioName', 'tagline', 'city', 'address', 'phone', 'whatsapp', 'telegram', 'email',
    'instagram', 'vk', 'workHours', 'heroTitle', 'heroSubtitle', 'about', 'paymentNote', 'bookingNote',
  ];

  const FIELD_MAP = {
    studioName: 'setStudioName', tagline: 'setTagline', city: 'setCity', address: 'setAddress',
    phone: 'setPhone', whatsapp: 'setWhatsapp', telegram: 'setTelegram', email: 'setEmail',
    instagram: 'setInstagram', vk: 'setVk', workHours: 'setWorkHours', heroTitle: 'setHeroTitle',
    heroSubtitle: 'setHeroSubtitle', about: 'setAbout', paymentNote: 'setPaymentNote',
    bookingNote: 'setBookingNote',
  };

  async function loadSettings() {
    try {
      const data = await api('/api/admin/settings');
      state.settings = data.settings;
      state.slotTimes = (data.settings.slotTimes || []).slice();
      state.services = JSON.parse(JSON.stringify(data.settings.services || []));
      SETTING_FIELDS.forEach((key) => {
        const el = $(FIELD_MAP[key]);
        if (el) el.value = data.settings[key] == null ? '' : data.settings[key];
      });
      $('setLogin').value = data.settings.adminLogin || 'admin';
      renderServicesEditor();
      renderSlotTimes();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  function renderServicesEditor() {
    $('servicesEditor').innerHTML = state.services
      .map((s, i) => `
        <div class="service-row" data-i="${i}">
          <input type="text" value="${esc(s.name)}" placeholder="Название услуги" data-k="name">
          <input type="number" value="${esc(s.price)}" placeholder="Цена" data-k="price" min="0">
          <input type="text" value="${esc(s.duration)}" placeholder="Длительность" data-k="duration">
          <input type="text" value="${esc(s.note)}" placeholder="Что входит" data-k="note">
          <button class="icon-btn danger del" type="button" data-del="${i}">Удалить</button>
        </div>`)
      .join('');

    $('servicesEditor').querySelectorAll('input[data-k]').forEach((input) => {
      input.addEventListener('input', () => {
        const row = input.closest('.service-row');
        const i = Number(row.getAttribute('data-i'));
        state.services[i][input.getAttribute('data-k')] = input.value;
      });
    });
    $('servicesEditor').querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.services.splice(Number(btn.getAttribute('data-del')), 1);
        renderServicesEditor();
      });
    });
  }

  $('addService').addEventListener('click', () => {
    state.services.push({ id: 's' + Date.now().toString(36), name: '', price: 0, duration: '', note: '' });
    renderServicesEditor();
  });

  function renderSlotTimes() {
    $('slotTimes').innerHTML = state.slotTimes
      .map((t) => `<button class="chip-btn active" type="button" data-slot="${esc(t)}">${esc(t)} ✕</button>`)
      .join('');
    $('slotTimes').querySelectorAll('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.slotTimes = state.slotTimes.filter((t) => t !== btn.getAttribute('data-slot'));
        renderSlotTimes();
      });
    });
  }

  $('addSlotTime').addEventListener('click', () => {
    const value = $('newSlotTime').value;
    if (!value) return toast('Выберите время', 'err');
    if (state.slotTimes.includes(value)) return toast('Такое время уже есть', 'err');
    state.slotTimes.push(value);
    state.slotTimes.sort();
    renderSlotTimes();
    $('newSlotTime').value = '';
  });

  $('saveSettings').addEventListener('click', async () => {
    const payload = {};
    SETTING_FIELDS.forEach((key) => {
      const el = $(FIELD_MAP[key]);
      if (el) payload[key] = el.value;
    });
    payload.slotTimes = state.slotTimes;
    payload.services = state.services
      .filter((s) => String(s.name || '').trim())
      .map((s, i) => ({
        id: s.id || 's' + (i + 1),
        name: s.name,
        price: Number(s.price) || 0,
        duration: s.duration || '',
        note: s.note || '',
      }));
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Настройки сохранены — сайт обновлён', 'ok');
      await loadSettings();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('savePass').addEventListener('click', async () => {
    const current = $('curPass').value;
    const next = $('newPass').value;
    if (next !== $('newPass2').value) return toast('Новые пароли не совпадают', 'err');
    try {
      await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ current, next }) });
      $('curPass').value = '';
      $('newPass').value = '';
      $('newPass2').value = '';
      toast('Пароль изменён', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('saveLogin').addEventListener('click', async () => {
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ login: $('setLogin').value, password: $('setLoginPass').value }),
      });
      localStorage.setItem('malina_admin_login', data.login);
      $('whoLogin').textContent = data.login;
      $('setLoginPass').value = '';
      toast('Логин изменён на ' + data.login, 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('exportBtn').addEventListener('click', async () => {
    try {
      const data = await api('/api/admin/export');
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'malina-backup-' + ymd(new Date()) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Копия данных скачана', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  /* --------------------------- живые события ------------------------- */

  function subscribeLive() {
    if (!('EventSource' in window)) return;
    const source = new EventSource('/api/events');
    source.addEventListener('bookings', () => {
      toast('Новая активность по заявкам', 'ok', 2600);
      if ($('panel-bookings').classList.contains('active')) loadBookings();
    });
    source.addEventListener('slots', () => {
      if ($('panel-schedule').classList.contains('active')) loadSchedule();
    });
    source.addEventListener('photos', () => {
      if ($('panel-photos').classList.contains('active')) loadPhotos();
    });
  }

  /* ------------------------------- старт ----------------------------- */

  async function boot() {
    try {
      await api('/api/admin/me');
    } catch (err) {
      return; // api() сам покажет экран входа
    }
    showDashboard();
    await Promise.all([loadBookings(), loadPhotos()]);
    $('schedDate').value = ymd(new Date());
    subscribeLive();
  }

  if (state.token) {
    boot();
  } else {
    showLogin();
  }
})();

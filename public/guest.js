/* =========================================================================
   Гостевая страница фотостудии «Малина»
   ========================================================================= */
(function () {
  'use strict';

  const state = {
    settings: null,
    photos: [],
    schedule: {},
    date: null,
    time: null,
    serviceId: '',
    loadingSlots: false,
  };

  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  const $ = (id) => document.getElementById(id);

  /* ------------------------------ тосты ------------------------------ */
  const toastWrap = $('toastWrap');
  function toast(text, kind, ms) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    toastWrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .35s ease, transform .35s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => el.remove(), 360);
    }, ms || 3600);
  }

  function money(value) {
    return new Intl.NumberFormat('ru-RU').format(Number(value) || 0) + ' ₽';
  }

  function ymd(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function humanDate(str) {
    if (!str) return '—';
    const d = new Date(str + 'T00:00:00');
    return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtPhone(value) {
    let d = String(value || '').replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    let out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 5) out += ') ' + d.slice(4, 7);
    if (d.length >= 8) out += '-' + d.slice(7, 9);
    if (d.length >= 10) out += '-' + d.slice(9, 11);
    return out;
  }

  /* =========================== ЗАГРУЗКА ДАННЫХ ======================= */

  async function api(path, options) {
    const res = await fetch(path, options);
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = {};
    }
    if (!res.ok) throw new Error((data && data.error) || 'Ошибка запроса');
    return data;
  }

  async function loadSettings() {
    try {
      const data = await api('/api/settings');
      state.settings = data.settings;
      applySettings();
    } catch (err) {
      toast('Не удалось загрузить данные студии: ' + err.message, 'err');
    }
  }

  function applySettings() {
    const s = state.settings;
    if (!s) return;
    document.title = 'Гостям · Фотостудия «' + s.studioName + '» · ' + s.city;
    $('heroTitle').textContent = s.heroTitle;
    $('heroSubtitle').textContent = s.heroSubtitle;
    $('aboutText').textContent = s.about;
    $('paymentNote').textContent = s.paymentNote || '';
    $('footAbout').textContent = s.about;
    $('footCity').textContent = s.city;
    $('year').textContent = new Date().getFullYear();
    $('factServices').textContent = (s.services || []).length;

    // услуги: выпадающий список
    const select = $('serviceSelect');
    const current = select.value || state.serviceId;
    select.innerHTML = (s.services || [])
      .map((item) => `<option value="${esc(item.id)}">${esc(item.name)} — ${money(item.price)}</option>`)
      .join('');
    if (current) select.value = current;
    state.serviceId = select.value;

    // карточки услуг
    $('servicesGrid').innerHTML = (s.services || [])
      .map((item) => `
        <article class="service-card reveal">
          <h3>${esc(item.name)}</h3>
          <div class="dur">${esc(item.duration || '')}</div>
          <p class="note">${esc(item.note || '')}</p>
          <div class="price">${money(item.price)}</div>
          <button class="btn small" data-book-service="${esc(item.id)}">Забронировать</button>
        </article>`)
      .join('');
    $('servicesGrid').querySelectorAll('[data-book-service]').forEach((btn) => {
      btn.addEventListener('click', () => {
        select.value = btn.getAttribute('data-book-service');
        syncService();
        location.hash = '#booking';
      });
    });

    // контакты
    const tel = String(s.phone || '').replace(/[^\d+]/g, '');
    const wa = String(s.whatsapp || '').replace(/\D/g, '');
    const cards = [
      { ic: '📞', title: 'Телефон', body: `<a href="tel:${tel}">${esc(s.phone)}</a>`, note: s.workHours },
      { ic: '💬', title: 'WhatsApp', body: wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">Написать в WhatsApp</a>` : '—', note: wa ? s.phone : 'уточняется' },
      { ic: '✈️', title: 'Telegram', body: s.telegram ? `<a href="https://t.me/${esc(String(s.telegram).replace('@', ''))}" target="_blank" rel="noopener">@${esc(String(s.telegram).replace('@', ''))}</a>` : '—', note: 'Отвечаем в течение дня' },
      { ic: '✉️', title: 'E-mail', body: `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`, note: 'Для договоров и счётов' },
      { ic: '📸', title: 'Instagram', body: s.instagram ? `<a href="https://instagram.com/${esc(s.instagram)}" target="_blank" rel="noopener">@${esc(s.instagram)}</a>` : '—', note: 'Свежие работы' },
      { ic: '🅥', title: 'ВКонтакте', body: s.vk ? `<a href="https://vk.com/${esc(s.vk)}" target="_blank" rel="noopener">vk.com/${esc(s.vk)}</a>` : '—', note: 'Отзывы и акции' },
      { ic: '📍', title: 'Адрес студии', body: esc(s.address), note: s.city + ' · ' + s.workHours },
    ];
    $('contactsGrid').innerHTML = cards
      .map((c) => `<article class="contact-card reveal"><span class="ic">${c.ic}</span><h3>${c.title}</h3><p>${c.body}</p><p class="muted" style="font-size:.82rem;margin:0">${esc(c.note || '')}</p></article>`)
      .join('');

    $('footContacts').innerHTML =
      `${esc(s.address)}<br>${esc(s.workHours)}<br>` +
      `<a href="tel:${tel}">${esc(s.phone)}</a><br>` +
      `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`;

    const query = encodeURIComponent(s.city + ' ' + String(s.address).replace(/^г\.\s*/, ''));
    $('mapFrame').src = 'https://yandex.ru/map-widget/v1/?text=' + query + '&z=16';

    $('prefChips').innerHTML = [
      'Нежный образ', 'Светлые тона', 'Больше естественного света', 'Кадры с ребёнком',
      'Парные кадры', 'Реквизит студии', 'Деловой стиль', 'Ретро / плёнка',
    ].map((text) => `<button class="chip-btn" type="button" data-pref="${esc(text)}">${esc(text)}</button>`).join('');
    $('prefChips').querySelectorAll('[data-pref]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const field = $('guestPreferences');
        const text = chip.getAttribute('data-pref');
        const parts = field.value.split(/,\s*/).filter(Boolean);
        const idx = parts.indexOf(text);
        if (idx >= 0) {
          parts.splice(idx, 1);
          chip.classList.remove('active');
        } else {
          parts.push(text);
          chip.classList.add('active');
        }
        field.value = parts.join(', ');
      });
    });

    syncService();
    observeReveal();
  }

  async function loadPhotos() {
    try {
      const data = await api('/api/photos');
      state.photos = data.photos || [];
      renderGallery();
      $('factPhotos').textContent = state.photos.length;
    } catch (err) {
      toast('Не удалось загрузить галерею: ' + err.message, 'err');
    }
  }

  let galleryFilter = 'all';

  function renderGallery() {
    const grid = $('galleryGrid');
    const filters = $('galleryFilters');
    const categories = [];
    state.photos.forEach((p) => {
      const c = p.category || 'Съёмки';
      if (!categories.includes(c)) categories.push(c);
    });

    filters.innerHTML = ['all'].concat(categories)
      .map((c) => `<button class="chip-btn ${galleryFilter === c ? 'active' : ''}" data-cat="${esc(c)}">${c === 'all' ? 'Все работы' : esc(c)}</button>`)
      .join('');
    filters.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        galleryFilter = btn.getAttribute('data-cat');
        renderGallery();
      });
    });

    const list = state.photos.filter((p) => galleryFilter === 'all' || (p.category || 'Съёмки') === galleryFilter);
    $('galleryEmpty').classList.toggle('hidden', list.length > 0);
    grid.innerHTML = list
      .map((p, i) => `
        <figure class="gallery-item reveal" data-index="${i}" style="margin:0">
          <img src="${esc(p.url)}" alt="${esc(p.title || 'Фотосессия в студии Малина')}" loading="lazy">
          <figcaption class="cap">${esc(p.title || p.category || 'Фотосессия')}</figcaption>
        </figure>`)
      .join('');
    grid.querySelectorAll('.gallery-item').forEach((item) => {
      item.addEventListener('click', () => openLightbox(list, Number(item.getAttribute('data-index'))));
    });
    observeReveal();
  }

  /* ------------------------------ лайтбокс --------------------------- */

  let lbList = [];
  let lbIndex = 0;
  let lbEl = null;

  function openLightbox(list, index) {
    lbList = list;
    lbIndex = index;
    if (!lbEl) {
      lbEl = document.createElement('div');
      lbEl.className = 'lightbox';
      lbEl.innerHTML = `
        <button class="close-x" data-lb="close" aria-label="Закрыть">✕</button>
        <button class="lb-prev" data-lb="prev" aria-label="Назад">‹</button>
        <button class="lb-next" data-lb="next" aria-label="Вперёд">›</button>
        <img alt="">
        <div class="lb-cap"></div>`;
      document.body.appendChild(lbEl);
      lbEl.addEventListener('click', (e) => {
        const action = e.target.getAttribute && e.target.getAttribute('data-lb');
        if (action === 'close' || e.target === lbEl) closeLightbox();
        if (action === 'prev') shiftLightbox(-1);
        if (action === 'next') shiftLightbox(1);
      });
      document.addEventListener('keydown', (e) => {
        if (!lbEl || !lbEl.parentNode) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') shiftLightbox(-1);
        if (e.key === 'ArrowRight') shiftLightbox(1);
      });
    }
    updateLightbox();
    document.body.style.overflow = 'hidden';
  }

  function updateLightbox() {
    const photo = lbList[lbIndex];
    if (!photo) return;
    lbEl.querySelector('img').src = photo.url;
    lbEl.querySelector('.lb-cap').textContent = (photo.title || photo.category || '') + '  ·  ' + (lbIndex + 1) + ' / ' + lbList.length;
  }

  function shiftLightbox(dir) {
    lbIndex = (lbIndex + dir + lbList.length) % lbList.length;
    updateLightbox();
  }

  function closeLightbox() {
    if (lbEl && lbEl.parentNode) lbEl.parentNode.removeChild(lbEl);
    document.body.style.overflow = '';
  }

  /* ====================== ДАТЫ И СЛОТЫ (РАСПИСАНИЕ) ================== */

  async function loadSchedule() {
    try {
      const data = await api('/api/schedule?days=14');
      state.schedule = {};
      (data.days_list || []).forEach((d) => {
        state.schedule[d.date] = d;
      });
      const free = (data.days_list || []).reduce((sum, d) => sum + d.free, 0);
      $('factFree').textContent = free;
      renderDateStrip();
    } catch (err) {
      toast('Не удалось получить расписание: ' + err.message, 'err');
    }
  }

  function renderDateStrip() {
    const strip = $('dateStrip');
    const today = new Date();
    let html = '';
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const key = ymd(d);
      const info = state.schedule[key];
      const total = info ? info.total : (state.settings ? state.settings.slotTimes.length : 11);
      const free = info ? info.free : total;
      const busy = total - free;
      const pct = total ? Math.round((busy / total) * 100) : 0;
      html += `
        <button class="date-btn ${state.date === key ? 'active' : ''} ${free === 0 ? 'full' : ''}" data-date="${key}" type="button">
          <span class="dow">${i === 0 ? 'сегодня' : DOW[d.getDay()]}</span>
          <span class="num">${d.getDate()}</span>
          <span class="mon">${MONTHS_SHORT[d.getMonth()]}</span>
          <span class="load"><i style="width:${pct}%"></i></span>
        </button>`;
    }
    strip.innerHTML = html;
    strip.querySelectorAll('[data-date]').forEach((btn) => {
      btn.addEventListener('click', () => selectDate(btn.getAttribute('data-date')));
    });
  }

  async function selectDate(date) {
    state.date = date;
    state.time = null;
    renderDateStrip();
    updateSummary();
    await loadSlots();
  }

  async function loadSlots() {
    if (!state.date) return;
    state.loadingSlots = true;
    $('slots').innerHTML = '<p class="muted" style="font-size:.9rem">Загружаем свободное время…</p>';
    try {
      const data = await api('/api/slots?date=' + encodeURIComponent(state.date));
      renderSlots(data.slots || []);
    } catch (err) {
      $('slots').innerHTML = '<p class="muted">Не удалось загрузить время</p>';
      toast(err.message, 'err');
    } finally {
      state.loadingSlots = false;
    }
  }

  function renderSlots(slots) {
    const box = $('slots');
    if (!slots.length) {
      box.innerHTML = '<p class="muted">На эту дату время не задано. Свяжитесь с администратором.</p>';
      return;
    }
    box.innerHTML = slots
      .map((slot) => {
        const busy = slot.status !== 'free';
        const sub = slot.status === 'busy' ? 'занято' : slot.status === 'blocked' ? 'студия' : 'свободно';
        return `<button class="slot ${state.time === slot.time ? 'active' : ''}" type="button"
                  data-time="${esc(slot.time)}" ${busy ? 'disabled' : ''}>
                  ${esc(slot.time)}<span class="sub">${sub}</span>
                </button>`;
      })
      .join('');
    box.querySelectorAll('.slot').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        state.time = btn.getAttribute('data-time');
        renderSlots(slots);
        updateSummary();
        $('formError').classList.add('hidden');
        const pill = $('stepPill2');
        pill.classList.add('done');
      });
    });

    // если выбранное время только что занял другой гость
    if (state.time && slots.some((s) => s.time === state.time && s.status !== 'free')) {
      const taken = state.time;
      state.time = null;
      updateSummary();
      toast('Время ' + taken + ' только что забронировал другой гость. Выберите, пожалуйста, другое.', 'err', 5200);
      const btn = box.querySelector('[data-time="' + taken + '"]');
      if (btn) {
        btn.classList.add('just-taken');
        setTimeout(() => btn.classList.remove('just-taken'), 600);
      }
    }
  }

  function syncService() {
    const select = $('serviceSelect');
    state.serviceId = select.value;
    const service = (state.settings && state.settings.services || []).find((s) => s.id === state.serviceId);
    $('sumService').textContent = service ? service.name : 'не выбран';
    $('sumPrice').textContent = service ? money(service.price) : '—';
    if (service) $('stepPill1').classList.add('done');
  }

  function updateSummary() {
    $('sumDate').textContent = humanDate(state.date);
    $('sumTime').textContent = state.time || 'не выбрано';
    $('sumPeople').textContent = $('guestPeople').value || 1;
  }

  /* ============================ БРОНИРОВАНИЕ ========================= */

  const form = $('bookingForm');
  const submitBtn = $('bookingSubmit');
  const formError = $('formError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');

    const service = (state.settings && state.settings.services || []).find((s) => s.id === state.serviceId);
    if (!state.date) return showError('Выберите дату съёмки');
    if (!state.time) return showError('Выберите свободное время');
    if ($('guestName').value.trim().length < 2) return showError('Укажите имя');
    const phoneDigits = $('guestPhone').value.replace(/\D/g, '');
    if (phoneDigits.length !== 11) return showError('Укажите телефон полностью: +7 (999) 123-45-67');
    if (!$('guestAgree').checked) return showError('Отметьте согласие на обработку данных');

    submitBtn.disabled = true;
    const oldLabel = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="spinner"></span> Отправляем…';

    try {
      const data = await api('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: $('guestName').value.trim(),
          phone: $('guestPhone').value.trim(),
          email: $('guestEmail').value.trim(),
          serviceId: state.serviceId,
          date: state.date,
          time: state.time,
          people: Number($('guestPeople').value) || 1,
          preferences: $('guestPreferences').value.trim(),
          source: $('guestSource').value,
          agree: true,
        }),
      });

      const b = data.booking;
      $('ticketBox').classList.remove('hidden');
      $('ticketBox').innerHTML = `
        <div class="ticket">
          <div style="font-size:1.6rem">🍓</div>
          <strong style="display:block;color:var(--berry-dark)">Бронь принята!</strong>
          <div class="code">${esc(b.code)}</div>
          <div style="font-size:.92rem;color:var(--plum)">
            ${esc(b.serviceName)}<br>
            ${humanDate(b.date)} в ${esc(b.time)}
          </div>
          <p class="small" style="margin:12px 0 0">
            Слот закреплён за вами. Администратор позвонит по номеру ${esc($('guestPhone').value)} для подтверждения.
          </p>
        </div>`;
      $('stepPill3').classList.add('done');
      toast('Бронь ' + b.code + ' создана! Время закреплено за вами.', 'ok', 5200);
      $('guestAgree').checked = false;

      await loadSlots();
      await loadSchedule();
      renderDateStrip();
    } catch (err) {
      showError(err.message);
      toast(err.message, 'err', 5000);
      await loadSlots();
      await loadSchedule();
      renderDateStrip();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = oldLabel;
    }
  });

  function showError(text) {
    formError.textContent = text;
    formError.classList.remove('hidden');
    formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  /* --------------------------- мои записи --------------------------- */

  $('lookupBtn').addEventListener('click', async () => {
    const phone = $('lookupPhone').value.replace(/\D/g, '');
    const box = $('lookupResult');
    if (phone.length !== 11) {
      box.innerHTML = '<p class="muted" style="font-size:.85rem">Введите номер полностью</p>';
      return;
    }
    box.innerHTML = '<p class="muted" style="font-size:.85rem">Ищем…</p>';
    try {
      const data = await api('/api/my-bookings?phone=' + phone);
      if (!data.bookings.length) {
        box.innerHTML = '<p class="muted" style="font-size:.85rem">Пока нет броней на этот номер.</p>';
        return;
      }
      const labels = { new: 'ждёт подтверждения', confirmed: 'подтверждена', cancelled: 'отменена', done: 'проведена' };
      box.innerHTML = data.bookings
        .map((b) => `
          <div style="border-top:1px dashed var(--line);padding:10px 0;font-size:.86rem">
            <b>${esc(b.code)}</b> · ${humanDate(b.date)} в ${esc(b.time)}<br>
            <span class="muted">${esc(b.serviceName)} · ${esc(labels[b.status] || b.status)}</span>
          </div>`)
        .join('');
    } catch (err) {
      box.innerHTML = '<p class="muted" style="font-size:.85rem">' + esc(err.message) + '</p>';
    }
  });

  /* ============================ ПРОЧЕЕ ============================== */

  $('serviceSelect').addEventListener('change', syncService);
  $('guestPeople').addEventListener('input', updateSummary);
  $('scrollToFormBtn').addEventListener('click', () => {
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('guestPhone').addEventListener('input', (e) => {
    const pos = e.target.selectionStart;
    e.target.value = fmtPhone(e.target.value);
    if (pos !== null && pos >= e.target.value.length) e.target.setSelectionRange(e.target.value.length, e.target.value.length);
  });
  $('lookupPhone').addEventListener('input', (e) => {
    e.target.value = fmtPhone(e.target.value);
  });

  $('navToggle').addEventListener('click', () => {
    $('siteNav').classList.toggle('open');
  });
  $('siteNav').querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => $('siteNav').classList.remove('open'));
  });

  /* плавное появление секций */
  let observer = null;
  function observeReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    document.querySelectorAll('.reveal:not(.in)').forEach((el) => observer.observe(el));
  }

  /* --------- живое обновление расписания (другой гость занял) -------- */

  function subscribeLive() {
    if (!('EventSource' in window)) return;
    const source = new EventSource('/api/events');
    source.addEventListener('open', () => {
      $('liveDot').style.color = '#12703f';
    });
    source.addEventListener('error', () => {
      $('liveDot').style.color = '#b3245c';
    });
    source.addEventListener('slots', async (event) => {
      let payload = {};
      try { payload = JSON.parse(event.data); } catch (err) { payload = {}; }
      if (!payload.date || payload.date === state.date) await loadSlots();
      await loadSchedule();
      renderDateStrip();
    });
    source.addEventListener('bookings', async (event) => {
      let payload = {};
      try { payload = JSON.parse(event.data); } catch (err) { payload = {}; }
      if (!payload.date || payload.date === state.date) await loadSlots();
    });
    source.addEventListener('photos', () => loadPhotos());
    source.addEventListener('settings', () => loadSettings());
  }

  /* ============================== СТАРТ ============================= */

  (async function init() {
    await loadSettings();
    await loadPhotos();
    await loadSchedule();
    const today = new Date();
    await selectDate(ymd(today));
    updateSummary();
    observeReveal();
    subscribeLive();
  })();
})();

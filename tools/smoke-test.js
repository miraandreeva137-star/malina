'use strict';
const BASE = 'http://127.0.0.1:4321';
let failures = 0;
const log = (ok, text) => { console.log((ok ? '  OK   ' : '  ФЕЙЛ ') + text); if (!ok) failures++; };

async function json(path, options) {
  const res = await fetch(BASE + path, options);
  let data = {};
  try { data = await res.json(); } catch (e) { /* пусто */ }
  return { status: res.status, data };
}

function ymdPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

(async () => {
  console.log('\n=== ПРОВЕРКА САЙТА «МАЛИНА» ===\n');

  // страницы
  for (const page of ['/', '/guest.html', '/admin.html', '/styles.css', '/guest.js', '/admin.js']) {
    const res = await fetch(BASE + page);
    log(res.status === 200, 'страница ' + page + ' → ' + res.status);
  }

  // неверный адрес
  const notFound = await fetch(BASE + '/no-such-page');
  log(notFound.status === 404, 'несуществующая страница → 404');

  // настройки
  const settings = await json('/api/settings');
  log(settings.status === 200 && settings.data.settings.city === 'Белорецк',
    'настройки: ' + settings.data.settings.studioName + ', ' + settings.data.settings.city +
    ', услуг ' + settings.data.settings.services.length + ', слотов ' + settings.data.settings.slotTimes.length);
  log(typeof settings.data.settings.adminPassHash === 'undefined' && typeof settings.data.settings.secret === 'undefined',
    'пароль и секрет не утекают в публичный API');

  // неверный пароль
  const badLogin = await json('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', password: 'неверный' }),
  });
  log(badLogin.status === 401, 'неверный пароль → 401');

  const login = await json('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', password: 'malina2024' }),
  });
  log(login.status === 200 && !!login.data.token, 'вход админа → токен получен');
  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.data.token };

  // админский API без токена
  const noAuth = await json('/api/admin/bookings');
  log(noAuth.status === 401, 'админский API без токена → 401');

  // фото
  const photos = await json('/api/photos');
  log(photos.status === 200 && photos.data.photos.length > 0, 'галерея: ' + photos.data.photos.length + ' фото');
  const first = photos.data.photos[0];
  if (first) {
    const img = await fetch(BASE + first.url);
    log(img.status === 200, 'файл фото отдаётся: ' + first.url + ' (' + (img.headers.get('content-type') || '') + ')');
  }

  // расписание
  const sched = await json('/api/schedule?days=14');
  const freeTotal = sched.data.days_list.reduce((s, d) => s + d.free, 0);
  log(sched.status === 200 && sched.data.days_list.length === 14, 'расписание на 14 дней, свободно слотов: ' + freeTotal);

  // ---- бронирование и конфликт двух гостей ----
  const date = ymdPlus(3);
  const slotsBefore = (await json('/api/slots?date=' + date)).data.slots;
  const freeSlot = slotsBefore.find((s) => s.status === 'free').time;
  log(!!freeSlot, 'свободный слот для теста: ' + date + ' ' + freeSlot);

  const b1 = await json('/api/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Тест Гость Первый', phone: '+7 (900) 111-22-33', serviceId: 's1',
      date, time: freeSlot, people: 2, preferences: 'Нежный образ, светлые тона',
      source: 'Instagram', agree: true,
    }),
  });
  log(b1.status === 201 && !!b1.data.booking.code, 'первый гость забронировал → код ' + (b1.data.booking && b1.data.booking.code));

  const b2 = await json('/api/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Тест Гость Второй', phone: '+7 (900) 444-55-66', serviceId: 's2',
      date, time: freeSlot, people: 1, agree: true,
    }),
  });
  log(b2.status === 409, 'второй гость на этот же слот → 409: «' + (b2.data.error || '') + '»');

  const slotsAfter = (await json('/api/slots?date=' + date)).data.slots;
  const nowBusy = slotsAfter.find((s) => s.time === freeSlot);
  log(nowBusy && nowBusy.status === 'busy', 'слот помечен занятым для остальных: ' + freeSlot + ' → ' + (nowBusy && nowBusy.status));

  // та же бронь того же гостя повторно (защита от двойного клика)
  const b3 = await json('/api/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Тест Гость Первый', phone: '+7 (900) 111-22-33', date, time: freeSlot, agree: true }),
  });
  log(b3.status === 409, 'повторная отправка той же формы → 409 (слот занят)');

  // валидация
  const bad = await json('/api/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'А', phone: '123', date, time: freeSlot, agree: true }),
  });
  log(bad.status === 400, 'проверка данных: плохое имя/телефон → 400: «' + bad.data.error + '»');

  const noAgree = await json('/api/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Иван Иванов', phone: '+79001112233', date, time: freeSlot, agree: false }),
  });
  log(noAgree.status === 400, 'без согласия на обработку данных → 400');

  // заявки у админа
  const bookings = await json('/api/admin/bookings?status=all', { headers: auth });
  log(bookings.status === 200 && bookings.data.bookings.length >= 1,
    'админ видит заявки: ' + bookings.data.bookings.length + ' (новых: ' + bookings.data.stats.newBookings + ')');
  const mine = bookings.data.bookings.find((b) => b.phoneDigits === '79001112233');
  log(!!mine && mine.preferences.includes('Нежный образ'), 'пожелания гостя дошли до админа: «' + (mine && mine.preferences) + '»');

  // поиск броней гостем
  const lookup = await json('/api/my-bookings?phone=79001112233');
  log(lookup.status === 200 && lookup.data.bookings.length >= 1, 'гость нашёл свои брони по телефону: ' + lookup.data.bookings.length);

  // смена статуса и блокировка времени
  const confirm = await json('/api/admin/bookings/' + mine.id, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'confirmed', adminNote: 'Тестовая заметка' }),
  });
  log(confirm.status === 200 && confirm.data.booking.status === 'confirmed', 'админ подтвердил заявку');

  const date2 = ymdPlus(4);
  const time2 = settings.data.settings.slotTimes[0];
  const block = await json('/api/admin/blocks', {
    method: 'POST', headers: auth, body: JSON.stringify({ date: date2, times: [time2], reason: 'Съёмка студии' }),
  });
  log(block.status === 200 && block.data.added.length === 1, 'студия закрыла время ' + date2 + ' ' + time2);
  const slotBlocked = (await json('/api/slots?date=' + date2)).data.slots.find((s) => s.time === time2);
  log(slotBlocked && slotBlocked.status === 'blocked', 'время помечено как закрытое студией');

  // загрузка и удаление фото (проверка редактирования галереи)
  const testSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ffb8d0"/></svg>',
    'utf8').toString('base64');
  const upload = await json('/api/admin/photos', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ files: [{ name: 'test.svg', dataUrl: 'data:image/svg+xml;base64,' + testSvg }], title: 'Проверка', category: 'Тест' }),
  });
  log(upload.status === 200 && upload.data.added.length === 1, 'админ загрузил фото');
  const newId = upload.data.added[0].id;
  const del = await json('/api/admin/photos/' + newId, { method: 'DELETE', headers: auth });
  log(del.status === 200, 'админ удалил фото');
  const afterDel = await json('/api/photos');
  log(!afterDel.data.photos.some((p) => p.id === newId), 'удалённое фото исчезло из галереи');

  // плохой файл
  const badFile = await json('/api/admin/photos', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ files: [{ name: 'virus.exe', dataUrl: 'data:application/x-msdownload;base64,AAAA' }] }),
  });
  log(badFile.status === 400, 'не-изображение отклонено: «' + badFile.data.error + '»');

  // смена пароля и возврат обратно
  const pass1 = await json('/api/admin/password', { method: 'POST', headers: auth, body: JSON.stringify({ current: 'malina2024', next: 'test-pass-123' }) });
  log(pass1.status === 200, 'пароль изменён на временный');
  const pass2 = await json('/api/admin/password', { method: 'POST', headers: auth, body: JSON.stringify({ current: 'test-pass-123', next: 'malina2024' }) });
  log(pass2.status === 200, 'пароль возвращён на стандартный');
  const passWrong = await json('/api/admin/password', { method: 'POST', headers: auth, body: JSON.stringify({ current: 'не тот', next: 'что-то' }) });
  log(passWrong.status === 400, 'смена пароля с неверным текущим → 400');

  // ---- очистка тестовых данных ----
  console.log('\n--- очистка тестовых данных ---');
  for (const b of (await json('/api/admin/bookings?status=all', { headers: auth })).data.bookings) {
    if (String(b.name).startsWith('Тест Гость')) {
      await json('/api/admin/bookings/' + b.id, { method: 'DELETE', headers: auth });
    }
  }
  for (const bl of (await json('/api/admin/blocks', { headers: auth })).data.blocks) {
    await json('/api/admin/blocks/' + bl.id, { method: 'DELETE', headers: auth });
  }
  const clean = await json('/api/admin/bookings?status=all', { headers: auth });
  const cleanBlocks = await json('/api/admin/blocks', { headers: auth });
  log(clean.data.bookings.length === 0 && cleanBlocks.data.blocks.length === 0,
    'тестовые заявки и блокировки удалены (заявок: ' + clean.data.bookings.length + ')');

  const finalSlots = (await json('/api/slots?date=' + date)).data.slots;
  log(finalSlots.every((s) => s.status === 'free'), 'все слоты снова свободны после отмены');

  console.log('\n=== ИТОГ: ' + (failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : 'ОШИБОК: ' + failures) + ' ===\n');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('\nСбой проверки: ' + err.message + '\n' + err.stack);
  process.exit(1);
});

/* =========================================================================
   Одноразовый скрипт: заливает в галерею 8 демонстрационных заглушек,
   чтобы сайт не выглядел пустым. Администратор удаляет их в панели
   и загружает настоящие фотографии.

   Запуск (сервер должен быть уже запущен):
     node tools/seed-demo-photos.js
   ========================================================================= */
'use strict';

const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const LOGIN = process.env.ADMIN_LOGIN || 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD || 'malina2024';

const PINK = ['#ffd9e8', '#ffc2d8', '#ffb1cd', '#ffe9f1', '#ff9dbb', '#f76f9d'];

function svg(opts) {
  const { title, subtitle, c1, c2, c3, accent } = opts;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="0.55" stop-color="${c2}"/>
      <stop offset="1" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.25" r="0.75">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="42"/></filter>
    <filter id="soft2"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>

  <rect width="1200" height="1500" fill="url(#bg)"/>
  <rect width="1200" height="1500" fill="url(#glow)"/>

  <g filter="url(#soft)" opacity="0.75">
    <circle cx="250" cy="330" r="230" fill="${accent}"/>
    <circle cx="980" cy="620" r="260" fill="#ffffff"/>
    <circle cx="420" cy="1230" r="250" fill="${accent}" opacity="0.6"/>
  </g>

  <g filter="url(#soft2)" opacity="0.9">
    <ellipse cx="600" cy="700" rx="300" ry="380" fill="#ffffff" opacity="0.4"/>
  </g>

  <g fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3">
    <circle cx="600" cy="640" r="300"/>
    <circle cx="600" cy="640" r="360"/>
  </g>

  <text x="600" y="600" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="74" font-style="italic" fill="#7d1440" opacity="0.92">${subtitle}</text>
  <text x="600" y="672" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="46" fill="#b3245c" opacity="0.85">${title}</text>

  <text x="600" y="1330" text-anchor="middle" font-family="Georgia, serif" font-size="40"
        fill="#7d1440" opacity="0.85">🍓 Малина · фотостудия · Белорецк</text>
  <text x="600" y="1392" text-anchor="middle" font-family="Arial, sans-serif" font-size="26"
        fill="#b3245c" opacity="0.6" letter-spacing="3">ЗАМЕНИТЕ НА СВОЁ ФОТО</text>
</svg>`;
}

const DEMO = [
  { title: 'Портреты', subtitle: 'Портрет в мягком свете', c1: '#fff3f8', c2: '#ffd6e4', c3: '#ffb8d0', accent: '#ff9dbb' },
  { title: 'Love Story', subtitle: 'История вдвоём', c1: '#fff1f6', c2: '#ffcfe2', c3: '#f9a8c6', accent: '#f2679b' },
  { title: 'Семейные', subtitle: 'Семейная съёмка', c1: '#fff6f9', c2: '#ffe0ec', c3: '#ffc2d8', accent: '#ffb1cd' },
  { title: 'Детские', subtitle: 'Детская съёмка', c1: '#fff7fb', c2: '#ffe6ef', c3: '#ffcde0', accent: '#ffc2d8' },
  { title: 'Свадебные', subtitle: 'Свадебная история', c1: '#fff2f7', c2: '#ffdce9', c3: '#f7b6cf', accent: '#e88ab0' },
  { title: 'Съёмки', subtitle: 'Контент для бренда', c1: '#fff4f8', c2: '#ffdbe8', c3: '#ffbcd6', accent: '#f76f9d' },
  { title: 'Портреты', subtitle: 'Нежный образ', c1: '#fff5f9', c2: '#ffd8e6', c3: '#ffbcd4', accent: '#ff8fb4' },
  { title: 'Семейные', subtitle: 'Тёплый вечер', c1: '#fff3f8', c2: '#ffdde9', c3: '#ffc6da', accent: '#ffa5c4' },
];

async function main() {
  const loginRes = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.ok) {
    throw new Error('Не удалось войти: ' + (loginData.error || loginRes.status));
  }
  const token = loginData.token;

  const existing = await (await fetch(BASE + '/api/photos')).json();
  if ((existing.photos || []).length > 0) {
    console.log('В галерее уже есть фото (' + existing.photos.length + ') — заглушки не добавляю.');
    return;
  }

  const files = DEMO.map((item) => ({
    name: item.title.replace(/\s+/g, '-').toLowerCase() + '.svg',
    dataUrl: 'data:image/svg+xml;base64,' + Buffer.from(svg(item), 'utf8').toString('base64'),
    title: item.subtitle,
    category: item.title,
  }));

  const res = await fetch(BASE + '/api/admin/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ files }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error('Не удалось загрузить: ' + (data.error || res.status));
  console.log('Добавлено заглушек: ' + data.added.length);
  if (data.errors && data.errors.length) console.log('Ошибки: ' + data.errors.join('; '));
}

main().catch((err) => {
  console.error('Ошибка: ' + err.message);
  process.exit(1);
});

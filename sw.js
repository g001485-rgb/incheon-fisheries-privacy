/* 앱을 기기에 저장해 두어, 인터넷이 없어도 열리게 합니다.
 * 파일을 고칠 때마다 CACHE 이름의 숫자를 올리면 새 내용으로 바뀝니다. */
const CACHE = 'worklog-v2';

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/model.js',
  './js/ocr.js',
  './js/app.js',
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js',
  './sample/sample-worksheet.jpg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 한 파일이 실패해도 나머지는 저장되도록 하나씩 담습니다.
      .then((c) => Promise.allSettled(SHELL.map((url) => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 문자 인식 엔진 등 바깥에서 받아오는 것은 그대로 통과시킵니다.
  if (new URL(req.url).origin !== self.location.origin) return;

  // 페이지 자체는 새 것을 먼저 받아옵니다. 그래야 고친 내용이 바로 보입니다.
  // 인터넷이 없으면 저장해 둔 것으로 엽니다.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // 저장해 둔 것을 먼저 보여주고, 뒤에서 조용히 최신으로 갱신합니다.
        fetch(req)
          .then((res) => res.ok && caches.open(CACHE).then((c) => c.put(req, res.clone())))
          .catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

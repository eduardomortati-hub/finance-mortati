// Service worker: guarda os arquivos do app no aparelho para abrir offline.
// Só lida com arquivos do próprio app — os dados financeiros ficam no localStorage e nunca passam por aqui.
// Ao publicar mudanças, aumente VERSION para o app oferecer a atualização.
const VERSION = 'v1';
const CACHE = 'meucaixa-' + VERSION;
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/util.js',
  './js/store.js',
  './js/finance.js',
  './js/views.js',
  './js/actions.js',
  './js/import.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f, {cache:'reload'})))));
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('meucaixa-') && k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message', e=>{ if(e.data==='skipWaiting') self.skipWaiting(); });

// cache primeiro; só arquivos do próprio site, nada externo
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET' || new URL(req.url).origin!==location.origin) return;
  if(req.mode==='navigate'){
    e.respondWith(caches.match('./index.html').then(r=>r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, {ignoreSearch:true}).then(r=>r || fetch(req)));
});

// Service worker: guarda os arquivos do app no aparelho para abrir offline.
// Só lida com arquivos do próprio app — os dados financeiros ficam no localStorage e nunca passam por aqui.
// VERSION é um hash dos arquivos, gerado por tools/stamp-sw.mjs no pre-commit: qualquer mudança vira versão nova
// e o app instalado oferece a atualização. Ao criar um arquivo novo, inclua-o em FILES.
const VERSION = '6074aacdfc85';
const CACHE = 'meucaixa-' + VERSION;
const FILES = [
  './',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/tema.js',
  './js/config.js',
  './js/util.js',
  './js/store.js',
  './js/finance.js',
  './js/views.js',
  './js/actions.js',
  './js/import.js',
  './js/model.js',
  './js/crypto.js',
  './js/modal.js',
  './fonts/hanken-grotesk.woff2',
  './fonts/instrument-serif.woff2',
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
  // toda navegação abre a página do app guardada em './'
  // (não usa './index.html': alguns servidores redirecionam esse endereço, e o navegador recusa resposta redirecionada em navegação)
  if(req.mode==='navigate'){
    e.respondWith(caches.match('./').then(r=>r && !r.redirected ? r : fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, {ignoreSearch:true}).then(r=>r || fetch(req)));
});

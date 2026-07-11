/* Murdoku service worker — offline support */
const VERSION = 'murdoku-v1';
const SHELL = [
  './', './index.html', './css/style.css', './js/app.js',
  './data/puzzles.json', './manifest.webmanifest',
  './icons/icon-192.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k!==VERSION).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET') return;
  const url = new URL(req.url);
  if(url.origin!==location.origin) return;
  // network-first for the data file so updates land; cache-first for everything else
  if(url.pathname.endsWith('puzzles.json')){
    e.respondWith(fetch(req).then(r=>{
      const cp=r.clone(); caches.open(VERSION).then(c=>c.put(req,cp)); return r;
    }).catch(()=>caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit=> hit || fetch(req).then(r=>{
    if(r.ok && (url.pathname.includes('/assets/scenes/') || SHELL.includes('.'+url.pathname))){
      const cp=r.clone(); caches.open(VERSION).then(c=>c.put(req,cp));
    }
    return r;
  }).catch(()=>hit)));
});

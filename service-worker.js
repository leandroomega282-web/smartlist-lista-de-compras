/* ====================================================
   SMARTLIST - SERVICE WORKER
   Permite uso offline e cache de recursos
   ==================================================== */

const CACHE_VERSION = 'smartlist-v1.0.0';
const CACHE_NAME = `smartlist-cache-${CACHE_VERSION}`;

// Arquivos essenciais (cache-first)
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon.svg'
];

// Recursos externos (network-first com fallback)
const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.0/jspdf.plugin.autotable.min.js'
];

/* ----- INSTALL: pre-cache assets ----- */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets');
                return cache.addAll(CORE_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

/* ----- ACTIVATE: clean old caches ----- */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key.startsWith('smartlist-cache-') && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

/* ----- FETCH: serve from cache, fallback to network ----- */
self.addEventListener('fetch', (event) => {
    // Apenas GET
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Estratégia: stale-while-revalidate para todos os GETs
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request)
                .then((response) => {
                    // Cacheia apenas respostas válidas
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Offline e sem cache: retorna página principal se for navegação
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });

            return cached || fetchPromise;
        })
    );
});

/* ----- MESSAGE: comunicação com a página ----- */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

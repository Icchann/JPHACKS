/* global self, caches, URL, fetch, Response */
/**
 * 山網（Sanmou）現場用 PWA Service Worker (Issue #38, #58)
 *
 * 設計意図:
 * 1. PC不在・携帯圏外の山間部現場において、ブラウザ終了後も /mobile 登録画面シェルを再起動可能にする。
 * 2. APIリクエスト (/api/*) や機密情報は安易にキャッシュせず、ネットワーク疎通時のみ通信を許可する。
 * 3. キャッシュ戦略:
 *    - HTML/画面遷移: Network First (失敗時にキャッシュ済み /mobile アプリシェルへフォールバック)
 *    - 静的アセット: Cache First (キャッシュ済みリソースを高速返却)
 */
const CACHE_NAME = "sanmou-mobile-shell-v1";
const PRECACHE_URLS = ["/mobile", "/manifest.webmanifest", "/icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // 1. APIリクエストやPOST等のミューテーションはキャッシュを介さず常に直接ネットワークへ流す
  if (
    event.request.method !== "GET" ||
    requestUrl.pathname.startsWith("/api/")
  ) {
    return;
  }

  // 2. /mobile 画面ナビゲーションの場合: Network First (オフライン時はキャッシュ済みシェルへフォールバック)
  if (
    event.request.mode === "navigate" ||
    requestUrl.pathname.startsWith("/mobile")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // URLパラメータ（?node=T1等）でキャッシュミスした場合も /mobile のシェルを返す
          const shellResponse = await caches.match("/mobile");
          if (shellResponse) {
            return shellResponse;
          }
          return new Response(
            "山網: 圏外再起動シェルが見つかりません。事前にオンラインで画面を一度開いてください。",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          );
        }),
    );
    return;
  }

  // 3. その他の静的アセット (_next/static, アイコン等): Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    }),
  );
});

/* eslint-disable no-undef */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (workbox) {
  console.log(`Workbox is loaded`);
  workbox.setConfig({ debug: true });
  
  // 必须加载 Range Requests 模块
  workbox.loadModule('workbox-range-requests');

  /**
   * Normalize Cloudinary URL for stable cache keys.
   * - Removes version segment: /v123456789/
   * - Keeps transformations and public_id
   * - Works for image + video
   */
  function normalizeCloudinaryUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== 'res.cloudinary.com') return url;

      const parts = u.pathname.split('/').filter(Boolean);
      // Expected: /<cloud>/<asset_type>/upload/...
      if (parts.length < 4) return url;

      const [cloud, assetType, upload, ...rest] = parts;
      if (upload !== 'upload') return url;

      // Drop version segment if present (e.g. v1765577339)
      const normalizedRest = rest[0] && /^v\d+$/.test(rest[0]) ? rest.slice(1) : rest;

      u.pathname = `/${cloud}/${assetType}/upload/${normalizedRest.join('/')}`;
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  const cloudinaryCanonicalPlugin = {
    cacheKeyWillBeUsed: async ({ request, mode }) => {
      // 无论是读取(read)还是写入(write)，都使用规范化 URL
      if (mode === 'read' || mode === 'write') {
        return normalizeCloudinaryUrl(request.url);
      }
      return request.url;
    },
  };

  // --- 1. Cache Cloudinary Images ---
  workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://res.cloudinary.com' && url.pathname.includes('/image/upload/'),
    new workbox.strategies.CacheFirst({
      cacheName: 'cloudinary-images-cache',
      // 添加 ignoreVary 以提高命中率
      matchOptions: {
        ignoreVary: true,
      },
      plugins: [
        cloudinaryCanonicalPlugin, // 应用规范化插件
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
          purgeOnQuotaError: true, 
        }),
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [200], // 移除 0，只允许 200 (CORS) 以避免配额惩罚
        }),
      ],
    })
  );

  // --- 2. Cache Cloudinary Videos ---
  workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://res.cloudinary.com' && url.pathname.includes('/video/upload/'),
    new workbox.strategies.CacheFirst({
      cacheName: 'cloudinary-videos-cache',
      // 忽略 Vary: Origin 等差异，确保 fetch(cors) 写入的缓存能被 video 标签复用
      matchOptions: {
        ignoreVary: true,
        ignoreSearch: true 
      },
      plugins: [
        cloudinaryCanonicalPlugin, // 应用规范化插件
        new workbox.cacheableResponse.CacheableResponsePlugin({ 
            statuses: [200] // 只缓存完整响应
        }),
        new workbox.rangeRequests.RangeRequestsPlugin(),
      ],
    })
  );

  // --- 3. Cache Fonts ---
  workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'google-fonts-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
        }),
      ],
    })
  );

  self.addEventListener('install', (event) => {
    self.skipWaiting();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
  });

} else {
  console.log(`Workbox didn't load`);
}
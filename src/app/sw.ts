/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { ExpirationPlugin, NetworkFirst, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Only genuinely-STATIC routes may be precached. The operator/admin pages are
// dynamic + authenticated (rendered per-request via cookies()), so there is no
// build artifact for them — precaching them with revision:null fetched them live
// at SW-install time and captured the auth REDIRECT TO /login, caching a login
// page under the operator URL (the offline→/login bug). Those routes are instead
// RSC-prefetched while online (RoutePrefetcher) and runtime-cached below.
const STATIC_PRECACHE = ['/~offline']

const precacheEntries = [
  ...(self.__SW_MANIFEST ?? []),
  ...STATIC_PRECACHE.map((url) => ({ url, revision: null })),
]

const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Field reads an operator depends on offline: keep them fresh-when-online
      // (NetworkFirst) but valid for up to the PRD's 7 days without a sync.
      matcher: ({ sameOrigin, url: { pathname } }) =>
        sameOrigin &&
        // UR-007/026: cache the identity endpoint so useAuth resolves offline
        // from cache (operator stays "logged in") instead of a hard fetch error.
        (pathname === '/api/auth/me' ||
          pathname === '/api/dashboard' ||
          pathname.startsWith('/api/deployments') ||
          pathname.startsWith('/api/inventory') ||
          pathname.startsWith('/api/vehicles') ||
          pathname.startsWith('/api/maintenance') ||
          pathname.startsWith('/api/daily-check') ||
          pathname.startsWith('/api/transfers') ||
          pathname.startsWith('/api/handoffs') ||
          pathname.startsWith('/api/deployment-requests') ||
          pathname.startsWith('/api/hubs') ||
          // CC-14 (NS-10): the Today aggregate is the operator's morning read — must
          // survive offline like the other field reads it assembles. Trailing slash so
          // this doesn't also swallow /api/operators (the roster dropdown endpoint).
          pathname.startsWith('/api/operator/') ||
          // CC-32 (3.1): the operator crew map is now a bottom-nav tab, so it has to
          // survive offline like every other field read — last-cached pins under a
          // freshness stamp beat a red "Failed to load crew map" dead end. EXACT match,
          // deliberately NOT startsWith('/api/map'): /api/map/pins and
          // /api/map/route-history are ADMIN endpoints and must stay out of the
          // operator's cache.
          pathname === '/api/map/crew' ||
          pathname.startsWith('/api/notifications')),
      method: 'GET',
      handler: new NetworkFirst({
        cacheName: 'ahits-field-reads',
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 256,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    // RSC navigations (the real offline fix). App-Router client-side tab
    // switches are fetches carrying an `RSC` header — NOT request.mode==='navigate'
    // — so the document matcher below never sees them. Cache them so tapping
    // between tabs works offline. The routes are warmed by RoutePrefetcher while
    // online, so they're in this cache before the operator loses signal.
    {
      matcher: ({ request, sameOrigin, url: { pathname } }) =>
        sameOrigin && request.headers.has('RSC') &&
        (pathname.startsWith('/operator') || pathname.startsWith('/admin')),
      handler: new NetworkFirst({
        cacheName: 'ahits-app-rsc',
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 }),
        ],
      }),
    },
    // Full-document navigations (cold start, hard reload): serve the cached shell
    // when the network is slow/absent so a warm route opens offline.
    {
      matcher: ({ request, url: { pathname } }) =>
        request.mode === 'navigate' &&
        (pathname.startsWith('/operator') || pathname.startsWith('/admin')),
      handler: new NetworkFirst({
        cacheName: 'ahits-app-pages',
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 7 * 24 * 60 * 60 }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

serwist.addEventListeners()

export {}

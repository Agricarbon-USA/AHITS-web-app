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

// Operator shell routes precached so a cold, no-signal launch lands on a
// usable screen instead of the /~offline dead-end. (PRD §7.9 offline-first.)
const OPERATOR_ROUTES = [
  '/operator/dashboard',
  '/operator/daily-check',
  '/operator/scan',
  '/operator/my-rig',
  '/~offline',
]

const precacheEntries = [
  ...(self.__SW_MANIFEST ?? []),
  ...OPERATOR_ROUTES.map((url) => ({ url, revision: null })),
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
          pathname.startsWith('/api/daily-check')),
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
    // App navigations: serve the cached shell when the network is slow/absent so
    // the app opens cold offline. UR-026: include /admin too — operators browse
    // admin pages read-only, and without a cached shell those navigations hit the
    // offline server and bounce to /login.
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

// JBNU Dormi 서비스 워커: 채팅 푸시 알림만 다룬다 (화면·파일 캐시는 하지 않음 — 배포하면 바로 새 화면이 보이게)
// 알림 내용은 supabase/functions/send-chat-push 가 보낸다: { title, body, url, tag }

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const url = data.url || '/chats'

  event.waitUntil(
    (async () => {
      // 그 대화방을 지금 보고 있으면 알림을 띄우지 않는다 (화면에 바로 보이므로)
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const watching = windows.some((w) => {
        try {
          return w.visibilityState === 'visible' && new URL(w.url).pathname === url
        } catch {
          return false
        }
      })
      if (watching) return
      await self.registration.showNotification(data.title || '새 채팅', {
        body: data.body || '새 메시지가 왔어요.',
        tag: data.tag || url, // 같은 대화의 알림은 하나로 묶어 최신 것만
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        lang: 'ko',
        data: { url },
      })
    })(),
  )
})

// 알림을 누르면: 이미 열린 창이 있으면 그 창에서, 없으면 새 창으로 그 대화방을 연다
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/chats', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if (new URL(w.url).origin !== self.location.origin) continue
        await w.focus()
        if ('navigate' in w) return w.navigate(url)
        return
      }
      return self.clients.openWindow(url)
    })(),
  )
})

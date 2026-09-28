// 채팅 푸시 알림 보내기 (Supabase Edge Function: send-chat-push)
//
// DB 트리거(supabase/migrations/20261024000000_chat_push.sql 의 notify_roommate_chat_push)가
// 새 메시지마다 { subscriptions, notification } 을 보내면, 받는 사람의 기기마다 웹 푸시를 보낸다.
// 만료된 기기(404 · 410)는 push_subscriptions 에서 지운다.
//
// 필요한 비밀 값 (Supabase Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY  `npx web-push generate-vapid-keys` 로 만든 키 한 쌍
//   VAPID_SUBJECT                         연락처 (예: mailto:thisiswoo04@gmail.com)
//   PUSH_WEBHOOK_SECRET                   DB 의 private.app_secrets 'push_webhook_secret' 과 같은 값
// SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 준다.
// 배포할 때 "Verify JWT" 는 끈다 (DB 가 JWT 없이 부르고, 대신 x-webhook-secret 으로 확인한다).

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

type Subscription = { endpoint: string; p256dh: string; auth: string }
type Payload = {
  subscriptions?: Subscription[]
  notification?: { title: string; body: string; url: string; tag: string }
}

const env = (name: string) => Deno.env.get(name) ?? ''

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

// 두 문자열이 같은지 (걸린 시간으로 비밀 값을 추측하지 못하게 끝까지 비교)
function same(a: string, b: string) {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!same(req.headers.get('x-webhook-secret') ?? '', env('PUSH_WEBHOOK_SECRET'))) {
    return new Response('forbidden', { status: 403 })
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }
  const subscriptions = (payload.subscriptions ?? []).slice(0, 20)
  const notification = payload.notification
  if (!notification || !subscriptions.length) return Response.json({ sent: 0, removed: 0 })

  const message = JSON.stringify(notification)
  const gone: string[] = []
  let sent = 0
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, {
          TTL: 60 * 60, // 기기가 꺼져 있어도 1시간 동안은 전달을 시도
          urgency: 'high',
          topic: notification.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32), // 같은 대화의 밀린 알림은 마지막 것만
        })
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 알림을 끈 · 앱을 지운 기기: 목록에서 지운다
        if (status === 404 || status === 410) gone.push(s.endpoint)
        else console.error('push failed', status, (err as Error).message)
      }
    }),
  )

  if (gone.length) {
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
    const { error } = await admin.from('push_subscriptions').delete().in('endpoint', gone)
    if (error) console.error('cleanup failed', error.message)
  }
  return Response.json({ sent, removed: gone.length })
})

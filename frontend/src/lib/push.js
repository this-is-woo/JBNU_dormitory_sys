import { VAPID_PUBLIC_KEY, isSupabaseConfigured } from '../config.js'

// 채팅 푸시 알림 (supabase/migrations/20261024000000_chat_push.sql, supabase/functions/send-chat-push, public/sw.js)
//   · 이 기기에서 알림을 켜면: 서비스 워커(/sw.js)를 등록하고, 브라우저가 준 구독 정보를 DB 에 저장한다.
//   · 새 메시지가 오면 DB → Edge Function → 브라우저 푸시 서버 → 서비스 워커가 폰 상단에 알림을 띄운다.
//   · 권한 창은 사용자가 버튼을 누른 순간에만 띄울 수 있다 (특히 아이폰). 그래서 [알림 받기] 버튼으로 묻는다.
//   · 아이폰은 사파리에서 [공유 → 홈 화면에 추가]로 설치한 앱에서만 알림을 받을 수 있다 (iOS 16.4 이상).
// VITE_VAPID_PUBLIC_KEY 가 없으면(설정 전 · 데모) 알림 기능을 숨긴다.

const DISMISS_KEY = 'jbnu-dorm:push-dismissed'
const DISMISS_DAYS = 7

export const pushConfigured = Boolean(VAPID_PUBLIC_KEY)

// 이 기기의 알림을 켜거나 끄면 알린다 → 같은 화면의 [알림 받기] 안내 띠와 [채팅 알림] 스위치가 서로 맞춘다
export const PUSH_EVENT = 'jbnu-dorm:push-changed'
const announce = (on) => window.dispatchEvent(new CustomEvent(PUSH_EVENT, { detail: { on } }))

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isAndroid = () => /Android/.test(navigator.userAgent)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

// 다른 앱 안에서 연 화면(인앱 브라우저): 알림 · 홈 화면에 추가를 쓸 수 없다
const IN_APPS = [
  [/KAKAOTALK/i, '카카오톡'],
  [/everytime/i, '에브리타임'],
  [/Instagram/, '인스타그램'],
  [/FBAN|FBAV|FB_IAB|FBIOS/, '페이스북'],
  [/\bLine\//, '라인'],
  [/NAVER\(inapp/, '네이버 앱'],
  [/DaumApps/, '다음 앱'],
  [/\bBAND\//, '밴드'],
]

function inAppName() {
  const ua = navigator.userAgent
  const known = IN_APPS.find(([re]) => re.test(ua))
  if (known) return known[1]
  // 이름을 모르는 앱 안의 화면: 안드로이드 WebView(; wv) · 아이폰에서 Safari 표시가 없는 화면
  if (isAndroid() && /; wv\)/.test(ua)) return '앱'
  if (isIos() && !isStandalone() && !/Safari\//.test(ua)) return '앱'
  return null
}

/**
 * 이 기기에서 알림을 받을 수 있는지
 *   'supported'
 *   'in-app'       다른 앱(카카오톡 등) 안에서 연 화면 → 브라우저로 열어야 함
 *   'ios-install'  아이폰 Safari → 홈 화면에 추가한 앱에서만 받음
 *   'ios-browser'  아이폰의 다른 브라우저(크롬 등) → Safari 에서 홈 화면에 추가해야 함
 *   'unsupported'  알림을 지원하지 않는 브라우저
 *   'off'          알림 기능을 설정하지 않음(VITE_VAPID_PUBLIC_KEY 없음) → 알림 관련 화면을 모두 숨긴다
 */
export function pushSupport() {
  if (typeof window === 'undefined' || !pushConfigured) return 'off'
  if (inAppName()) return 'in-app'
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (apis && window.isSecureContext) return 'supported'
  if (isIos() && !isStandalone()) return /CriOS|FxiOS|EdgiOS|Whale|OPiOS|SamsungBrowser/.test(navigator.userAgent) ? 'ios-browser' : 'ios-install'
  return 'unsupported'
}

/** 알림을 받을 수 없는 곳인지 (설정 전이면 false: 아예 숨긴다) */
export const pushUnavailable = (support = pushSupport()) => support !== 'supported' && support !== 'off'

// 안드로이드: 크롬으로 이 주소를 연다 (크롬이 없으면 기본 브라우저)
function openInChrome(url) {
  const u = new URL(url)
  const fallback = encodeURIComponent(url)
  window.location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`
}

/**
 * 알림을 받을 수 없을 때의 안내 문구와 [브라우저로 열기] 같은 버튼
 * @returns {{ message: string, action: null | { label: string, kind: 'open' | 'copy', run?: () => void } }}
 */
export function pushHelp(support = pushSupport()) {
  const here = window.location.href
  if (support === 'in-app') {
    const app = inAppName()
    const where = app === '앱' ? '앱 안에서 연 화면' : `${app} 안에서 연 화면`
    if (app === '카카오톡') {
      return {
        message: `${where}에서는 알림을 받을 수 없어요. 브라우저로 열어 주세요.`,
        action: { label: '브라우저로 열기', kind: 'open', run: () => (window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(here)}`) },
      }
    }
    if (app === '라인') {
      const u = new URL(here)
      u.searchParams.set('openExternalBrowser', '1')
      return {
        message: `${where}에서는 알림을 받을 수 없어요. 브라우저로 열어 주세요.`,
        action: { label: '브라우저로 열기', kind: 'open', run: () => (window.location.href = u.href) },
      }
    }
    if (isAndroid()) {
      return {
        message: `${where}에서는 알림을 받을 수 없어요. 크롬으로 열어 주세요.`,
        action: { label: '크롬으로 열기', kind: 'open', run: () => openInChrome(here) },
      }
    }
    return {
      message: `${where}에서는 알림을 받을 수 없어요. 화면의 [⋯] 메뉴에서 'Safari로 열기'를 눌러 주세요.`,
      action: { label: '링크 복사', kind: 'copy' },
    }
  }
  if (support === 'ios-install') {
    return { message: '아이폰은 Safari 아래의 [공유] → [홈 화면에 추가]로 설치한 앱에서 알림을 받을 수 있어요.', action: null }
  }
  if (support === 'ios-browser') {
    return {
      message: '아이폰은 Safari에서 [공유] → [홈 화면에 추가]로 설치해야 알림을 받을 수 있어요. 링크를 복사해 Safari에서 열어 주세요.',
      action: { label: '링크 복사', kind: 'copy' },
    }
  }
  if (isAndroid()) {
    return {
      message: '이 브라우저는 알림을 지원하지 않아요. 크롬이나 삼성 인터넷으로 열어 주세요.',
      action: { label: '크롬으로 열기', kind: 'open', run: () => openInChrome(here) },
    }
  }
  return {
    message: '이 브라우저는 알림을 지원하지 않아요. 크롬 · 엣지 · Safari 최신 버전에서 열어 주세요.',
    action: { label: '링크 복사', kind: 'copy' },
  }
}

/** 알림 권한: 'default'(아직 안 물어봄) · 'granted' · 'denied' */
export const pushPermission = () => (typeof Notification === 'undefined' ? 'denied' : Notification.permission)

// VAPID 공개 키(base64url) → 바이트
function keyBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

// 지금 키로 만든 구독인지 (키를 바꿨으면 다시 만든다)
function sameKey(subscription) {
  const current = subscription.options?.applicationServerKey
  if (!current) return true
  const a = new Uint8Array(current)
  const b = keyBytes(VAPID_PUBLIC_KEY)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

async function rpc(name, args) {
  if (!isSupabaseConfigured) return // 데모: 저장할 곳이 없다 (화면 흐름만 확인)
  const { supabase } = await import('./supabase.js')
  const { error } = await supabase.rpc(name, args)
  if (error) throw new Error('알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
}

/** 이 기기를 등록한다 (권한은 이미 허용된 상태) */
export async function registerPush() {
  announce(true)
  try {
    await register()
  } catch (err) {
    announce(false)
    throw err
  }
}

/** 알림 권한만 묻는다 (버튼을 누른 순간에만 부를 것). 이미 정해졌으면 창 없이 바로 결과 */
export async function requestPushPermission() {
  if (pushPermission() !== 'default') return pushPermission()
  return Notification.requestPermission()
}

async function register() {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !sameKey(subscription)) {
    await subscription.unsubscribe()
    subscription = null
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
      })
    } catch {
      throw new Error('이 브라우저에서는 알림을 켜지 못했어요.')
    }
  }
  const { endpoint, keys } = subscription.toJSON()
  await rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
}

/**
 * 알림 켜기: 권한을 묻고(버튼을 누른 순간에만 부를 것), 허용하면 이 기기를 등록한다.
 * @returns {Promise<'granted' | 'denied' | 'default'>} 권한 결과
 */
export async function enablePush() {
  const result = await Notification.requestPermission()
  if (result === 'granted') {
    // 허용하는 즉시 켠 것으로 알린다 (등록은 이어서 하고, 실패하면 다시 끈 것으로 알린다)
    announce(true)
    try {
      await register()
    } catch (err) {
      announce(false)
      throw err
    }
  }
  return result
}

/**
 * 이미 허용한 기기: 지금 로그인한 계정으로 조용히 다시 등록한다
 * (브라우저가 구독 주소를 바꿨거나, 이 기기를 다른 계정이 쓰다가 바뀐 경우를 맞춘다)
 */
export async function syncPush() {
  if (pushSupport() !== 'supported' || pushPermission() !== 'granted') return false
  await register()
  return true
}

/** 이 기기에 알림 구독이 있는지 */
export async function hasPushSubscription() {
  if (pushSupport() !== 'supported') return false
  const registration = await navigator.serviceWorker.getRegistration('/')
  return Boolean(registration && (await registration.pushManager.getSubscription()))
}

/** 이 기기 알림 끄기 ([알림 꺼짐] 버튼. 로그아웃할 때는 부르지 않는다 — 로그아웃해도 알림은 계속 받는다) */
export async function disablePush() {
  if (pushSupport() !== 'supported') return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = registration && (await registration.pushManager.getSubscription())
  if (!subscription) return announce(false)
  announce(false)
  // 브라우저 구독 해지와 서버 삭제를 함께 (하나씩 기다리지 않게). 해지만 되면 알림은 더 오지 않는다
  const [unsubscribed] = await Promise.allSettled([
    subscription.unsubscribe(),
    rpc('delete_push_subscription', { p_endpoint: subscription.endpoint }),
  ])
  if (unsubscribed.status === 'rejected') {
    announce(true)
    throw unsubscribed.reason
  }
}

/** [알림 받기] 안내를 닫으면 며칠 동안은 다시 띄우지 않는다 */
export function pushPromptDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 86400000
  } catch {
    return false
  }
}

export function dismissPushPrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // 저장하지 못하면 다음에 다시 보일 뿐
  }
}

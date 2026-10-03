import { useSyncExternalStore } from 'react'

// 앱 설치(홈 화면에 추가) 안내 (components/common/InstallBanner.jsx)
//   · 크롬 · 엣지 · 삼성 인터넷: 브라우저가 "설치할 수 있어요"(beforeinstallprompt)를 알려 주면 붙잡아 두었다가,
//     [설치하기]를 누를 때 브라우저의 설치 창을 띄운다.
//   · 아이폰: 설치 창을 띄우는 방법이 없어 [공유] → [홈 화면에 추가] 순서를 안내한다.
//   · 안드로이드인데 브라우저가 알려 주지 않으면(이미 설치 등) 잠시 기다린 뒤 메뉴로 설치하는 방법을 안내한다.
//   · 이미 앱으로 열었으면 아무것도 보이지 않는다.
// 이벤트는 페이지가 뜨자마자 올 수 있어 main.jsx 에서 이 파일을 가장 먼저 불러온다.

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
const isIos = /iPhone|iPad|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isAndroid = /Android/.test(ua)
const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)

let deferred = null // 브라우저가 넘겨준 설치 이벤트
let installed = false
let waited = false // 안드로이드: 이벤트를 기다릴 만큼 기다렸는지
let mode = computeMode()
const listeners = new Set()

function computeMode() {
  if (typeof window === 'undefined' || installed || isStandalone()) return 'none'
  if (deferred) return 'prompt'
  if (isIos) return 'ios'
  if (isAndroid && waited) return 'android'
  return 'none'
}

function update() {
  const next = computeMode()
  if (next === mode) return
  mode = next
  listeners.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // 브라우저의 작은 기본 안내 대신 우리 안내 띠의 [설치하기]로 띄운다
    e.preventDefault()
    deferred = e
    update()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    update()
  })
  window.addEventListener(
    'load',
    () => {
      // 설치할 수 있는 앱으로 인정받도록 서비스 워커를 등록해 둔다 (채팅 알림에도 같은 워커를 쓴다)
      if ('serviceWorker' in navigator && !isStandalone()) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
      setTimeout(() => {
        waited = true
        update()
      }, 2500)
    },
    { once: true },
  )
}

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const snapshot = () => mode

/** 'prompt'(설치 창을 띄울 수 있음) · 'ios' · 'android'(메뉴로 설치 안내) · 'none'(숨김) */
export const useInstallMode = () => useSyncExternalStore(subscribe, snapshot, () => 'none')

/** 브라우저의 설치 창을 띄운다 → 'accepted' | 'dismissed' */
export async function promptInstall() {
  if (!deferred) return 'dismissed'
  const event = deferred
  deferred = null // 한 번 쓴 이벤트는 다시 쓸 수 없다
  event.prompt()
  const { outcome } = await event.userChoice
  if (outcome === 'accepted') installed = true
  update()
  return outcome
}

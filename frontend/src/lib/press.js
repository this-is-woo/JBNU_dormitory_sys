// 누름 효과: 버튼 · 링크 · 목록 줄을 누르는 동안 살짝 눌리고, 떼면 통통 튀며 제자리로 돌아온다.
//   · 누르는 동안 요소에 data-pressed 를 붙인다 → 목록 줄의 "손가락 자리에서 번지는 빛"은 CSS(global.css 누름 효과)
//   · 크기 변화는 Web Animations 의 scale 로 한다: 요소마다 따로 정한 transform · transition 과 부딪히지 않는다
//   · 눌리는 정도는 크기에 맞춘다 (작은 아이콘 버튼은 크게, 넓은 줄은 아주 살짝). CSS 변수 --press-scale 로 바꿀 수 있다
//   · 휴대폰: 손가락을 대자마자 반응하지 않고 아주 잠깐 기다린다 (스크롤하려고 댄 손가락에 화면이 움찔하지 않게)
//   · 꾹 누르는 요소(data-longpress, 채팅 목록 · 말풍선)는 누르는 동안 천천히 눌리고, 메뉴가 뜨면 popPress 로 튀어 오른다
//   · "동작 줄이기"를 켠 사용자에게는 크기 변화 없이 빛만

/** 꾹 누르기로 보는 시간 (components/chat/useLongPress.js 와 같이 쓴다) */
export const LONG_PRESS_MS = 450

const SELECTOR =
  'button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"], [role="radio"], [role="checkbox"], [data-press]'
const TOUCH_DELAY = 45 // ms
const MIN_SHOWN = 150 // ms: 아주 짧게 톡 쳐도 눌린 모습이 보이게
const MOVE_TOLERANCE = 8 // px: 이보다 움직이면 누르기가 아니라 스크롤로 본다

const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)' // 살짝 넘쳤다가 돌아오는 곡선
const canScale = typeof CSS !== 'undefined' && CSS.supports?.('scale', '1')
const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false }
const moves = () => canScale && !reducedMotion.matches

let current = null // { el, pointerId, x, y, timer, shownAt, anim }

function pressScale(el) {
  const custom = parseFloat(getComputedStyle(el).getPropertyValue('--press-scale'))
  if (custom > 0) return custom
  const { width, height } = el.getBoundingClientRect()
  if (Math.max(width, height) <= 48) return 0.9 // 아이콘 버튼 · 점
  if (width < 220) return 0.95 // 보통 버튼 · 칩
  return 0.985 // 넓은 줄 · 카드
}

const scaleNow = (el) => {
  const s = parseFloat(getComputedStyle(el).scale)
  return Number.isFinite(s) ? s : 1
}

function show(c) {
  c.timer = null
  c.shownAt = performance.now()
  c.el.setAttribute('data-pressed', '')
  if (!moves()) return
  const long = c.el.hasAttribute('data-longpress')
  const to = long ? Math.min(pressScale(c.el), 0.97) : pressScale(c.el)
  if (to >= 1) return
  c.anim = c.el.animate([{ scale: String(scaleNow(c.el)) }, { scale: String(to) }], {
    // 꾹 누르기: 메뉴가 뜰 때까지 천천히 차오르듯 · 그냥 누르기: 바로
    duration: long ? LONG_PRESS_MS : 110,
    easing: long ? 'cubic-bezier(.3, 0, .5, 1)' : 'cubic-bezier(.2, 0, 0, 1)',
    fill: 'forwards',
  })
}

function settle(c, spring) {
  c.el.removeAttribute('data-pressed')
  if (!c.anim) return
  const from = scaleNow(c.el)
  c.anim.cancel()
  if (!moves() || from >= 1) return
  c.el.animate([{ scale: String(from) }, { scale: '1' }], {
    duration: spring ? 420 : 160,
    easing: spring ? SPRING : 'ease-out',
  })
}

/** 손을 뗐을 때(spring: 통통) · 스크롤로 바뀌었을 때(spring 없이 조용히) */
function release(spring) {
  const c = current
  if (!c) return
  current = null
  if (c.timer) {
    clearTimeout(c.timer)
    if (!spring) return // 눌린 모습을 보여 주기 전에 스크롤로 바뀌었다
    show(c) // 아주 짧은 탭: 잠깐이라도 눌린 모습을 보여 준다
  }
  const wait = Math.max(0, MIN_SHOWN - (performance.now() - c.shownAt))
  if (wait) setTimeout(() => settle(c, spring), wait)
  else settle(c, spring)
}

/** 꾹 누르기가 성공했을 때: 차오르던 눌림을 멈추고 톡 튀어 오른다 (메뉴가 뜨는 순간) */
export function popPress(el) {
  if (!el) return
  if (current?.el === el) {
    clearTimeout(current.timer)
    current = null
  }
  const from = scaleNow(el)
  el.getAnimations?.().forEach((a) => a.cancel())
  el.removeAttribute('data-pressed')
  if (!moves()) return
  el.animate([{ scale: String(from) }, { scale: '1.025' }, { scale: '1' }], {
    duration: 380,
    easing: 'cubic-bezier(.2, .8, .2, 1)',
  })
}

function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null
  release(false)
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[data-press="off"]')) return
  // 빛이 번지기 시작하는 자리 (손가락이 닿은 곳)
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--press-x', `${Math.round(e.clientX - rect.left)}px`)
  el.style.setProperty('--press-y', `${Math.round(e.clientY - rect.top)}px`)
  const c = { el, pointerId: e.pointerId, x: e.clientX, y: e.clientY, timer: null, shownAt: 0, anim: null }
  current = c
  if (e.pointerType === 'mouse') show(c)
  else c.timer = setTimeout(() => show(c), TOUCH_DELAY)
}

function onMove(e) {
  if (!current || e.pointerId !== current.pointerId) return
  if (Math.hypot(e.clientX - current.x, e.clientY - current.y) > MOVE_TOLERANCE) release(false)
}

if (typeof document !== 'undefined') {
  const opts = { capture: true, passive: true }
  document.addEventListener('pointerdown', onDown, opts)
  document.addEventListener('pointermove', onMove, opts)
  document.addEventListener('pointerup', () => release(true), opts)
  document.addEventListener('pointercancel', () => release(false), opts)
  document.addEventListener('scroll', () => release(false), opts)
  window.addEventListener('blur', () => release(false))
}

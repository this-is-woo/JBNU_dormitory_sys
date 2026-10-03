import { useSyncExternalStore } from 'react'

// 이 기기의 화면 설정 (내 정보 > 설정). 로그인과 상관없이 이 브라우저에 저장한다.
//   theme:  'system'(휴대폰 설정 따라) · 'light' · 'dark'  → <html data-theme="light|dark">
//   motion: 'system' · 'reduce'(애니메이션 줄이기)          → <html data-motion="reduce">
//   haptics: true · false (꾹 누를 때 진동)
// 페이지가 그려지기 전에 index.html 의 작은 스크립트가 같은 값을 먼저 붙인다 (다크 모드에서 흰 화면이 번쩍이지 않게).
const KEY = 'jbnu-dorm:preferences'
const DEFAULTS = { theme: 'system', motion: 'system', haptics: true }

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

let current = read()
const listeners = new Set()

function apply(prefs) {
  // 화면 설정을 붙이다 문제가 생겨도 앱은 그대로 뜨게 한다 (설정만 안 먹을 뿐)
  try {
    applyUnsafe(prefs)
  } catch (err) {
    console.warn('[preferences] 화면 설정을 적용하지 못했습니다.', err)
  }
}

function applyUnsafe(prefs) {
  const root = document.documentElement
  if (prefs.theme === 'light' || prefs.theme === 'dark') root.dataset.theme = prefs.theme
  else delete root.dataset.theme
  if (prefs.motion === 'reduce') root.dataset.motion = 'reduce'
  else delete root.dataset.motion
  // 주소창 · 상태 표시줄 색도 화면에 맞춘다
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDarkTheme() ? '#1e1f22' : '#ffffff')
}

if (typeof document !== 'undefined') {
  apply(current)
  try {
    // 휴대폰의 다크 모드를 바꾸면 (테마가 '휴대폰 설정 따라'일 때) 다시 맞춘다
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      apply(current)
      listeners.forEach((fn) => fn())
    })
    // 다른 탭에서 바꾼 설정도 반영
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return
      current = read()
      apply(current)
      listeners.forEach((fn) => fn())
    })
  } catch {
    // 바뀐 설정을 바로 따라가지 못할 뿐, 앱은 그대로 뜬다
  }
}

/** 설정 하나를 바꾼다 (바로 화면에 반영되고 이 기기에 저장된다) */
export function setPreference(key, value) {
  current = { ...current, [key]: value }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // 저장하지 못하면 이번 방문 동안만 적용된다
  }
  apply(current)
  listeners.forEach((fn) => fn())
}

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 지금 설정 { theme, motion, haptics } (바뀌면 다시 그린다) */
export const usePreferences = () => useSyncExternalStore(subscribe, () => current, () => DEFAULTS)

/** 화면이 지금 다크 모드인지 (설정 + 휴대폰 설정) */
export function isDarkTheme() {
  if (current.theme === 'dark') return true
  if (current.theme === 'light') return false
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

/** 다크 모드가 바뀔 때 알려 준다 (구글 로그인 버튼처럼 직접 색을 골라 그리는 곳). 해제 함수를 돌려준다 */
export const onThemeChange = (fn) => subscribe(fn)

/** 애니메이션을 줄여야 하는지 (설정 또는 휴대폰의 '동작 줄이기') */
export function reducedMotion() {
  if (current.motion === 'reduce') return true
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/** 꾹 누를 때 진동 (설정에서 끌 수 있다. 진동을 지원하지 않는 기기에서는 아무 일도 없다) */
export function vibrate(ms = 10) {
  if (current.haptics) navigator.vibrate?.(ms)
}

/** 이 기기가 진동을 지원하는지 (아이폰 사파리는 지원하지 않는다) */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

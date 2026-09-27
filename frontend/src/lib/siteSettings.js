import { useSyncExternalStore } from 'react'
import { isSupabaseConfigured } from '../config.js'

// 사이트 설정 (supabase/migrations/20261013000000_site_settings.sql)
// 관리자 페이지 [설정] 탭에서 바꾸고, 헤더·모바일 메뉴·후원 페이지가 읽는다.
// 서버 값을 받기 전에는 이 브라우저가 마지막으로 본 값을 쓴다 (메뉴가 깜빡이지 않게).
// 읽지 못하면(마이그레이션 전·네트워크 오류) 기본값: 후원 켜짐.
const CACHE_KEY = 'jbnu-dorm:site-settings'
const DEFAULTS = { supportEnabled: true }

function readCache() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CACHE_KEY)) }
  } catch {
    return DEFAULTS
  }
}

let settings = readCache()
let loaded = null
const listeners = new Set()

function set(next) {
  settings = { ...settings, ...next }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings))
  } catch {
    // 저장하지 못하면 다음 방문 때 기본값부터 시작할 뿐이다
  }
  listeners.forEach((fn) => fn())
}

/** 서버에서 한 번 불러온다 (데모: 이 브라우저에 저장된 값이 곧 설정) */
function load() {
  if (loaded || !isSupabaseConfigured) return
  loaded = import('./supabase.js')
    .then(({ supabase }) => supabase.from('site_settings').select('key, value'))
    .then(({ data, error }) => {
      if (error) throw error
      const support = data?.find((r) => r.key === 'support_enabled')
      if (typeof support?.value === 'boolean') set({ supportEnabled: support.value })
    })
    .catch((err) => console.warn('[supabase] 사이트 설정을 불러오지 못했습니다.', err))
}

function subscribe(fn) {
  load()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useSiteSettings() {
  return useSyncExternalStore(subscribe, () => settings)
}

/** 관리자 페이지에서 바꾼 뒤 화면에 바로 반영 */
export function applySiteSettings(next) {
  set(next)
}

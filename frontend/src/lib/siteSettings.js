import { useSyncExternalStore } from 'react'
import { isSupabaseConfigured } from '../config.js'
import { currentSemester, nextSemester } from './semester.js'

// 사이트 설정 (supabase/migrations/20261013000000_site_settings.sql, 20261016000000_roommate_recruit_semester.sql)
// 관리자 페이지 [설정] 탭에서 바꾸고, 헤더·모바일 메뉴·후원 페이지·룸메이트 찾기가 읽는다.
// 서버 값을 받기 전에는 이 브라우저가 마지막으로 본 값을 쓴다 (메뉴가 깜빡이지 않게).
// 읽지 못하면(마이그레이션 전·네트워크 오류) 기본값: 후원 켜짐, 룸메이트 모집 학기는 다음 학기.
const CACHE_KEY = 'jbnu-dorm:site-settings'
const SEMESTER_RE = /^20\d{2}-[12]$/
const DEFAULTS = { supportEnabled: true, roommateSemester: nextSemester(currentSemester()) }

function readCache() {
  try {
    const cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CACHE_KEY)) }
    if (!SEMESTER_RE.test(cached.roommateSemester)) cached.roommateSemester = DEFAULTS.roommateSemester
    return cached
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
      const value = (key) => data?.find((r) => r.key === key)?.value
      const next = {}
      if (typeof value('support_enabled') === 'boolean') next.supportEnabled = value('support_enabled')
      if (SEMESTER_RE.test(value('roommate_semester'))) next.roommateSemester = value('roommate_semester')
      set(next)
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

/** 지금 룸메이트를 모집하는 학기 ('YYYY-1' | 'YYYY-2'). 훅을 쓸 수 없는 곳(데이터 함수)에서 */
export const roommateSemester = () => settings.roommateSemester

/** 관리자 페이지에서 바꾼 뒤 화면에 바로 반영 */
export function applySiteSettings(next) {
  set(next)
}

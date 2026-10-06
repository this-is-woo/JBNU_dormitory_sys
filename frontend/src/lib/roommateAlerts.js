import { isSupabaseConfigured } from '../config.js'

// 맞춤 룸메 알림 (supabase/migrations/20261030000000_roommate_alerts.sql)
//   나와 체크리스트가 min_match 개 이상 맞는 새 글이 올라오면 휴대폰 알림으로 알려 준다.
//   설정 줄이 있으면 켜진 것. 실제 알림은 DB 트리거 → Edge Function(send-chat-push) → 이 기기의 채팅 알림 구독으로 간다.
// Supabase 미연결(데모)이면 이 브라우저에만 저장한다 (알림은 가지 않는다).

const LOCAL_KEY = 'jbnu-dorm:roommate-alerts' // { [userId]: { minMatch, dormitory } }

/** 몇 개 이상 맞을 때 알릴지 (체크리스트 15개 중) */
export const ALERT_THRESHOLDS = [8, 10, 12]
export const DEFAULT_THRESHOLD = 10

const fromRow = (row) => ({ minMatch: row.min_match, dormitory: row.dormitory_code ?? null })

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeLocal(all) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
  } catch {
    // 저장소를 쓸 수 없으면 새로고침하면 사라진다
  }
}

async function client() {
  const { supabase } = await import('./supabase.js')
  return supabase
}

// 이번 방문 동안 받아 둔 설정 (페이지를 옮겨도 다시 기다리지 않게)
const memory = new Map() // userId → setting | null
export const cachedRoommateAlert = (userId) => (userId ? memory.get(userId) : undefined)

/** 내 맞춤 알림 설정. 꺼져 있으면 null */
export async function fetchRoommateAlert(userId) {
  if (!isSupabaseConfigured) return readLocal()[userId] ?? null
  const supabase = await client()
  const { data, error } = await supabase.from('roommate_alerts').select('min_match, dormitory_code').maybeSingle()
  if (error) throw new Error('맞춤 알림 설정을 불러오지 못했어요.')
  const setting = data ? fromRow(data) : null
  memory.set(userId, setting)
  return setting
}

/** 켜기 · 바꾸기 */
export async function saveRoommateAlert(userId, { minMatch, dormitory }) {
  if (!isSupabaseConfigured) {
    const saved = { minMatch, dormitory: dormitory ?? null }
    writeLocal({ ...readLocal(), [userId]: saved })
    return saved
  }
  const supabase = await client()
  const { data, error } = await supabase
    .from('roommate_alerts')
    .upsert({ min_match: minMatch, dormitory_code: dormitory ?? null }, { onConflict: 'user_id' })
    .select('min_match, dormitory_code')
    .single()
  if (error) throw new Error('맞춤 알림을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
  const saved = fromRow(data)
  memory.set(userId, saved)
  return saved
}

/** 끄기 */
export async function deleteRoommateAlert(userId) {
  if (!isSupabaseConfigured) {
    const all = readLocal()
    delete all[userId]
    writeLocal(all)
    return
  }
  const supabase = await client()
  const { error } = await supabase.from('roommate_alerts').delete().eq('user_id', userId)
  if (error) throw new Error('맞춤 알림을 끄지 못했어요. 잠시 후 다시 시도해 주세요.')
  memory.set(userId, null)
}

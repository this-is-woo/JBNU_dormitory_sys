import { isSupabaseConfigured } from '../config.js'
import { uid } from './uid.js'

// 환산점수 계산 기록 (supabase/migrations/20260929000000_score_submissions.sql, 성별은 20261012000000)
// 단과대학·성별·학점·거리점수·환산점수만 익명으로 저장한다. 같은 값은 탭을 닫기 전까지 한 번만 보낸다.
// Supabase 미연결(데모)일 때는 관리자 페이지에서 확인할 수 있게 이 브라우저에만 남긴다.
const SENT_KEY = 'jbnu-dorm:score-submissions-sent'
export const LOCAL_SCORES_KEY = 'jbnu-dorm:score-submissions'
const LOCAL_LIMIT = 500
// 성별 열을 만드는 마이그레이션보다 화면이 먼저 배포된 경우: 열이 없거나(PGRST204) 쓸 권한이 없다(42501)
const WITHOUT_GENDER_CODES = new Set(['PGRST204', '42501'])

function readSent() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SENT_KEY)) ?? [])
  } catch {
    return new Set()
  }
}

function markSent(sent, key) {
  sent.add(key)
  try {
    sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-50)))
  } catch {
    // 저장하지 못하면 새로고침 뒤 같은 값이 한 번 더 기록될 수 있다
  }
}

/** 데모: 이 브라우저에 남긴 기록 (최신순, DB 행과 같은 모양) */
export function readLocalScores() {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY))
    return Array.isArray(list) ? list.filter((s) => s && !Number.isNaN(Date.parse(s.created_at))) : []
  } catch {
    return []
  }
}

function saveLocally(row) {
  try {
    const entry = { id: uid(), created_at: new Date().toISOString(), ...row }
    localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify([entry, ...readLocalScores()].slice(0, LOCAL_LIMIT)))
  } catch {
    // 저장소를 쓸 수 없으면 기록만 생략된다
  }
}

/**
 * 계산된 환산점수를 기록한다. 실패해도 화면에는 영향을 주지 않는다.
 * @param {{ collegeCode: string, gender: '남'|'여', gpa: number, distanceScore: number, convertedScore: number }} score
 */
export async function recordScore({ collegeCode, gender, gpa, distanceScore, convertedScore }) {
  const key = [collegeCode, gender, gpa, distanceScore, convertedScore].join('|')
  const sent = readSent()
  if (sent.has(key)) return
  markSent(sent, key)
  const row = { college_code: collegeCode, gender, gpa, distance_score: distanceScore, converted_score: convertedScore }
  if (!isSupabaseConfigured) return saveLocally(row)
  try {
    const { supabase } = await import('./supabase.js')
    const insert = (values) => supabase.from('score_submissions').insert(values)
    let { error } = await insert(row)
    if (error && WITHOUT_GENDER_CODES.has(error.code)) {
      const { gender: _omit, ...withoutGender } = row
      error = (await insert(withoutGender)).error
    }
    if (error) throw error
  } catch (err) {
    console.warn('[supabase] 환산점수 기록을 저장하지 못했습니다.', err)
  }
}

import { isSupabaseConfigured } from '../config.js'

// 환산점수 계산 기록 (supabase/migrations/20260929000000_score_submissions.sql)
// 단과대학·학점·거리점수·환산점수만 익명으로 저장한다. 같은 값은 탭을 닫기 전까지 한 번만 보낸다.
const SENT_KEY = 'jbnu-dorm:score-submissions-sent'

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

/**
 * 계산된 환산점수를 기록한다. 실패해도 화면에는 영향을 주지 않는다.
 * @param {{ collegeCode: string, gpa: number, distanceScore: number, convertedScore: number }} score
 */
export async function recordScore({ collegeCode, gpa, distanceScore, convertedScore }) {
  if (!isSupabaseConfigured) return
  const key = [collegeCode, gpa, distanceScore, convertedScore].join('|')
  const sent = readSent()
  if (sent.has(key)) return
  markSent(sent, key)
  try {
    const { supabase } = await import('./supabase.js')
    const { error } = await supabase.from('score_submissions').insert({
      college_code: collegeCode,
      gpa,
      distance_score: distanceScore,
      converted_score: convertedScore,
    })
    if (error) throw error
  } catch (err) {
    console.warn('[supabase] 환산점수 기록을 저장하지 못했습니다.', err)
  }
}

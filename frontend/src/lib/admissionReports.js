import { isSupabaseConfigured } from '../config.js'
import { uid } from './uid.js'

// 합격 결과 제보 (supabase/migrations/20260930000000_admission_reports.sql, 1학년 거리점수는 20261017000000)
// 로그인한 본인 제보만 읽고 쓸 수 있다 (RLS). Supabase 미연결 시에는 이 브라우저에만 저장 (데모 계정).
const LOCAL_KEY = 'jbnu-dorm:admission-reports'

// user_id 는 열 권한이 없어 조회하지 않는다. 본인 행만 보이는 것은 RLS 가 보장한다.
const COLUMNS =
  'id, created_at, updated_at, semester, applied_room, result, assigned_dormitory, converted_score, distance_score, gender, college_code, grade'

const fromRow = (row) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  semester: row.semester,
  appliedRoom: row.applied_room,
  result: row.result,
  assignedDormitory: row.assigned_dormitory,
  // 1학년 제보는 환산점수 대신 거리점수 (없는 쪽은 null)
  convertedScore: row.converted_score == null ? null : Number(row.converted_score),
  distanceScore: row.distance_score == null ? null : Number(row.distance_score),
  gender: row.gender,
  collegeCode: row.college_code,
  grade: row.grade,
})

const toRow = (r) => ({
  semester: r.semester,
  applied_room: r.appliedRoom,
  result: r.result,
  assigned_dormitory: r.assignedDormitory,
  converted_score: r.convertedScore,
  distance_score: r.distanceScore,
  gender: r.gender,
  college_code: r.collegeCode,
  grade: r.grade,
})

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) ?? []
  } catch {
    return []
  }
}

function writeLocal(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch {
    // 저장소를 쓸 수 없으면 새로고침하면 사라진다
  }
}

async function client() {
  const { supabase } = await import('./supabase.js')
  return supabase
}

const DUPLICATE = '23505' // unique (user_id, semester)

/** 내 제보 (최신 학기부터) */
export async function fetchMyReports(userId) {
  if (!isSupabaseConfigured) {
    return readLocal()
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.semester.localeCompare(a.semester))
  }
  const supabase = await client()
  const { data, error } = await supabase.from('admission_reports').select(COLUMNS).order('semester', { ascending: false })
  if (error) throw new Error('내 제보를 불러오지 못했어요.')
  return data.map(fromRow)
}

/** id 가 있으면 수정, 없으면 새로 등록 */
export async function saveReport(report, userId, id = null) {
  if (!isSupabaseConfigured) {
    const list = readLocal()
    if (list.some((r) => r.userId === userId && r.semester === report.semester && r.id !== id)) {
      throw new Error('이 학기에는 이미 제보했어요. 목록에서 수정해 주세요.')
    }
    const now = new Date().toISOString()
    const saved = id
      ? { ...list.find((r) => r.id === id), ...report, updatedAt: now }
      : { ...report, id: uid(), userId, createdAt: now, updatedAt: null }
    writeLocal(id ? list.map((r) => (r.id === id ? saved : r)) : [saved, ...list])
    return saved
  }
  const supabase = await client()
  const query = id
    ? supabase.from('admission_reports').update(toRow(report)).eq('id', id)
    : supabase.from('admission_reports').insert(toRow(report))
  const { data, error } = await query.select(COLUMNS).single()
  if (error?.code === DUPLICATE) throw new Error('이 학기에는 이미 제보했어요. 목록에서 수정해 주세요.')
  if (error) throw new Error('제보를 저장하지 못했어요. 입력값을 확인해 주세요.')
  return fromRow(data)
}

export async function deleteReport(id, userId) {
  if (!isSupabaseConfigured) {
    writeLocal(readLocal().filter((r) => !(r.id === id && r.userId === userId)))
    return
  }
  const supabase = await client()
  const { data, error } = await supabase.from('admission_reports').delete().eq('id', id).select('id')
  if (error || !data.length) throw new Error('제보를 삭제하지 못했어요.')
}

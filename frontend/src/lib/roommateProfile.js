import { isSupabaseConfigured } from '../config.js'

// 내 정보(프로필): 기본 정보 + 룸메이트 체크리스트 (supabase/migrations/20261002000000_roommate_profiles.sql)
// 등록해야 게시판을 볼 수 있고, 글을 쓰면 이 값이 게시글에 그대로 들어간다.
// Supabase 미연결 시에는 이 브라우저에만 저장한다 (데모 계정).
const LOCAL_KEY = 'jbnu-dorm:roommate-profiles' // { [userId]: profile }
const LOCAL_POSTS_KEY = 'jbnu-dorm:roommate-posts'

const COLUMNS = 'dormitory_code, room_type, gender, age, college_code, mbti, checklist, updated_at'

const fromRow = (row) => ({
  dormitory: row.dormitory_code,
  roomType: row.room_type ?? null, // 1인실 · 2인실 · 4인실 (예전에 등록한 정보는 비어 있을 수 있다)
  gender: row.gender,
  age: row.age,
  collegeCode: row.college_code,
  mbti: row.mbti,
  checklist: row.checklist ?? {},
  updatedAt: row.updated_at,
})

const toRow = (p) => ({
  dormitory_code: p.dormitory,
  room_type: p.roomType ?? null,
  gender: p.gender,
  age: p.age,
  college_code: p.collegeCode,
  mbti: p.mbti,
  checklist: p.checklist,
})

/** 게시글에 들어가는 프로필 값 */
export const profileFields = (p) => ({
  dormitory: p.dormitory,
  roomType: p.roomType ?? null,
  gender: p.gender,
  age: p.age,
  collegeCode: p.collegeCode,
  mbti: p.mbti,
  checklist: p.checklist,
})

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장소를 쓸 수 없으면 새로고침하면 사라진다
  }
}

async function client() {
  const { supabase } = await import('./supabase.js')
  return supabase
}

// 이번 방문 동안 받아 둔 내 정보 (페이지를 다시 열 때 기다리지 않고 바로 보여 주고, 뒤에서 새로 받는다)
const memory = new Map() // userId → profile | null

/** 받아 둔 내 정보. 아직 받은 적 없으면 undefined */
export const cachedProfile = (userId) => (userId ? memory.get(userId) : undefined)

/** 내 프로필. 없으면 null */
export async function fetchMyProfile(userId) {
  if (!isSupabaseConfigured) return readJson(LOCAL_KEY, {})[userId] ?? null
  const supabase = await client()
  const { data, error } = await supabase.from('roommate_profiles').select(COLUMNS).maybeSingle()
  if (error) throw new Error('내 정보를 불러오지 못했어요.')
  const profile = data ? fromRow(data) : null
  memory.set(userId, profile)
  return profile
}

/** 등록 또는 수정. 내가 쓴 글에도 반영된다 (Supabase 는 DB 트리거가 처리) */
export async function saveProfile(profile, userId, exists) {
  if (!isSupabaseConfigured) {
    const saved = { ...profileFields(profile), updatedAt: new Date().toISOString() }
    writeJson(LOCAL_KEY, { ...readJson(LOCAL_KEY, {}), [userId]: saved })
    writeJson(
      LOCAL_POSTS_KEY,
      readJson(LOCAL_POSTS_KEY, []).map((p) => (p.authorId === userId ? { ...p, ...profileFields(saved) } : p)),
    )
    return saved
  }
  const supabase = await client()
  const update = () => supabase.from('roommate_profiles').update(toRow(profile)).eq('user_id', userId).select(COLUMNS).single()
  let { data, error } = exists
    ? await update()
    : await supabase.from('roommate_profiles').insert(toRow(profile)).select(COLUMNS).single()
  // 다른 탭·기기에서 먼저 등록한 경우: 새로 만들지 말고 고친다
  if (error?.code === '23505') ({ data, error } = await update())
  if (error?.hint === 'dorm_gender') throw new Error('고른 호관은 다른 성별 전용이에요. 호관을 다시 골라 주세요.')
  if (error) throw new Error('내 정보를 저장하지 못했어요. 입력값을 확인해 주세요.')
  const saved = fromRow(data)
  memory.set(userId, saved)
  return saved
}

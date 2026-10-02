import { isSupabaseConfigured } from '../config.js'
import { matchCount } from '../components/roommates/postFormat.js'
import { isLocallySuspended } from './localModeration.js'
import { isLocallyBlocked, localRequestCount } from './roommateRequests.js'
import { roommateSemester } from './siteSettings.js'
import { uid } from './uid.js'

// 룸메이트 찾기는 구글 로그인한 사용자만 이용한다.
// 글쓰기·수정·삭제 권한은 roommate_posts.user_id = auth.uid() 인 행에만 주는 RLS 정책으로 지킨다.
// Supabase 가 연결되지 않았을 때는 이 브라우저의 localStorage 에만 저장한다 (데모 계정).
const LOCAL_POSTS_KEY = 'jbnu-dorm:roommate-posts'
const LOCAL_REQUESTS_KEY = 'jbnu-dorm:roommate-requests' // lib/roommateRequests.js

const COLUMNS =
  'id, created_at, updated_at, user_id, dormitory_code, room_type, gender, age, college_code, mbti, checklist, content, semester, is_closed, is_open, request_count'

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString()

// 화면 확인용 예시 글 (Supabase 미연결 상태에서 "예시" 표시와 함께 보이고, 잠긴 게시판의 흐린 미리보기로도 쓴다)
// 학기가 없는 글(예시 · 학기 기능 전에 저장한 로컬 글)은 지금 모집 학기 글로 본다
// prettier-ignore
const SAMPLES = [
  {
    id: 'sample-1',
    createdAt: hoursAgo(0.7),
    dormitory: 'daedong',
    roomType: '2인실',
    gender: '남',
    age: 22,
    collegeCode: 'engineering',
    mbti: 'ISTJ',
    checklist: {
      smoking: false, sleepHabit: ['없음'], deepSleeper: true, lateSnack: false,
      bedtime: '23-24시', wakeup: '7-8시', lampOff: '23-24시',
      roomCleaning: '일주일에 2-3번', bathroomCleaning: '일주일에 한 번', recycling: '분리수거함을 놓고 한 번에 버린다',
      relationship: '중간', phoneCalls: '짧은 전화만', sharing: '허락 맡고 가능', friendsOver: false, seat: '상관 없음',
    },
    content: '평일엔 7시에 일어나서 12시 전에 자요. 방은 깔끔하게 쓰는 편이고 통화는 밖에서 합니다. 서로 생활 패턴만 존중하면 좋겠어요!',
    isSample: true,
  },
  {
    id: 'sample-2',
    createdAt: hoursAgo(5),
    dormitory: 'changui',
    roomType: '1인실',
    gender: '여',
    age: 24,
    collegeCode: 'arts',
    mbti: 'ENFP',
    checklist: {
      smoking: false, sleepHabit: ['코골이', '잠꼬대'], deepSleeper: false, lateSnack: true,
      bedtime: '1시 이후', wakeup: '9-10시', lampOff: '24-1시',
      roomCleaning: '일주일에 한 번', bathroomCleaning: '일주일에 한 번', recycling: '생길 때마다 각자 치운다',
      relationship: '베스트 프렌드', phoneCalls: '상관 없음', sharing: '상관 없음', friendsOver: true, seat: '상관 없음',
    },
    content: '과제 때문에 새벽까지 깨어 있는 날이 많아요. 스탠드만 켜고 조용히 작업합니다. 같이 야식 먹을 룸메이트 환영해요 :)',
    isSample: true,
  },
  {
    id: 'sample-3',
    createdAt: hoursAgo(26),
    dormitory: 'hanbit',
    roomType: '4인실',
    gender: '남',
    age: 20,
    collegeCode: 'business',
    mbti: null,
    checklist: {
      smoking: false, sleepHabit: ['이갈이'], deepSleeper: true, lateSnack: false,
      bedtime: '22-23시', wakeup: '6시 이전', lampOff: '23시 이전',
      roomCleaning: '매일', bathroomCleaning: '일주일에 2-3번', recycling: '생길 때마다 각자 치운다',
      relationship: '비즈니스', phoneCalls: '무조건 밖에서', sharing: '절대 안 돼', friendsOver: false, seat: '문과 마주보지 않는, 에어컨 직방 자리',
    },
    content: '아침 운동하고 수업 가요. 코골이가 조금 있어서 귀마개 쓰시는 분이면 좋겠습니다.',
    isClosed: true,
    isSample: true,
  },
]

// 예시 글의 글쓴이 id 는 `${id}-author` (데모에서 차단 기능을 확인할 수 있도록)
export const SAMPLE_POSTS = SAMPLES.map((p) => ({ ...p, authorId: `${p.id}-author` }))

const fromRow = (row) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  authorId: row.user_id,
  dormitory: row.dormitory_code,
  roomType: row.room_type ?? null,
  gender: row.gender,
  age: row.age,
  collegeCode: row.college_code,
  mbti: row.mbti,
  checklist: row.checklist ?? {},
  content: row.content,
  semester: row.semester,
  isClosed: row.is_closed,
  isOpen: row.is_open !== false, // false 면 운영자가 숨긴 글 (글쓴이에게만 보인다)
  requestCount: row.request_count ?? 0,
})

const toRow = (post) => ({
  dormitory_code: post.dormitory,
  room_type: post.roomType ?? null,
  gender: post.gender,
  age: post.age,
  college_code: post.collegeCode,
  mbti: post.mbti,
  checklist: post.checklist,
  content: post.content,
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
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 새로고침하면 사라진다
  }
}

const readLocal = () => readJson(LOCAL_POSTS_KEY, [])

function updateLocal(id, userId, patch) {
  const posts = readLocal()
  const target = posts.find((p) => p.id === id)
  if (!target || target.authorId !== userId) throw new Error('내가 쓴 글만 바꿀 수 있어요.')
  // 학기는 글을 고쳐도 그대로 (DB 트리거와 같게)
  const next = { ...target, ...patch, semester: target.semester, updatedAt: new Date().toISOString() }
  writeJson(
    LOCAL_POSTS_KEY,
    posts.map((p) => (p.id === id ? next : p)),
  )
  return next
}

async function client() {
  const { supabase } = await import('./supabase.js')
  return supabase
}

// 글쓰기·수정 오류를 알아들을 수 있는 말로 (DB 의 트리거·정책이 막은 이유)
function postError(error, fallback) {
  if (error?.hint === 'dorm_gender') return new Error('고른 호관은 다른 성별 전용이에요. 내 정보에서 호관을 다시 골라 주세요.')
  // 행 수준 보안 정책 위반: 글쓴이 본인인데 막혔다면 이용 정지 때문이다
  if (error?.code === '42501') return new Error('이용이 정지된 계정이라 글을 쓰거나 고칠 수 없어요.')
  return new Error(fallback)
}

export const roommateStorage = isSupabaseConfigured ? 'supabase' : 'local'

export const PAGE_SIZE = 12

// 목록 정렬. 모든 정렬에서 모집 중인 글이 먼저 온다
//   newest: 최신 순 · match: 내 정보와 일치 많은 순 (DB 함수 list_roommate_posts_by_match) · fewest: 받은 신청 적은 순
export const SORTS = [
  { value: 'newest', label: '최신 순' },
  { value: 'match', label: '일치 많은 순' },
  { value: 'fewest', label: '신청 적은 순' },
]

// 모집 중인 글 먼저, 그다음 최신순
const byOpenThenNewest = (a, b) =>
  Number(Boolean(a.isClosed)) - Number(Boolean(b.isClosed)) || b.createdAt.localeCompare(a.createdAt)

// 로컬 모드 정렬 (DB 와 같은 순서)
function localSorter(sort, userId, myChecklist) {
  if (sort === 'fewest') {
    return (a, b) =>
      Number(Boolean(a.isClosed)) - Number(Boolean(b.isClosed)) ||
      a.requestCount - b.requestCount ||
      b.createdAt.localeCompare(a.createdAt)
  }
  if (sort === 'match') {
    const score = (p) => (p.authorId === userId ? -1 : (matchCount(myChecklist, p.checklist) ?? 0))
    return (a, b) =>
      Number(Boolean(a.isClosed)) - Number(Boolean(b.isClosed)) || score(b) - score(a) || b.createdAt.localeCompare(a.createdAt)
  }
  return byOpenThenNewest
}

/**
 * 게시글 목록의 한 구간 (무한 스크롤). 필터와 구간 자르기를 DB 에서 처리해 필요한 글만 받아온다 (Supabase 전송량 절약).
 * @param {{ offset?: number, limit?: number, sort?: string, semester?: string|null, dormitory?: string|null, gender?: string|null, userId?: string, myChecklist?: object }} options
 *   offset 번째 글부터 limit 개. sort 는 SORTS 의 value.
 *   userId · myChecklist 는 로컬 모드에서만 쓴다 (차단한 사이 숨기기 · 일치 수 계산. Supabase 에서는 DB 가 한다)
 * @returns {Promise<{ items: object[], total: number }>}
 */
export async function fetchRoommatePosts({
  offset = 0,
  limit = PAGE_SIZE,
  sort = 'newest',
  semester = null,
  dormitory = null,
  gender = null,
  userId = null,
  myChecklist = null,
} = {}) {
  const from = Math.max(0, offset)
  const size = Math.max(1, limit)
  if (!isSupabaseConfigured) {
    const all = [...readLocal(), ...SAMPLE_POSTS]
      .map((p) => ({ ...p, semester: p.semester ?? roommateSemester() }))
      .filter(
        (p) =>
          (!semester || p.semester === semester) &&
          (!dormitory || p.dormitory === dormitory) &&
          (!gender || p.gender === gender) &&
          !isLocallyBlocked(userId, p.authorId) &&
          // 운영자가 숨긴 글 · 정지된 사용자의 글은 글쓴이 본인에게만 (DB 정책과 같게)
          (p.authorId === userId || (p.isOpen !== false && !isLocallySuspended(p.authorId))),
      )
      .map((p) => ({ ...p, requestCount: localRequestCount(p.id) }))
      .sort(localSorter(sort, userId, myChecklist))
    return { items: all.slice(from, from + size), total: all.length }
  }
  const supabase = await client()
  if (sort === 'match') {
    const { data, error } = await supabase.rpc('list_roommate_posts_by_match', {
      p_semester: semester,
      p_dormitory: dormitory,
      p_gender: gender,
      p_offset: from,
      p_limit: size,
    })
    if (error) throw new Error('게시글을 불러오지 못했어요.')
    return { items: data.map(fromRow), total: data.length ? Number(data[0].total_count) : from }
  }
  let query = supabase.from('roommate_posts').select(COLUMNS, { count: 'exact' })
  if (semester) query = query.eq('semester', semester)
  if (dormitory) query = query.eq('dormitory_code', dormitory)
  if (gender) query = query.eq('gender', gender)
  query = query.order('is_closed', { ascending: true })
  if (sort === 'fewest') query = query.order('request_count', { ascending: true })
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, from + size - 1)
  // 그사이 글이 지워져 목록 끝을 넘어선 경우: 더 불러올 글이 없는 것으로 본다
  if (error?.code === 'PGRST103') return { items: [], total: from }
  if (error) throw new Error('게시글을 불러오지 못했어요.')
  return { items: data.map(fromRow), total: count ?? data.length }
}

/**
 * 글이 있는 학기와 글 수 (지난 학기 글 보기의 학기 목록). 최신 학기부터 → [{ semester, count }]
 * DB 함수 roommate_post_semesters (게시글 읽기 정책이 그대로 적용된다)
 */
export async function fetchPostSemesters(userId = null) {
  if (!isSupabaseConfigured) {
    const counts = new Map()
    for (const p of [...readLocal(), ...SAMPLE_POSTS]) {
      if (isLocallyBlocked(userId, p.authorId)) continue
      if (p.authorId !== userId && (p.isOpen === false || isLocallySuspended(p.authorId))) continue
      const semester = p.semester ?? roommateSemester()
      counts.set(semester, (counts.get(semester) ?? 0) + 1)
    }
    return [...counts].map(([semester, count]) => ({ semester, count })).sort((a, b) => b.semester.localeCompare(a.semester))
  }
  const supabase = await client()
  const { data, error } = await supabase.rpc('roommate_post_semesters')
  if (error) throw new Error('학기 목록을 불러오지 못했어요.')
  return data.map((r) => ({ semester: r.semester, count: Number(r.post_count) }))
}

/** 글 하나 (없거나 볼 수 없으면 null). 채팅 대화방의 [게시물 바로가기] */
export async function fetchRoommatePost(id, userId = null) {
  if (!isSupabaseConfigured) {
    const post = [...readLocal(), ...SAMPLE_POSTS].find((p) => p.id === id)
    if (!post) return null
    const hidden = post.isOpen === false || isLocallySuspended(post.authorId) || isLocallyBlocked(userId, post.authorId)
    if (post.authorId !== userId && hidden) return null
    return { ...post, semester: post.semester ?? roommateSemester(), requestCount: localRequestCount(post.id) }
  }
  const supabase = await client()
  // 볼 수 없는 글(차단·정지·숨김)은 게시글 읽기 정책(RLS)이 0행으로 돌려준다
  const { data, error } = await supabase.from('roommate_posts').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) return null
  return data ? fromRow(data) : null
}

/** 로그인한 계정으로 쓴 글 */
export async function fetchMyPosts(userId) {
  if (!isSupabaseConfigured) {
    return readLocal()
      .filter((p) => p.authorId === userId)
      .map((p) => ({ ...p, requestCount: localRequestCount(p.id) }))
  }
  const supabase = await client()
  const { data, error } = await supabase
    .from('roommate_posts')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error('내가 쓴 글을 불러오지 못했어요.')
  return data.map(fromRow)
}

export async function createRoommatePost(post, userId) {
  if (!isSupabaseConfigured) {
    // 학기는 DB 처럼 지금 모집 학기로 (고를 수 없다)
    const saved = { ...post, semester: roommateSemester(), id: uid(), createdAt: new Date().toISOString(), authorId: userId, isClosed: false }
    writeJson(LOCAL_POSTS_KEY, [saved, ...readLocal()])
    return saved
  }
  const supabase = await client()
  // user_id 는 DB 기본값 auth.uid() 로 채워진다. 학기는 DB 트리거가 모집 학기로 채운다
  // (마이그레이션 20261016 전에도 맞게 올라가도록 이 화면이 아는 모집 학기도 함께 보낸다)
  const { data, error } = await supabase
    .from('roommate_posts')
    .insert({ ...toRow(post), semester: roommateSemester() })
    .select(COLUMNS)
    .single()
  if (error) throw postError(error, '글을 등록하지 못했어요. 입력값을 확인해 주세요.')
  return fromRow(data)
}

export async function updateRoommatePost(id, post, userId) {
  if (!isSupabaseConfigured) return updateLocal(id, userId, post)
  const supabase = await client()
  const { data, error } = await supabase.from('roommate_posts').update(toRow(post)).eq('id', id).select(COLUMNS).single()
  if (error) throw postError(error, '글을 수정하지 못했어요.')
  return fromRow(data)
}

/** 모집완료 표시(closed=true) / 다시 모집(closed=false) */
export async function setRoommatePostClosed(id, closed, userId) {
  if (!isSupabaseConfigured) return updateLocal(id, userId, { isClosed: closed })
  const supabase = await client()
  const { data, error } = await supabase
    .from('roommate_posts')
    .update({ is_closed: closed })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw postError(error, '모집 상태를 바꾸지 못했어요.')
  return fromRow(data)
}

/**
 * 데모: 글을 지워도 그 글로 시작된 채팅은 남긴다 (DB 의 roommate_posts_snapshot_chats 트리거와 같은 일).
 * 대화방에 보여 줄 글 정보와 글쓴이를 신청에 남기고 글과의 연결만 끊는다.
 */
export function detachLocalChats(post) {
  const requests = readJson(LOCAL_REQUESTS_KEY, [])
  if (!requests.some((r) => r.postId === post.id)) return
  const snapshot = {
    dormitory: post.dormitory,
    semester: post.semester,
    gender: post.gender,
    age: post.age,
    collegeCode: post.collegeCode,
    mbti: post.mbti ?? null,
    checklist: post.checklist ?? {},
    isClosed: Boolean(post.isClosed),
  }
  writeJson(
    LOCAL_REQUESTS_KEY,
    requests.map((r) => (r.postId === post.id ? { ...r, post: snapshot, authorId: post.authorId, postDeleted: true } : r)),
  )
}

export async function deleteRoommatePost(id, userId) {
  if (!isSupabaseConfigured) {
    const posts = readLocal()
    const post = posts.find((p) => p.id === id)
    if (post?.authorId !== userId) throw new Error('내가 쓴 글만 삭제할 수 있어요.')
    writeJson(
      LOCAL_POSTS_KEY,
      posts.filter((p) => p.id !== id),
    )
    detachLocalChats(post)
    return
  }
  const supabase = await client()
  // RLS 때문에 남의 글은 지워지지 않고 0행이 돌아온다
  const { data, error } = await supabase.from('roommate_posts').delete().eq('id', id).select('id')
  if (error || !data.length) throw new Error('글을 삭제하지 못했어요.')
}

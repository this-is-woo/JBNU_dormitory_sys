import { isSupabaseConfigured } from '../config.js'

// 룸메이트 찾기는 구글 로그인한 사용자만 이용한다.
// 글쓰기·수정·삭제 권한은 roommate_posts.user_id = auth.uid() 인 행에만 주는 RLS 정책으로 지킨다.
// Supabase 가 연결되지 않았을 때는 이 브라우저의 localStorage 에만 저장한다 (데모 계정).
const LOCAL_POSTS_KEY = 'jbnu-dorm:roommate-posts'

const COLUMNS =
  'id, created_at, updated_at, user_id, dormitory_code, gender, age, college_code, mbti, checklist, content, contact, is_closed'

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString()

// 화면 확인용 예시 글 (Supabase 미연결 상태에서만 보이며 "예시" 표시가 붙는다)
// prettier-ignore
const SAMPLE_POSTS = [
  {
    id: 'sample-1',
    createdAt: hoursAgo(0.7),
    dormitory: 'saebit',
    gender: '남',
    age: 22,
    collegeCode: 'engineering',
    mbti: 'ISTJ',
    checklist: {
      smoking: false, sleepHabit: false, deepSleeper: true, mealPlan: true, lateSnack: false, earphones: true,
      bedtime: '11-12시', wakeup: '7-8시', lampOff: '11-12시',
      roomCleaning: '일주일에 2-3번', bathroomCleaning: '일주일에 한 번', sharedTrash: true, recycling: '분리수거함을 놓고 한 번에 버린다',
      relationship: '중간', phoneCalls: '짧은 전화만', sharing: '허락 맡고 가능', friendsOver: false, seat: '상관 없음',
    },
    content: '평일엔 7시에 일어나서 12시 전에 자요. 방은 깔끔하게 쓰는 편이고 통화는 밖에서 합니다. 서로 생활 패턴만 존중하면 좋겠어요!',
    contact: 'https://open.kakao.com/o/example',
    isSample: true,
  },
  {
    id: 'sample-2',
    createdAt: hoursAgo(5),
    dormitory: 'changui',
    gender: '여',
    age: 24,
    collegeCode: 'arts',
    mbti: 'ENFP',
    checklist: {
      smoking: false, sleepHabit: true, deepSleeper: false, mealPlan: false, lateSnack: true, earphones: true,
      bedtime: '1시 이후', wakeup: '9-10시', lampOff: '12-1시',
      roomCleaning: '일주일에 한 번', bathroomCleaning: '일주일에 한 번', sharedTrash: true, recycling: '생길 때마다 각자 치운다',
      relationship: '베스트 프렌드', phoneCalls: '상관 없음', sharing: '상관 없음', friendsOver: true, seat: '상관 없음',
    },
    content: '과제 때문에 새벽까지 깨어 있는 날이 많아요. 스탠드만 켜고 조용히 작업합니다. 같이 야식 먹을 룸메이트 환영해요 :)',
    contact: '카카오톡 오픈채팅 "창의관 여자 룸메"',
    isSample: true,
  },
  {
    id: 'sample-3',
    createdAt: hoursAgo(26),
    dormitory: 'hanbit',
    gender: '남',
    age: 20,
    collegeCode: 'business',
    mbti: null,
    checklist: {
      smoking: false, sleepHabit: true, deepSleeper: true, mealPlan: true, lateSnack: false, earphones: true,
      bedtime: '10-11시', wakeup: '6시 이전', lampOff: '11시 이전',
      roomCleaning: '매일', bathroomCleaning: '일주일에 2-3번', sharedTrash: false, recycling: '생길 때마다 각자 치운다',
      relationship: '비즈니스 관계', phoneCalls: '무조건 밖에서', sharing: '절대 안 돼', friendsOver: false, seat: '문과 마주보지 않는, 에어컨 직방 자리',
    },
    content: '아침 운동하고 수업 가요. 코골이가 조금 있어서 귀마개 쓰시는 분이면 좋겠습니다.',
    contact: 'https://open.kakao.com/o/example2',
    isClosed: true,
    isSample: true,
  },
]

const fromRow = (row) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  authorId: row.user_id,
  dormitory: row.dormitory_code,
  gender: row.gender,
  age: row.age,
  collegeCode: row.college_code,
  mbti: row.mbti,
  checklist: row.checklist ?? {},
  content: row.content,
  contact: row.contact,
  isClosed: row.is_closed,
})

const toRow = (post) => ({
  dormitory_code: post.dormitory,
  gender: post.gender,
  age: post.age,
  college_code: post.collegeCode,
  mbti: post.mbti,
  checklist: post.checklist,
  content: post.content,
  contact: post.contact,
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
  const next = { ...target, ...patch, updatedAt: new Date().toISOString() }
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

export const roommateStorage = isSupabaseConfigured ? 'supabase' : 'local'

export const PAGE_SIZE = 12

// 모집 중인 글 먼저, 그다음 최신순
const byOpenThenNewest = (a, b) =>
  Number(Boolean(a.isClosed)) - Number(Boolean(b.isClosed)) || b.createdAt.localeCompare(a.createdAt)

/**
 * 게시글 한 페이지. 필터와 페이지 나누기를 DB 에서 처리해 필요한 글만 받아온다 (Supabase 전송량 절약).
 * @param {{ page?: number, dormitory?: string|null, gender?: string|null }} options  page 는 1부터
 * @returns {Promise<{ items: object[], total: number }>}
 */
export async function fetchRoommatePage({ page = 1, dormitory = null, gender = null } = {}) {
  const from = (page - 1) * PAGE_SIZE
  if (!isSupabaseConfigured) {
    const all = [...readLocal(), ...SAMPLE_POSTS]
      .filter((p) => (!dormitory || p.dormitory === dormitory) && (!gender || p.gender === gender))
      .sort(byOpenThenNewest)
    return { items: all.slice(from, from + PAGE_SIZE), total: all.length }
  }
  const supabase = await client()
  let query = supabase.from('roommate_posts').select(COLUMNS, { count: 'exact' })
  if (dormitory) query = query.eq('dormitory_code', dormitory)
  if (gender) query = query.eq('gender', gender)
  const { data, count, error } = await query
    .order('is_closed', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  // 마지막 페이지의 글이 지워져 페이지 범위를 벗어난 경우
  if (error?.code === 'PGRST103') return { items: [], total: 0, outOfRange: true }
  if (error) throw new Error('게시글을 불러오지 못했어요.')
  return { items: data.map(fromRow), total: count ?? data.length }
}

/** 로그인한 계정으로 쓴 글 */
export async function fetchMyPosts(userId) {
  if (!isSupabaseConfigured) return readLocal().filter((p) => p.authorId === userId)
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
    const saved = { ...post, id: crypto.randomUUID(), createdAt: new Date().toISOString(), authorId: userId, isClosed: false }
    writeJson(LOCAL_POSTS_KEY, [saved, ...readLocal()])
    return saved
  }
  const supabase = await client()
  // user_id 는 DB 기본값 auth.uid() 로 채워진다
  const { data, error } = await supabase.from('roommate_posts').insert(toRow(post)).select(COLUMNS).single()
  if (error) throw new Error('글을 등록하지 못했어요. 입력값을 확인해 주세요.')
  return fromRow(data)
}

export async function updateRoommatePost(id, post, userId) {
  if (!isSupabaseConfigured) return updateLocal(id, userId, post)
  const supabase = await client()
  const { data, error } = await supabase.from('roommate_posts').update(toRow(post)).eq('id', id).select(COLUMNS).single()
  if (error) throw new Error('글을 수정하지 못했어요.')
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
  if (error) throw new Error('모집 상태를 바꾸지 못했어요.')
  return fromRow(data)
}

export async function deleteRoommatePost(id, userId) {
  if (!isSupabaseConfigured) {
    const posts = readLocal()
    if (posts.find((p) => p.id === id)?.authorId !== userId) throw new Error('내가 쓴 글만 삭제할 수 있어요.')
    writeJson(
      LOCAL_POSTS_KEY,
      posts.filter((p) => p.id !== id),
    )
    return
  }
  const supabase = await client()
  // RLS 때문에 남의 글은 지워지지 않고 0행이 돌아온다
  const { data, error } = await supabase.from('roommate_posts').delete().eq('id', id).select('id')
  if (error || !data.length) throw new Error('글을 삭제하지 못했어요.')
}

import { isSupabaseConfigured } from '../config.js'

// 룸메 신청 (supabase/migrations/20261006000000_roommate_requests.sql)
// 남의 글에 [룸메 신청]을 보내면 글쓴이의 [받은 신청]에 내 기본 정보 + 체크리스트가 전달된다.
// 실시간 알림이나 주기적 확인은 없다. 버튼을 누를 때만 요청한다.
// 테이블에 직접 접근하지 않고 함수(RPC)로만 다룬다. Supabase 미연결 시에는 이 브라우저에만 저장 (데모 계정).
export const MESSAGE_MAX = 200

const REQUESTS_KEY = 'jbnu-dorm:roommate-requests'
const POSTS_KEY = 'jbnu-dorm:roommate-posts' // lib/roommates.js
const PROFILES_KEY = 'jbnu-dorm:roommate-profiles' // lib/roommateProfile.js

const ERRORS = {
  closed: '모집이 끝난 글이라 신청할 수 없어요.',
  own: '내 글에는 신청할 수 없어요.',
  not_found: '글을 찾을 수 없어요. 삭제되었을 수 있어요.',
  profile: '내 체크리스트를 먼저 등록해 주세요.',
  duplicate: '이미 신청한 글이에요.',
  too_long: `한마디는 ${MESSAGE_MAX}자까지 남길 수 있어요.`,
}

const fromRow = (row) => ({
  id: row.request_id,
  createdAt: row.created_at,
  postId: row.post_id,
  dormitory: row.dormitory_code,
  semester: row.semester,
  postClosed: row.post_closed,
  message: row.message,
  isNew: row.is_new,
  applicant: row.applicant,
})

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
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

const rpcError = (error, fallback) => new Error(ERRORS[error?.hint] ?? fallback)

// ── 로컬(데모) 모드: 내 글에 온 신청 ──
function localReceived(userId, postId) {
  const posts = read(POSTS_KEY, []).filter((p) => p.authorId === userId && (!postId || p.id === postId))
  const profiles = read(PROFILES_KEY, {})
  return read(REQUESTS_KEY, [])
    .filter((r) => posts.some((p) => p.id === r.postId))
    .map((r) => {
      const post = posts.find((p) => p.id === r.postId)
      return {
        id: r.id,
        createdAt: r.createdAt,
        postId: r.postId,
        dormitory: post.dormitory,
        semester: post.semester,
        postClosed: Boolean(post.isClosed),
        message: r.message,
        isNew: !r.seenAt,
        applicant: r.applicant ?? profiles[r.applicantId] ?? null,
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ── 공개 함수 ──

/** 이 글에 신청 보내기. message 는 선택 (글쓴이만 본다) */
export async function sendRequest(post, message, userId) {
  const text = message.trim()
  if (text.length > MESSAGE_MAX) throw new Error(ERRORS.too_long)
  if (!isSupabaseConfigured) {
    if (post.authorId === userId) throw new Error(ERRORS.own)
    if (post.isClosed) throw new Error(ERRORS.closed)
    const requests = read(REQUESTS_KEY, [])
    if (requests.some((r) => r.postId === post.id && r.applicantId === userId)) throw new Error(ERRORS.duplicate)
    requests.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      postId: post.id,
      applicantId: userId,
      message: text || null,
      seenAt: null,
    })
    write(REQUESTS_KEY, requests)
    return
  }
  const supabase = await client()
  const { error } = await supabase.rpc('send_roommate_request', { p_post_id: post.id, p_message: text || null })
  if (error) throw rpcError(error, '신청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
}

/** 보낸 신청 취소 */
export async function cancelRequest(postId, userId) {
  if (!isSupabaseConfigured) {
    write(
      REQUESTS_KEY,
      read(REQUESTS_KEY, []).filter((r) => !(r.postId === postId && r.applicantId === userId)),
    )
    return
  }
  const supabase = await client()
  const { error } = await supabase.rpc('cancel_roommate_request', { p_post_id: postId })
  if (error) throw new Error('신청을 취소하지 못했어요.')
}

/** 내가 신청한 글 id 목록 */
export async function fetchSentPostIds(userId) {
  if (!isSupabaseConfigured) {
    return read(REQUESTS_KEY, [])
      .filter((r) => r.applicantId === userId)
      .map((r) => r.postId)
  }
  const supabase = await client()
  const { data, error } = await supabase.rpc('my_roommate_requests')
  if (error) throw new Error('신청 내역을 불러오지 못했어요.')
  return data
}

/** 내 글에 온 신청 (최신순). 불러오면 확인한 것으로 표시된다. postId 를 주면 그 글만 */
export async function fetchReceivedRequests(userId, postId = null) {
  if (!isSupabaseConfigured) {
    const list = localReceived(userId, postId)
    const ids = new Set(list.map((r) => r.id))
    const now = new Date().toISOString()
    write(
      REQUESTS_KEY,
      read(REQUESTS_KEY, []).map((r) => (ids.has(r.id) && !r.seenAt ? { ...r, seenAt: now } : r)),
    )
    return list
  }
  const supabase = await client()
  const { data, error } = await supabase.rpc('list_roommate_requests', { p_post_id: postId })
  if (error) throw new Error('받은 신청을 불러오지 못했어요.')
  return data.map(fromRow)
}

/** 아직 확인하지 않은 받은 신청 수 */
export async function countNewRequests(userId) {
  if (!isSupabaseConfigured) return localReceived(userId, null).filter((r) => r.isNew).length
  const supabase = await client()
  const { data, error } = await supabase.rpc('count_new_roommate_requests')
  if (error) throw new Error('받은 신청 수를 불러오지 못했어요.')
  return data ?? 0
}

/** 로컬 모드의 글별 신청 수 (Supabase 에서는 roommate_posts.request_count) */
export function localRequestCount(postId) {
  return read(REQUESTS_KEY, []).filter((r) => r.postId === postId).length
}

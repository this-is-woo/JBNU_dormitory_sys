import { isSupabaseConfigured } from '../config.js'
import { dormName } from '../components/roommates/postFormat.js'
import { semesterLabel } from './semester.js'
import { roommateSemester } from './siteSettings.js'
import { appendLocalMessage } from './roommateChat.js'
import { uid } from './uid.js'

// 헤더·메뉴의 새 소식 수는 이제 안 읽은 대화 수 (lib/roommateChat.js)
export { fetchInboxCounts } from './roommateChat.js'

// 룸메 신청 · 차단
// (supabase/migrations/20261006000000_roommate_requests.sql, 20261007000000_roommate_blocks_replies.sql)
// 남의 글에 [룸메 신청]을 보내면 신청자와 글쓴이의 1:1 대화방이 생긴다. 대화는 lib/roommateChat.js
// (신청할 때 남긴 한마디가 대화방의 첫 메시지가 된다: 20261020000000_roommate_chat.sql)
// 테이블에 직접 접근하지 않고 함수(RPC)로만 다룬다. Supabase 미연결 시에는 이 브라우저에만 저장 (데모 계정).
export const MESSAGE_MAX = 200

const REQUESTS_KEY = 'jbnu-dorm:roommate-requests'
const BLOCKS_KEY = 'jbnu-dorm:roommate-blocks'
const POSTS_KEY = 'jbnu-dorm:roommate-posts' // lib/roommates.js

const ERRORS = {
  closed: '모집이 끝난 글이라 신청할 수 없어요.',
  archived: '지난 학기 글이라 신청할 수 없어요.',
  own: '내 글에는 신청할 수 없어요.',
  gender: '같은 성별의 글에만 신청할 수 있어요.',
  not_found: '글을 찾을 수 없어요. 삭제되었거나 볼 수 없는 글이에요.',
  profile: '내 정보를 먼저 등록해 주세요.',
  duplicate: '이미 신청한 글이에요.',
  too_long: '입력한 글이 너무 길어요.',
  forbidden: '차단할 수 없는 사용자예요.',
  suspended: '이용이 정지된 계정이라 신청하거나 메시지를 보낼 수 없어요.',
}

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

async function rpc(name, args, fallback) {
  const supabase = await client()
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(ERRORS[error.hint] ?? fallback)
  return data
}

const postContext = (post) => [dormName(post.dormitory), post.semester && semesterLabel(post.semester)].filter(Boolean).join(' · ')

// ── 로컬(데모) 모드 ──
const localPosts = () => read(POSTS_KEY, [])

function localBlocked(userId, other) {
  return read(BLOCKS_KEY, []).some(
    (b) => (b.blockerId === userId && b.blockedId === other) || (b.blockerId === other && b.blockedId === userId),
  )
}

function localBlock(userId, blockedId, context) {
  if (!blockedId || blockedId === userId) throw new Error(ERRORS.forbidden)
  const blocks = read(BLOCKS_KEY, [])
  if (!blocks.some((b) => b.blockerId === userId && b.blockedId === blockedId)) {
    blocks.unshift({ id: uid(), createdAt: new Date().toISOString(), blockerId: userId, blockedId, context })
    write(BLOCKS_KEY, blocks)
  }
  // 두 사람 사이의 신청 삭제
  const posts = localPosts()
  const authorOf = (postId) => posts.find((p) => p.id === postId)?.authorId ?? samplePostAuthor(postId)
  write(
    REQUESTS_KEY,
    read(REQUESTS_KEY, []).filter((r) => {
      const author = authorOf(r.postId)
      return !((author === userId && r.applicantId === blockedId) || (author === blockedId && r.applicantId === userId))
    }),
  )
}

// 예시 글의 글쓴이 (lib/roommates.js 의 SAMPLE_POSTS 와 같은 규칙)
const samplePostAuthor = (postId) => (postId?.startsWith('sample-') ? `${postId}-author` : null)

// ── 신청 ──

/** 이 글에 신청 보내기. message 는 선택 (글쓴이만 본다). myGender: 내 정보의 성별 */
export async function sendRequest(post, message, userId, myGender) {
  const text = message.trim()
  if (text.length > MESSAGE_MAX) throw new Error(`한마디는 ${MESSAGE_MAX}자까지 남길 수 있어요.`)
  if (!isSupabaseConfigured) {
    if (post.authorId === userId) throw new Error(ERRORS.own)
    if ((post.semester ?? roommateSemester()) !== roommateSemester()) throw new Error(ERRORS.archived)
    if (post.gender !== myGender) throw new Error(ERRORS.gender)
    if (post.isClosed) throw new Error(ERRORS.closed)
    if (localBlocked(userId, post.authorId)) throw new Error(ERRORS.not_found)
    const requests = read(REQUESTS_KEY, [])
    if (requests.some((r) => r.postId === post.id && r.applicantId === userId)) throw new Error(ERRORS.duplicate)
    const id = uid()
    requests.push({
      id,
      createdAt: new Date().toISOString(),
      postId: post.id,
      applicantId: userId,
      message: text || null,
      seenAt: null,
      // 데모: 보낸 신청에 보여 줄 글 정보
      post: { dormitory: post.dormitory, semester: post.semester, isClosed: Boolean(post.isClosed), gender: post.gender, age: post.age, collegeCode: post.collegeCode, mbti: post.mbti },
    })
    write(REQUESTS_KEY, requests)
    // 대화방의 첫 메시지 (DB 의 send_roommate_request 와 같게)
    appendLocalMessage({ requestId: id, senderRole: 'applicant', kind: 'request', body: text || null, userId })
    return
  }
  await rpc('send_roommate_request', { p_post_id: post.id, p_message: text || null }, '신청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
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
  await rpc('cancel_roommate_request', { p_post_id: postId }, '신청을 취소하지 못했어요.')
}

/** 내가 신청한 글 id 목록 */
export async function fetchSentPostIds(userId) {
  if (!isSupabaseConfigured) {
    return read(REQUESTS_KEY, [])
      .filter((r) => r.applicantId === userId)
      .map((r) => r.postId)
  }
  return rpc('my_roommate_requests', {}, '신청 내역을 불러오지 못했어요.')
}

// 새 소식 수가 바뀌었음을 알리는 이벤트 (룸메이트·신청 내역 페이지 → 헤더의 모바일 메뉴 표시)
export const INBOX_EVENT = 'jbnu-dorm:inbox-counts'
export function announceInboxCounts(counts) {
  window.dispatchEvent(new CustomEvent(INBOX_EVENT, { detail: counts }))
}

/** 로컬 모드의 글별 신청 수 (Supabase 에서는 roommate_posts.request_count) */
export function localRequestCount(postId) {
  return read(REQUESTS_KEY, []).filter((r) => r.postId === postId).length
}

// ── 차단 ──

/** 받은 신청의 신청자 차단 */
export async function blockApplicant(request, userId) {
  if (!isSupabaseConfigured) {
    const target = read(REQUESTS_KEY, []).find((r) => r.id === request.id)
    return localBlock(userId, target?.applicantId, `받은 신청 · ${postContext(request)}`)
  }
  await rpc('block_roommate_applicant', { p_request_id: request.id }, '차단하지 못했어요.')
}

/** 게시글의 글쓴이 차단 */
export async function blockAuthor(post, userId) {
  if (!isSupabaseConfigured) return localBlock(userId, post.authorId, `게시글 · ${postContext(post)}`)
  await rpc('block_roommate_author', { p_post_id: post.id }, '차단하지 못했어요.')
}

/** 대화 상대 차단: 받은 신청이면 신청자, 보낸 신청이면 글쓴이 (thread: lib/roommateChat.js 의 대화방) */
export async function blockCounterpart(thread, userId) {
  const context = { id: thread.id, dormitory: thread.dormitory, semester: thread.semester }
  if (thread.role === 'author') return blockApplicant(context, userId)
  return blockAuthor({ ...context, id: thread.postId, authorId: thread.authorId }, userId)
}

/** 내가 차단한 목록 (상대가 누구인지는 없고, 어디서 차단했는지만) */
export async function fetchBlocks(userId) {
  if (!isSupabaseConfigured) {
    return read(BLOCKS_KEY, [])
      .filter((b) => b.blockerId === userId)
      .map(({ id, createdAt, context }) => ({ id, createdAt, context }))
  }
  const data = await rpc('list_roommate_blocks', {}, '차단 목록을 불러오지 못했어요.')
  return data.map((row) => ({ id: row.block_id, createdAt: row.created_at, context: row.context }))
}

export async function unblock(blockId, userId) {
  if (!isSupabaseConfigured) {
    write(
      BLOCKS_KEY,
      read(BLOCKS_KEY, []).filter((b) => !(b.id === blockId && b.blockerId === userId)),
    )
    return
  }
  await rpc('unblock_roommate', { p_block_id: blockId }, '차단을 해제하지 못했어요.')
}

/** 로컬 모드: 나와 이 글쓴이 사이에 차단이 있는지 (Supabase 에서는 DB 정책이 글을 숨긴다) */
export const isLocallyBlocked = (userId, authorId) => Boolean(userId) && localBlocked(userId, authorId)

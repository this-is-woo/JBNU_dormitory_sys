import { isSupabaseConfigured } from '../config.js'
import { isLocallySuspended } from './localModeration.js'

// 신청 내역 = 룸메 신청으로 시작된 1:1 대화 (supabase/migrations/20261020000000_roommate_chat.sql)
// 신청 하나가 신청자(applicant)와 글쓴이(author)의 대화방이다. 보낸 사람은 계정 대신 역할로만 구분한다.
//   · 목록·대화방 정보: list_roommate_threads · 보내기: post_roommate_thread_message · 읽음: mark_roommate_thread_read
//   · 메시지는 RLS 로 대화방의 두 사람만 읽고, Supabase Realtime 으로 거의 실시간에 받는다.
//     실시간 연결이 끊기면 화면이 보일 때만 몇 초마다 새 메시지를 확인한다 (subscribeMessages 의 onStatus).
// Supabase 미연결(데모)일 때는 이 브라우저에만 저장하고, 같은 브라우저의 다른 탭에도 바로 전한다.
export const MESSAGE_MAX = 1000
export const PAGE = 50

const REQUESTS_KEY = 'jbnu-dorm:roommate-requests' // lib/roommateRequests.js
const POSTS_KEY = 'jbnu-dorm:roommate-posts' // lib/roommates.js
const PROFILES_KEY = 'jbnu-dorm:roommate-profiles' // lib/roommateProfile.js
const MESSAGES_KEY = 'jbnu-dorm:roommate-messages'
const READS_KEY = 'jbnu-dorm:roommate-thread-reads' // { [requestId]: { [userId]: lastReadId } }
const LOCAL_EVENT = 'jbnu-dorm:chat-message'

const ERRORS = {
  not_found: '대화를 찾을 수 없어요. 상대가 신청을 취소했거나 차단했을 수 있어요.',
  suspended: '이용이 정지된 계정이라 메시지를 보낼 수 없어요.',
  empty: '메시지를 입력해 주세요.',
  too_long: `메시지는 ${MESSAGE_MAX}자까지 보낼 수 있어요.`,
  too_fast: '메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요.',
}

// ── 공통 ──

const fromMessageRow = (row) => ({
  id: Number(row.id),
  requestId: row.request_id,
  senderRole: row.sender_role,
  kind: row.kind,
  body: row.body,
  createdAt: row.created_at,
})

const fromThreadRow = (row) => ({
  id: row.request_id,
  role: row.role,
  createdAt: row.created_at,
  postId: row.post_id,
  dormitory: row.dormitory_code,
  semester: row.semester,
  postClosed: Boolean(row.post_closed),
  postOpen: row.post_open !== false,
  counterpart: row.counterpart ?? null,
  lastMessage: row.last_message
    ? {
        id: Number(row.last_message.id),
        kind: row.last_message.kind,
        body: row.last_message.body,
        senderRole: row.last_message.senderRole,
        createdAt: row.last_message.createdAt,
      }
    : null,
  unread: row.unread ?? 0,
})

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

// ── 데모(로컬) ──

// 예시 글의 글쓴이 (lib/roommates.js 의 SAMPLE_POSTS 와 같은 규칙)
const samplePostAuthor = (postId) => (postId?.startsWith('sample-') ? `${postId}-author` : null)

let channel = null
function localChannel() {
  if (channel === null) {
    try {
      channel = new BroadcastChannel('jbnu-dorm-chat')
    } catch {
      channel = false
    }
  }
  return channel || null
}

function announceLocal(message) {
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: message }))
  localChannel()?.postMessage(message)
}

/** 예전 데모 신청(한마디 + 답장)에 대화 메시지가 없으면 만들어 둔다 (DB 마이그레이션과 같은 일) */
function localMessages() {
  const requests = read(REQUESTS_KEY, [])
  let messages = read(MESSAGES_KEY, [])
  const has = new Set(messages.map((m) => m.requestId))
  const missing = requests.filter((r) => !has.has(r.id))
  if (missing.length) {
    let next = messages.reduce((max, m) => Math.max(max, m.id), 0)
    for (const r of missing.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      messages.push({ id: ++next, requestId: r.id, senderRole: 'applicant', kind: 'request', body: r.message ?? null, createdAt: r.createdAt })
      if (r.reply) {
        messages.push({ id: ++next, requestId: r.id, senderRole: 'author', kind: 'text', body: r.reply, createdAt: r.repliedAt ?? r.createdAt })
      }
    }
    write(MESSAGES_KEY, messages)
  }
  // 신청이 지워진(취소·차단) 대화의 메시지는 버린다
  const alive = new Set(requests.map((r) => r.id))
  if (messages.some((m) => !alive.has(m.requestId))) {
    messages = messages.filter((m) => alive.has(m.requestId))
    write(MESSAGES_KEY, messages)
  }
  return messages
}

/** 데모: 새 대화 메시지 저장 (룸메 신청을 보낼 때 lib/roommateRequests.js 도 쓴다) */
export function appendLocalMessage({ requestId, senderRole, kind = 'text', body, userId }) {
  const messages = localMessages()
  const message = {
    id: messages.reduce((max, m) => Math.max(max, m.id), 0) + 1,
    requestId,
    senderRole,
    kind,
    body,
    createdAt: new Date().toISOString(),
  }
  write(MESSAGES_KEY, [...messages, message])
  if (userId) setLocalRead(requestId, userId, message.id)
  announceLocal(message)
  return message
}

function setLocalRead(requestId, userId, lastId) {
  const reads = read(READS_KEY, {})
  const current = reads[requestId]?.[userId] ?? 0
  if (lastId <= current) return
  write(READS_KEY, { ...reads, [requestId]: { ...reads[requestId], [userId]: lastId } })
}

function localThreads(userId) {
  const posts = read(POSTS_KEY, [])
  const profiles = read(PROFILES_KEY, {})
  const reads = read(READS_KEY, {})
  const messages = localMessages()
  return read(REQUESTS_KEY, [])
    .map((r) => {
      const post = posts.find((p) => p.id === r.postId) ?? { ...(r.post ?? {}), authorId: samplePostAuthor(r.postId) }
      const role = r.applicantId === userId ? 'applicant' : post.authorId === userId ? 'author' : null
      if (!role) return null
      if (role === 'author' && isLocallySuspended(r.applicantId)) return null
      const mine = messages.filter((m) => m.requestId === r.id)
      const last = mine[mine.length - 1] ?? null
      const lastRead = reads[r.id]?.[userId] ?? 0
      const counterpart =
        role === 'author'
          ? profiles[r.applicantId] ?? null
          : {
              dormitory: post.dormitory,
              gender: post.gender,
              age: post.age,
              collegeCode: post.collegeCode,
              mbti: post.mbti ?? null,
              checklist: post.checklist ?? {},
            }
      return {
        id: r.id,
        role,
        createdAt: r.createdAt,
        postId: r.postId,
        dormitory: post.dormitory,
        semester: post.semester,
        postClosed: Boolean(post.isClosed),
        postOpen: post.isOpen !== false,
        counterpart,
        lastMessage: last,
        unread: mine.filter((m) => m.senderRole !== role && m.id > lastRead).length,
        // 데모에서 글쓴이 차단에 쓴다 (Supabase 에서는 DB 가 글 id 로 찾는다)
        authorId: post.authorId,
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt))
}

// ── 대화방 ──

/** 내 대화방 목록 (최근 대화가 위로) */
export async function fetchThreads(userId) {
  if (!isSupabaseConfigured) return localThreads(userId)
  const data = await rpc('list_roommate_threads', { p_request_id: null }, '신청 내역을 불러오지 못했어요.')
  return data.map(fromThreadRow)
}

/** 대화방 하나 (없거나 볼 수 없으면 null) */
export async function fetchThread(requestId, userId) {
  if (!isSupabaseConfigured) return localThreads(userId).find((t) => t.id === requestId) ?? null
  const data = await rpc('list_roommate_threads', { p_request_id: requestId }, '대화를 불러오지 못했어요.')
  return data[0] ? fromThreadRow(data[0]) : null
}

/**
 * 메시지 (오래된 것부터). 기본은 최근 PAGE 개.
 * before: 이 id 보다 앞의 메시지 (위로 더 보기) · after: 이 id 보다 뒤의 메시지 (놓친 새 메시지 확인)
 * @returns {Promise<{ messages: object[], hasMore: boolean }>}
 */
export async function fetchMessages(requestId, { before = null, after = null } = {}) {
  if (!isSupabaseConfigured) {
    let list = localMessages().filter((m) => m.requestId === requestId)
    if (after != null) return { messages: list.filter((m) => m.id > after), hasMore: false }
    if (before != null) list = list.filter((m) => m.id < before)
    return { messages: list.slice(-PAGE), hasMore: list.length > PAGE }
  }
  const supabase = await client()
  let query = supabase
    .from('roommate_thread_messages')
    .select('id, request_id, sender_role, kind, body, created_at')
    .eq('request_id', requestId)
  if (after != null) {
    const { data, error } = await query.gt('id', after).order('id', { ascending: true }).limit(200)
    if (error) throw new Error('새 메시지를 불러오지 못했어요.')
    return { messages: data.map(fromMessageRow), hasMore: false }
  }
  if (before != null) query = query.lt('id', before)
  const { data, error } = await query.order('id', { ascending: false }).limit(PAGE + 1)
  if (error) throw new Error('메시지를 불러오지 못했어요.')
  return { messages: data.slice(0, PAGE).map(fromMessageRow).reverse(), hasMore: data.length > PAGE }
}

/** 메시지 보내기 → 저장된 메시지 */
export async function sendMessage(thread, text, userId) {
  const body = text.trim()
  if (!body) throw new Error(ERRORS.empty)
  if (body.length > MESSAGE_MAX) throw new Error(ERRORS.too_long)
  if (!isSupabaseConfigured) {
    if (!localThreads(userId).some((t) => t.id === thread.id)) throw new Error(ERRORS.not_found)
    if (isLocallySuspended(userId)) throw new Error(ERRORS.suspended)
    return appendLocalMessage({ requestId: thread.id, senderRole: thread.role, body, userId })
  }
  const data = await rpc(
    'post_roommate_thread_message',
    { p_request_id: thread.id, p_body: body },
    '메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  )
  const row = Array.isArray(data) ? data[0] : data
  return { id: Number(row.id), requestId: thread.id, senderRole: thread.role, kind: 'text', body, createdAt: row.created_at }
}

/** 여기까지 읽음 (lastId 가 없으면 지금까지 전부) */
export async function markRead(requestId, lastId, userId) {
  if (!isSupabaseConfigured) {
    const last = lastId ?? localMessages().filter((m) => m.requestId === requestId).at(-1)?.id ?? 0
    return setLocalRead(requestId, userId, last)
  }
  const supabase = await client()
  await supabase.rpc('mark_roommate_thread_read', { p_request_id: requestId, p_last_id: lastId ?? null })
}

/** 헤더·메뉴의 새 소식: 안 읽은 메시지가 있는 받은 대화 수 · 보낸 대화 수 */
export async function fetchInboxCounts(userId) {
  if (!isSupabaseConfigured) {
    const list = localThreads(userId)
    return {
      requests: list.filter((t) => t.role === 'author' && t.unread > 0).length,
      replies: list.filter((t) => t.role === 'applicant' && t.unread > 0).length,
    }
  }
  const data = await rpc('roommate_inbox_counts', {}, '새 소식을 불러오지 못했어요.')
  const row = Array.isArray(data) ? data[0] : data
  return { requests: row?.new_requests ?? 0, replies: row?.new_replies ?? 0 }
}

// ── 실시간 ──

/**
 * 새 메시지를 실시간으로 받는다. requestId 가 없으면 내 모든 대화 (RLS 가 내 것만 보낸다).
 * onStatus('live' | 'offline'): 실시간 연결 상태 (offline 이면 화면이 직접 새 메시지를 확인한다)
 * @returns {() => void} 구독 해제
 */
export function subscribeMessages({ requestId = null, onInsert, onStatus }) {
  if (!isSupabaseConfigured) {
    const pick = (m) => m && (!requestId || m.requestId === requestId) && onInsert(m)
    const onLocal = (e) => pick(e.detail)
    const onOtherTab = (e) => pick(e.data)
    window.addEventListener(LOCAL_EVENT, onLocal)
    localChannel()?.addEventListener('message', onOtherTab)
    onStatus?.('live')
    return () => {
      window.removeEventListener(LOCAL_EVENT, onLocal)
      localChannel()?.removeEventListener('message', onOtherTab)
    }
  }
  let closed = false
  let supabase = null
  let sub = null
  client().then((s) => {
    if (closed) return
    supabase = s
    sub = s
      .channel(`roommate-chat:${requestId ?? 'all'}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'roommate_thread_messages',
          ...(requestId ? { filter: `request_id=eq.${requestId}` } : {}),
        },
        (payload) => onInsert(fromMessageRow(payload.new)),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onStatus?.('live')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus?.('offline')
      })
  })
  return () => {
    closed = true
    if (supabase && sub) supabase.removeChannel(sub)
  }
}

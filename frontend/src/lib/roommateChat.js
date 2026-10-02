import { isSupabaseConfigured } from '../config.js'
import { isLocallySuspended } from './localModeration.js'

// 채팅 = 룸메 신청으로 시작된 1:1 대화
// (supabase/migrations/20261020000000_roommate_chat.sql, 20261021000000_roommate_chat_actions.sql)
// 신청 하나가 신청자(applicant)와 글쓴이(author)의 대화방이다. 보낸 사람·읽은 사람은 계정 대신 역할로만 구분한다.
//   · 목록·대화방 정보: list_roommate_threads · 보내기: post_roommate_thread_message (답장 가능)
//   · 수정·삭제: edit_ / delete_roommate_thread_message (내 메시지만, 삭제하면 "삭제된 메시지입니다.")
//   · 읽음: mark_roommate_thread_read. 상대의 읽음 위치(otherReadId)보다 뒤의 내 메시지에 "1" 을 붙인다.
//   · 메시지와 읽음 위치는 RLS 로 대화방의 두 사람만 읽고, Supabase Realtime 으로 거의 실시간에 받는다.
//     실시간 연결이 끊기면 화면이 보일 때만 몇 초마다 새 메시지를 확인한다 (subscribeMessages 의 onStatus).
// 대화 시작(첫 메시지와 함께 신청 만들기)은 lib/roommateRequests.js 의 startChat.
// Supabase 미연결(데모)일 때는 이 브라우저에만 저장하고, 같은 브라우저의 다른 탭에도 바로 전한다.
export const MESSAGE_MAX = 1000
export const PAGE = 50

const REQUESTS_KEY = 'jbnu-dorm:roommate-requests' // lib/roommateRequests.js
const POSTS_KEY = 'jbnu-dorm:roommate-posts' // lib/roommates.js
const PROFILES_KEY = 'jbnu-dorm:roommate-profiles' // lib/roommateProfile.js
const MESSAGES_KEY = 'jbnu-dorm:roommate-messages'
const READS_KEY = 'jbnu-dorm:roommate-reads' // { [requestId]: { applicant: lastReadId, author: lastReadId } }
const MESSAGE_EVENT = 'jbnu-dorm:chat-message'
const READ_EVENT = 'jbnu-dorm:chat-read'
const COLUMNS = 'id, request_id, sender_role, kind, body, reply_to_id, edited_at, deleted_at, created_at'

export const ERRORS = {
  not_found: '대화를 찾을 수 없어요. 상대가 신청을 취소했거나 차단했을 수 있어요.',
  suspended: '이용이 정지된 계정이라 메시지를 보낼 수 없어요.',
  empty: '메시지를 입력해 주세요.',
  too_long: `메시지는 ${MESSAGE_MAX}자까지 보낼 수 있어요.`,
  too_fast: '메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요.',
  reply_not_found: '답장할 메시지를 찾을 수 없어요.',
  deleted: '삭제된 메시지는 고칠 수 없어요.',
  left: '상대가 채팅방을 나가서 메시지를 보낼 수 없어요.',
}

// ── 공통 ──

const fromMessageRow = (row) => ({
  id: Number(row.id),
  requestId: row.request_id,
  senderRole: row.sender_role,
  kind: row.kind,
  body: row.body,
  replyToId: row.reply_to_id == null ? null : Number(row.reply_to_id),
  editedAt: row.edited_at ?? null,
  deletedAt: row.deleted_at ?? null,
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
        deletedAt: row.last_message.deletedAt ?? null,
      }
    : null,
  unread: row.unread ?? 0,
  otherReadId: Number(row.other_read_id ?? 0),
  otherLeft: Boolean(row.other_left),
  // 글이 지워졌어도 대화는 남는다 (20261023). 호관·학기·상대 정보는 남겨 둔 글 정보
  postDeleted: Boolean(row.post_deleted),
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
const otherRole = (role) => (role === 'author' ? 'applicant' : 'author')

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

// 같은 탭(이벤트)과 다른 탭(BroadcastChannel)에 알린다 — Supabase Realtime 대신
function announceLocal(type, detail) {
  window.dispatchEvent(new CustomEvent(type, { detail }))
  localChannel()?.postMessage({ type, detail })
}

/**
 * 예전 데모 신청(한마디 + 답장)에 대화 메시지가 없으면 만들어 둔다 (DB 마이그레이션과 같은 일).
 * 채팅으로 시작한 신청(chat: true)은 첫 메시지를 startChat 이 직접 남기므로 건너뛴다
 */
function localMessages() {
  const requests = read(REQUESTS_KEY, [])
  let messages = read(MESSAGES_KEY, [])
  const has = new Set(messages.map((m) => m.requestId))
  const missing = requests.filter((r) => !has.has(r.id) && !r.chat)
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
  return messages.map((m) => ({ replyToId: null, editedAt: null, deletedAt: null, ...m }))
}

function setLocalRead(requestId, role, lastId) {
  const reads = read(READS_KEY, {})
  if (lastId <= (reads[requestId]?.[role] ?? 0)) return
  write(READS_KEY, { ...reads, [requestId]: { ...reads[requestId], [role]: lastId } })
  announceLocal(READ_EVENT, { requestId, role, lastId })
}

/** 데모: 새 대화 메시지 저장 (대화를 시작할 때 lib/roommateRequests.js 도 쓴다) */
export function appendLocalMessage({ requestId, senderRole, kind = 'text', body, replyToId = null }) {
  const messages = localMessages()
  const message = {
    id: messages.reduce((max, m) => Math.max(max, m.id), 0) + 1,
    requestId,
    senderRole,
    kind,
    body,
    replyToId,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  }
  write(MESSAGES_KEY, [...messages, message])
  setLocalRead(requestId, senderRole, message.id)
  announceLocal(MESSAGE_EVENT, message)
  return message
}

function updateLocalMessage(id, patch) {
  const messages = localMessages()
  const target = messages.find((m) => m.id === id)
  const next = { ...target, ...patch }
  write(
    MESSAGES_KEY,
    messages.map((m) => (m.id === id ? next : m)),
  )
  announceLocal(MESSAGE_EVENT, next)
  return next
}

function localThreads(userId) {
  const posts = read(POSTS_KEY, [])
  const profiles = read(PROFILES_KEY, {})
  const reads = read(READS_KEY, {})
  const messages = localMessages()
  return read(REQUESTS_KEY, [])
    .map((r) => {
      // 글이 지워졌으면 신청에 남겨 둔 글 정보로 (lib/roommates.js 의 detachLocalChats)
      const live = r.postDeleted ? null : posts.find((p) => p.id === r.postId)
      const post = live ?? { ...(r.post ?? {}), authorId: r.authorId ?? samplePostAuthor(r.postId) }
      const role = r.applicantId === userId ? 'applicant' : post.authorId === userId ? 'author' : null
      if (!role) return null
      // 내가 나간 대화는 보이지 않는다
      if ((role === 'applicant' ? r.applicantLeftAt : r.authorLeftAt) != null) return null
      if (role === 'author' && isLocallySuspended(r.applicantId)) return null
      const mine = messages.filter((m) => m.requestId === r.id)
      const lastRead = reads[r.id]?.[role] ?? 0
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
        postId: r.postDeleted ? null : r.postId,
        postDeleted: Boolean(r.postDeleted),
        dormitory: post.dormitory,
        semester: post.semester,
        postClosed: Boolean(post.isClosed),
        postOpen: post.isOpen !== false,
        counterpart,
        lastMessage: mine.at(-1) ?? null,
        unread: mine.filter((m) => m.senderRole !== role && m.id > lastRead).length,
        otherReadId: reads[r.id]?.[otherRole(role)] ?? 0,
        // 상대가 조용히 나갔으면 나간 것으로 보이지 않는다 (DB 의 list_roommate_threads 와 같게)
        otherLeft: role === 'applicant' ? r.authorLeftAt != null && !r.authorLeftQuiet : r.applicantLeftAt != null && !r.applicantLeftQuiet,
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
  const data = await rpc('list_roommate_threads', { p_request_id: null }, '채팅 목록을 불러오지 못했어요.')
  return data.map(fromThreadRow)
}

/** 대화방 하나 (없거나 볼 수 없으면 null) */
export async function fetchThread(requestId, userId) {
  if (!isSupabaseConfigured) return localThreads(userId).find((t) => t.id === requestId) ?? null
  const data = await rpc('list_roommate_threads', { p_request_id: requestId }, '대화를 불러오지 못했어요.')
  return data[0] ? fromThreadRow(data[0]) : null
}

/** 이 글에 내가 보낸 대화방 (없으면 null). [채팅 보내기]를 누르면 이미 있는 대화로 이어 간다 */
export async function findMyThreadForPost(postId, userId) {
  const list = await fetchThreads(userId)
  return list.find((t) => t.role === 'applicant' && t.postId === postId) ?? null
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
  let query = supabase.from('roommate_thread_messages').select(COLUMNS).eq('request_id', requestId)
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

/** 답장 대상처럼 목록에 없는 메시지 하나 (없으면 null) */
export async function fetchMessage(requestId, id) {
  if (!isSupabaseConfigured) return localMessages().find((m) => m.requestId === requestId && m.id === id) ?? null
  const supabase = await client()
  const { data } = await supabase.from('roommate_thread_messages').select(COLUMNS).eq('id', id).maybeSingle()
  return data ? fromMessageRow(data) : null
}

function checkText(text) {
  const body = text.trim()
  if (!body) throw new Error(ERRORS.empty)
  if (body.length > MESSAGE_MAX) throw new Error(ERRORS.too_long)
  return body
}

/** 메시지 보내기 (replyToId: 답장할 메시지) → 저장된 메시지 */
export async function sendMessage(thread, text, userId, replyToId = null) {
  const body = checkText(text)
  if (!isSupabaseConfigured) {
    const current = localThreads(userId).find((t) => t.id === thread.id)
    if (!current) throw new Error(ERRORS.not_found)
    if (current.otherLeft) throw new Error(ERRORS.left)
    if (isLocallySuspended(userId)) throw new Error(ERRORS.suspended)
    return appendLocalMessage({ requestId: thread.id, senderRole: thread.role, body, replyToId })
  }
  const data = await rpc(
    'post_roommate_thread_message',
    { p_request_id: thread.id, p_body: body, ...(replyToId ? { p_reply_to: replyToId } : {}) },
    '메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  )
  const row = Array.isArray(data) ? data[0] : data
  return {
    id: Number(row.id),
    requestId: thread.id,
    senderRole: thread.role,
    kind: 'text',
    body,
    replyToId,
    editedAt: null,
    deletedAt: null,
    createdAt: row.created_at,
  }
}

/** 내 메시지 고치기 → 고친 메시지 */
export async function editMessage(thread, message, text, userId) {
  const body = checkText(text)
  if (message.senderRole !== thread.role || message.deletedAt) throw new Error(ERRORS.not_found)
  if (!isSupabaseConfigured) {
    if (isLocallySuspended(userId)) throw new Error(ERRORS.suspended)
    return updateLocalMessage(message.id, { body, editedAt: new Date().toISOString() })
  }
  const editedAt = await rpc('edit_roommate_thread_message', { p_message_id: message.id, p_body: body }, '메시지를 고치지 못했어요.')
  return { ...message, body, editedAt }
}

/** 내 메시지 삭제 → 자리는 남고 "삭제된 메시지입니다." */
export async function deleteMessage(thread, message) {
  if (message.senderRole !== thread.role) throw new Error(ERRORS.not_found)
  if (!isSupabaseConfigured) return updateLocalMessage(message.id, { body: null, deletedAt: message.deletedAt ?? new Date().toISOString() })
  await rpc('delete_roommate_thread_message', { p_message_id: message.id }, '메시지를 삭제하지 못했어요.')
  return { ...message, body: null, deletedAt: message.deletedAt ?? new Date().toISOString() }
}

/**
 * 채팅방 나가기: 나에게서만 대화가 사라지고, 상대에게는 "OO가 채팅방을 나갔어요" 가 보인다.
 * 두 사람 모두 나가면 대화를 지운다. 신청자가 나가면 룸메 신청도 취소된 것으로 본다.
 */
/** 채팅방 나가기. quiet: 조용히 나가기 (상대에게 "나갔어요"를 알리지 않는다) */
export async function leaveThread(thread, userId, { quiet = false } = {}) {
  if (!isSupabaseConfigured) {
    const requests = read(REQUESTS_KEY, [])
    const target = requests.find((r) => r.id === thread.id)
    if (!target || !localThreads(userId).some((t) => t.id === thread.id)) throw new Error(ERRORS.not_found)
    const now = new Date().toISOString()
    const mine = thread.role === 'applicant' ? 'applicant' : 'author'
    const next = { ...target, [`${mine}LeftAt`]: now, [`${mine}LeftQuiet`]: quiet }
    if (next.applicantLeftAt && next.authorLeftAt) {
      write(
        REQUESTS_KEY,
        requests.filter((r) => r.id !== thread.id),
      )
      return
    }
    write(
      REQUESTS_KEY,
      requests.map((r) => (r.id === thread.id ? next : r)),
    )
    if (!quiet) appendLocalMessage({ requestId: thread.id, senderRole: thread.role, kind: 'left', body: null })
    return
  }
  await rpc('leave_roommate_thread', { p_request_id: thread.id, p_quiet: quiet }, '채팅방을 나가지 못했어요.')
}

/** 여기까지 읽음 (lastId 가 없으면 지금까지 전부) */
export async function markRead(thread, lastId) {
  if (!isSupabaseConfigured) {
    const last = lastId ?? localMessages().filter((m) => m.requestId === thread.id).at(-1)?.id ?? 0
    return setLocalRead(thread.id, thread.role, last)
  }
  const supabase = await client()
  await supabase.rpc('mark_roommate_thread_read', { p_request_id: thread.id, p_last_id: lastId ?? null })
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

function localSubscribe(type, pick) {
  const onLocal = (e) => pick(e.detail)
  const onOtherTab = (e) => e.data?.type === type && pick(e.data.detail)
  window.addEventListener(type, onLocal)
  localChannel()?.addEventListener('message', onOtherTab)
  return () => {
    window.removeEventListener(type, onLocal)
    localChannel()?.removeEventListener('message', onOtherTab)
  }
}

/**
 * 새 메시지 · 고친/지운 메시지를 실시간으로 받는다. requestId 가 없으면 내 모든 대화 (RLS 가 내 것만 보낸다).
 * onStatus('live' | 'offline'): 실시간 연결 상태 (offline 이면 화면이 직접 새 메시지를 확인한다)
 * onRead(role, lastId): (requestId 가 있을 때) 누군가 이 대화를 어디까지 읽었는지
 * @returns {() => void} 구독 해제
 */
export function subscribeMessages({ requestId = null, onMessage, onRead, onStatus }) {
  if (!isSupabaseConfigured) {
    const stopMessages = localSubscribe(MESSAGE_EVENT, (m) => m && (!requestId || m.requestId === requestId) && onMessage(m))
    const stopReads = localSubscribe(READ_EVENT, (r) => r && onRead && r.requestId === requestId && onRead(r.role, r.lastId))
    onStatus?.('live')
    return () => {
      stopMessages()
      stopReads()
    }
  }
  let closed = false
  let supabase = null
  let sub = null
  const filter = requestId ? { filter: `request_id=eq.${requestId}` } : {}
  client().then((s) => {
    if (closed) return
    supabase = s
    let ch = s
      .channel(`roommate-chat:${requestId ?? 'all'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roommate_thread_messages', ...filter }, (p) =>
        onMessage(fromMessageRow(p.new)),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roommate_thread_messages', ...filter }, (p) =>
        onMessage(fromMessageRow(p.new)),
      )
    if (requestId && onRead) {
      const pickRead = (p) => p.new?.reader_role && onRead(p.new.reader_role, Number(p.new.last_read_id))
      ch = ch
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roommate_thread_reads', ...filter }, pickRead)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roommate_thread_reads', ...filter }, pickRead)
    }
    sub = ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') onStatus?.('live')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus?.('offline')
    })
  })
  return () => {
    closed = true
    if (supabase && sub) supabase.removeChannel(sub)
  }
}

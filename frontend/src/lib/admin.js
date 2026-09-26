import { isSupabaseConfigured } from '../config.js'
import { DEMO_USER } from '../hooks/useAuth.js'
import { isLocallySuspended, readModeration, writeModeration } from './localModeration.js'
import { SAMPLE_POSTS } from './roommates.js'
import { currentSemester } from './semester.js'

// 관리자 페이지 (supabase/migrations/20261010000000_admin.sql)
// 모든 관리 기능은 admin_* 함수(RPC)로만 한다. 함수마다 DB 가 관리자인지 다시 확인하므로,
// 화면을 고쳐 이 파일을 불러도 관리자가 아니면 아무것도 보거나 바꿀 수 없다.
// Supabase 미연결(데모)일 때는 아래 LOCAL 이 같은 모양의 결과를 이 브라우저의 데이터로 만든다.
export const ADMIN_PAGE_SIZE = 20

const ERRORS = {
  forbidden: '관리자만 할 수 있어요. 관리자 계정으로 다시 로그인해 주세요.',
  not_found: '대상을 찾을 수 없어요. 이미 지워졌을 수 있어요.',
  invalid: '잘못된 요청이에요. 새로고침한 뒤 다시 시도해 주세요.',
  self: '자기 자신은 정지할 수 없어요.',
  until: '정지 기한은 지금 이후로 정해 주세요.',
  too_long: '메모는 500자까지 쓸 수 있어요.',
  sample: '예시 글은 바꿀 수 없어요. 데모에서는 직접 쓴 글로 확인해 주세요.',
}

async function call(name, args, fallback) {
  if (!isSupabaseConfigured) {
    try {
      return LOCAL[name](args ?? {})
    } catch (err) {
      throw new Error(ERRORS[err.hint] ?? fallback)
    }
  }
  const { supabase } = await import('./supabase.js')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(ERRORS[error.hint] ?? fallback)
  return data
}

const num = (v) => Number(v ?? 0)
const offsetOf = (page) => (Math.max(1, page) - 1) * ADMIN_PAGE_SIZE
const toPage = (rows, map) => ({ items: rows.map(map), total: rows.length ? num(rows[0].total_count) : 0 })

// ── 개요 ──

export async function fetchOverview() {
  const o = await call('admin_overview', undefined, '개요를 불러오지 못했어요.')
  return {
    users: num(o.users),
    profiles: num(o.profiles),
    posts: num(o.posts),
    postsOpen: num(o.posts_open),
    postsClosed: num(o.posts_closed),
    postsHidden: num(o.posts_hidden),
    postsToday: num(o.posts_today),
    requests: num(o.requests),
    requestsToday: num(o.requests_today),
    blocks: num(o.blocks),
    reports: num(o.reports),
    reportsPending: num(o.reports_pending),
    suspended: num(o.suspended),
    admissionReports: num(o.admission_reports),
    admissionExcluded: num(o.admission_excluded),
    scores: num(o.scores),
    scoresToday: num(o.scores_today),
    predictions: num(o.predictions),
    predictionsToday: num(o.predictions_today),
    daily: (o.daily ?? []).map((d) => ({
      day: d.day,
      scores: num(d.scores),
      predictions: num(d.predictions),
      posts: num(d.posts),
      requests: num(d.requests),
    })),
  }
}

// ── 룸메이트 게시글 ──

const toPost = (r) => ({
  id: r.id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  authorId: r.user_id,
  authorEmail: r.author_email,
  dormitory: r.dormitory_code,
  gender: r.gender,
  age: r.age,
  collegeCode: r.college_code,
  mbti: r.mbti,
  checklist: r.checklist ?? {},
  content: r.content ?? '',
  semester: r.semester,
  isClosed: Boolean(r.is_closed),
  isOpen: r.is_open !== false,
  requestCount: num(r.request_count),
  reportCount: num(r.report_count),
  pendingReports: num(r.pending_report_count),
  authorSuspended: Boolean(r.author_suspended),
  authorSuspendedUntil: r.author_suspended_until,
  authorPostCount: num(r.author_post_count),
  isSample: String(r.id).startsWith('sample-'),
})

/** status: null | open | closed | hidden | reported | suspended */
export async function fetchAdminPosts({ status = null, semester = null, dormitory = null, gender = null, search = '', page = 1 } = {}) {
  const rows = await call(
    'admin_list_roommate_posts',
    {
      p_status: status,
      p_semester: semester,
      p_dormitory: dormitory,
      p_gender: gender,
      p_search: search || null,
      p_limit: ADMIN_PAGE_SIZE,
      p_offset: offsetOf(page),
    },
    '게시글을 불러오지 못했어요.',
  )
  return toPage(rows, toPost)
}

/** isOpen: false 숨기기 · true 다시 보이기 / isClosed: true 모집완료 · false 다시 모집 */
export async function updateAdminPost(id, { isOpen = null, isClosed = null }) {
  await call('admin_update_roommate_post', { p_post_id: id, p_is_open: isOpen, p_is_closed: isClosed }, '게시글을 바꾸지 못했어요.')
}

export async function deleteAdminPost(id) {
  await call('admin_delete_roommate_post', { p_post_id: id }, '게시글을 삭제하지 못했어요.')
}

// ── 신고 ──

const toReport = (r) => ({
  id: r.report_id,
  createdAt: r.created_at,
  status: r.status,
  reason: r.reason,
  detail: r.detail,
  targetType: r.target_type,
  postId: r.post_id,
  requestId: r.request_id,
  postState: r.post_state, // open | closed | hidden | deleted
  requestExists: Boolean(r.request_exists),
  snapshot: r.snapshot ?? {},
  adminNote: r.admin_note ?? '',
  reporterId: r.reporter_id,
  reporterEmail: r.reporter_email,
  reportedId: r.reported_id,
  reportedEmail: r.reported_email,
  reportedTotal: num(r.reported_total),
  reportedSuspended: Boolean(r.reported_suspended),
  reportedSuspendedUntil: r.reported_suspended_until,
})

/** status: null(전체) | pending | reviewed | dismissed */
export async function fetchAdminReports({ status = 'pending', page = 1 } = {}) {
  const rows = await call(
    'admin_list_roommate_reports',
    { p_status: status, p_limit: ADMIN_PAGE_SIZE, p_offset: offsetOf(page) },
    '신고를 불러오지 못했어요.',
  )
  return toPage(rows, toReport)
}

/** note: null 이면 그대로, '' 이면 지운다 */
export async function updateAdminReport(id, { status = null, note = null }) {
  await call('admin_update_roommate_report', { p_report_id: id, p_status: status, p_admin_note: note }, '신고를 처리하지 못했어요.')
}

// ── 사용자 ──

const toUser = (r) => ({
  id: r.user_id,
  email: r.email,
  createdAt: r.created_at,
  lastSignInAt: r.last_sign_in_at,
  hasProfile: Boolean(r.has_profile),
  postCount: num(r.post_count),
  requestCount: num(r.request_count),
  reportedCount: num(r.reported_count),
  pendingReportedCount: num(r.pending_reported_count),
  filedCount: num(r.filed_count),
  isSuspended: Boolean(r.is_suspended),
  suspendedUntil: r.suspended_until,
  note: r.note ?? '',
  isAdmin: Boolean(r.is_admin),
})

/** filter: null | reported | suspended | posters | profiles */
export async function fetchAdminUsers({ filter = null, search = '', page = 1 } = {}) {
  const rows = await call(
    'admin_list_users',
    { p_filter: filter, p_search: search || null, p_limit: ADMIN_PAGE_SIZE, p_offset: offsetOf(page) },
    '사용자를 불러오지 못했어요.',
  )
  return toPage(rows, toUser)
}

/**
 * suspended: true 정지 · false 해제 · null 그대로 (메모만)
 * until: 정지 끝나는 시각(ISO) 또는 null(무기한) / note: null 그대로 · '' 지우기
 */
export async function moderateUser(userId, { suspended = null, until = null, note = null }) {
  await call(
    'admin_moderate_user',
    { p_user_id: userId, p_suspended: suspended, p_until: until, p_note: note },
    '이용 정지 상태를 바꾸지 못했어요.',
  )
}

// ── 합격 결과 제보 ──

const toAdmission = (r) => ({
  id: r.id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  userId: r.user_id,
  email: r.email,
  semester: r.semester,
  appliedRoom: r.applied_room,
  result: r.result,
  assignedDormitory: r.assigned_dormitory,
  convertedScore: Number(r.converted_score),
  gender: r.gender,
  collegeCode: r.college_code,
  grade: r.grade,
  isExcluded: Boolean(r.is_excluded),
  adminNote: r.admin_note ?? '',
})

export async function fetchAdminAdmissions({ semester = null, room = null, result = null, excluded = null, page = 1 } = {}) {
  const rows = await call(
    'admin_list_admission_reports',
    {
      p_semester: semester,
      p_room: room,
      p_result: result,
      p_excluded: excluded,
      p_limit: ADMIN_PAGE_SIZE,
      p_offset: offsetOf(page),
    },
    '합격 결과 제보를 불러오지 못했어요.',
  )
  return toPage(rows, toAdmission)
}

export async function updateAdminAdmission(id, { excluded = null, note = null }) {
  await call('admin_update_admission_report', { p_report_id: id, p_excluded: excluded, p_note: note }, '제보를 바꾸지 못했어요.')
}

// ── 기록 ──

/** kind: scores(점수 계산) | predictions(예측 요청) | admin(관리 기록) → { items, total } (items 는 DB 행 그대로) */
export async function fetchActivity(kind, page = 1) {
  const data = await call(
    'admin_list_activity',
    { p_kind: kind, p_limit: ADMIN_PAGE_SIZE, p_offset: offsetOf(page) },
    '기록을 불러오지 못했어요.',
  )
  return { items: data.items ?? [], total: num(data.total) }
}

// ─────────────────────────────────────────────────────────────
// 데모(Supabase 미연결): 이 브라우저의 데이터로 SQL 함수와 같은 모양의 결과를 만든다.
// 개발 서버에서 데모 계정으로 로그인했을 때만 관리자 페이지가 열린다 (hooks/useAdmin.js).
// ─────────────────────────────────────────────────────────────
const KEYS = {
  posts: 'jbnu-dorm:roommate-posts',
  requests: 'jbnu-dorm:roommate-requests',
  blocks: 'jbnu-dorm:roommate-blocks',
  reports: 'jbnu-dorm:roommate-reports',
  profiles: 'jbnu-dorm:roommate-profiles',
  admissions: 'jbnu-dorm:admission-reports',
  logs: 'jbnu-dorm:admin-logs',
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

function fail(hint) {
  const err = new Error(hint)
  err.hint = hint
  throw err
}

const emailOf = (id) => (id === DEMO_USER.id ? DEMO_USER.email : id ? `${String(id).slice(0, 8)}@demo.local` : null)
const nowIso = () => new Date().toISOString()
const newest = (a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
const slice = (rows, { p_limit = ADMIN_PAGE_SIZE, p_offset = 0 }) =>
  rows.slice(p_offset, p_offset + p_limit).map((r) => ({ ...r, total_count: rows.length }))
const contains = (text, q) => String(text ?? '').toLowerCase().includes(q)

function kstDay(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

function localLog(action, targetType, targetId, detail) {
  const logs = read(KEYS.logs, [])
  const entry = { id: Date.now(), created_at: nowIso(), admin_email: DEMO_USER.email, action, target_type: targetType, target_id: String(targetId), detail }
  write(KEYS.logs, [entry, ...logs].slice(0, 200))
}

const allLocalPosts = () => [...read(KEYS.posts, []), ...SAMPLE_POSTS]

function postState(post) {
  if (!post) return 'deleted'
  if (post.isOpen === false) return 'hidden'
  return post.isClosed ? 'closed' : 'open'
}

function localPostRows() {
  const posts = allLocalPosts()
  const reports = read(KEYS.reports, [])
  const requests = read(KEYS.requests, [])
  const moderation = readModeration()
  return posts.map((p) => {
    const mine = reports.filter((r) => r.targetType === 'post' && r.targetId === p.id)
    const mod = moderation[p.authorId]
    return {
      id: p.id,
      created_at: p.createdAt,
      updated_at: p.updatedAt ?? null,
      user_id: p.authorId,
      author_email: emailOf(p.authorId),
      dormitory_code: p.dormitory,
      gender: p.gender,
      age: p.age,
      college_code: p.collegeCode,
      mbti: p.mbti ?? null,
      checklist: p.checklist ?? {},
      content: p.content ?? '',
      semester: p.semester ?? currentSemester(),
      is_closed: Boolean(p.isClosed),
      is_open: p.isOpen !== false,
      request_count: requests.filter((r) => r.postId === p.id).length,
      report_count: mine.length,
      pending_report_count: mine.filter((r) => (r.status ?? 'pending') === 'pending').length,
      author_suspended: isLocallySuspended(p.authorId),
      author_suspended_until: mod?.isSuspended ? (mod.suspendedUntil ?? null) : null,
      author_post_count: posts.filter((o) => o.authorId === p.authorId).length,
    }
  })
}

function editLocalPost(id, patch) {
  if (String(id).startsWith('sample-')) fail('sample')
  const posts = read(KEYS.posts, [])
  const target = posts.find((p) => p.id === id)
  if (!target) fail('not_found')
  write(
    KEYS.posts,
    posts.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p)),
  )
  return target
}

function localUserIds() {
  const ids = new Set([DEMO_USER.id])
  allLocalPosts().forEach((p) => ids.add(p.authorId))
  read(KEYS.requests, []).forEach((r) => ids.add(r.applicantId))
  read(KEYS.reports, []).forEach((r) => {
    ids.add(r.reporterId)
    if (r.reportedId) ids.add(r.reportedId)
  })
  read(KEYS.admissions, []).forEach((r) => ids.add(r.userId))
  Object.keys(read(KEYS.profiles, {})).forEach((id) => ids.add(id))
  Object.keys(readModeration()).forEach((id) => ids.add(id))
  ids.delete(undefined)
  ids.delete(null)
  return [...ids]
}

const LOCAL = {
  admin_overview() {
    const posts = allLocalPosts()
    const requests = read(KEYS.requests, [])
    const reports = read(KEYS.reports, [])
    const admissions = read(KEYS.admissions, [])
    const today = kstDay(nowIso())
    const days = Array.from({ length: 14 }, (_, i) => kstDay(new Date(Date.now() - (13 - i) * 86400000).toISOString()))
    return {
      users: localUserIds().length,
      profiles: Object.keys(read(KEYS.profiles, {})).length,
      posts: posts.length,
      posts_open: posts.filter((p) => p.isOpen !== false && !p.isClosed).length,
      posts_closed: posts.filter((p) => p.isClosed).length,
      posts_hidden: posts.filter((p) => p.isOpen === false).length,
      posts_today: posts.filter((p) => kstDay(p.createdAt) === today).length,
      requests: requests.length,
      requests_today: requests.filter((r) => kstDay(r.createdAt) === today).length,
      blocks: read(KEYS.blocks, []).length,
      reports: reports.length,
      reports_pending: reports.filter((r) => (r.status ?? 'pending') === 'pending').length,
      suspended: Object.keys(readModeration()).filter((id) => isLocallySuspended(id)).length,
      admission_reports: admissions.length,
      admission_excluded: admissions.filter((a) => a.isExcluded).length,
      scores: 0,
      scores_today: 0,
      predictions: 0,
      predictions_today: 0,
      daily: days.map((day) => ({
        day,
        scores: 0,
        predictions: 0,
        posts: posts.filter((p) => kstDay(p.createdAt) === day).length,
        requests: requests.filter((r) => kstDay(r.createdAt) === day).length,
      })),
    }
  },

  admin_list_roommate_posts(a) {
    const q = String(a.p_search ?? '').trim().toLowerCase()
    const rows = localPostRows()
      .filter(
        (r) =>
          (!a.p_semester || r.semester === a.p_semester) &&
          (!a.p_dormitory || r.dormitory_code === a.p_dormitory) &&
          (!a.p_gender || r.gender === a.p_gender) &&
          (!q || contains(r.content, q) || contains(r.author_email, q) || r.id === q || r.user_id === q) &&
          (!a.p_status ||
            (a.p_status === 'open' && r.is_open && !r.is_closed) ||
            (a.p_status === 'closed' && r.is_closed) ||
            (a.p_status === 'hidden' && !r.is_open) ||
            (a.p_status === 'reported' && r.pending_report_count > 0) ||
            (a.p_status === 'suspended' && r.author_suspended)),
      )
      .sort(newest)
    return slice(rows, a)
  },

  admin_update_roommate_post({ p_post_id, p_is_open, p_is_closed }) {
    if (p_is_open == null && p_is_closed == null) fail('invalid')
    const patch = {}
    if (p_is_open != null) patch.isOpen = p_is_open
    if (p_is_closed != null) patch.isClosed = p_is_closed
    const post = editLocalPost(p_post_id, patch)
    const action = p_is_open === false ? 'hide_post' : p_is_open ? 'show_post' : p_is_closed ? 'close_post' : 'reopen_post'
    localLog(action, 'post', p_post_id, { author: emailOf(post.authorId), is_open: p_is_open, is_closed: p_is_closed })
  },

  admin_delete_roommate_post({ p_post_id }) {
    if (String(p_post_id).startsWith('sample-')) fail('sample')
    const posts = read(KEYS.posts, [])
    const post = posts.find((p) => p.id === p_post_id)
    if (!post) fail('not_found')
    write(
      KEYS.posts,
      posts.filter((p) => p.id !== p_post_id),
    )
    write(
      KEYS.requests,
      read(KEYS.requests, []).filter((r) => r.postId !== p_post_id),
    )
    localLog('delete_post', 'post', p_post_id, {
      author: emailOf(post.authorId),
      dormitory: post.dormitory,
      semester: post.semester,
      content: String(post.content ?? '').slice(0, 200),
    })
  },

  admin_list_roommate_reports(a) {
    const reports = read(KEYS.reports, [])
    const requests = read(KEYS.requests, [])
    const posts = allLocalPosts()
    const rows = reports
      .map((r) => {
        const request = r.targetType === 'request' ? requests.find((x) => x.id === r.targetId) : null
        const postId = r.targetType === 'post' ? r.targetId : (request?.postId ?? null)
        const mod = readModeration()[r.reportedId]
        return {
          report_id: r.id,
          created_at: r.createdAt,
          status: r.status ?? 'pending',
          reason: r.reason,
          detail: r.detail ?? null,
          target_type: r.targetType,
          post_id: postId,
          request_id: r.targetType === 'request' ? r.targetId : null,
          post_state: postState(posts.find((p) => p.id === postId)),
          request_exists: Boolean(request),
          snapshot: r.snapshot ?? {},
          admin_note: r.adminNote ?? null,
          reporter_id: r.reporterId,
          reporter_email: emailOf(r.reporterId),
          reported_id: r.reportedId,
          reported_email: emailOf(r.reportedId),
          reported_total: reports.filter((x) => x.reportedId === r.reportedId).length,
          reported_suspended: isLocallySuspended(r.reportedId),
          reported_suspended_until: mod?.isSuspended ? (mod.suspendedUntil ?? null) : null,
        }
      })
      .filter((r) => !a.p_status || r.status === a.p_status)
      .sort(newest)
    return slice(rows, a)
  },

  admin_update_roommate_report({ p_report_id, p_status, p_admin_note }) {
    if (p_admin_note != null && p_admin_note.length > 500) fail('too_long')
    const reports = read(KEYS.reports, [])
    if (!reports.some((r) => r.id === p_report_id)) fail('not_found')
    write(
      KEYS.reports,
      reports.map((r) =>
        r.id === p_report_id
          ? {
              ...r,
              status: p_status ?? r.status ?? 'pending',
              adminNote: p_admin_note == null ? r.adminNote : p_admin_note.trim() || null,
            }
          : r,
      ),
    )
    const action = { reviewed: 'review_report', dismissed: 'dismiss_report', pending: 'reopen_report' }[p_status] ?? 'note_report'
    localLog(action, 'report', p_report_id, { status: p_status, note: p_admin_note })
  },

  admin_list_users(a) {
    const q = String(a.p_search ?? '').trim().toLowerCase()
    const posts = allLocalPosts()
    const requests = read(KEYS.requests, [])
    const reports = read(KEYS.reports, [])
    const profiles = read(KEYS.profiles, {})
    const moderation = readModeration()
    const rows = localUserIds()
      .map((id) => {
        const mod = moderation[id]
        return {
          user_id: id,
          email: emailOf(id),
          created_at: null,
          last_sign_in_at: null,
          has_profile: Boolean(profiles[id]),
          post_count: posts.filter((p) => p.authorId === id).length,
          request_count: requests.filter((r) => r.applicantId === id).length,
          reported_count: reports.filter((r) => r.reportedId === id).length,
          pending_reported_count: reports.filter((r) => r.reportedId === id && (r.status ?? 'pending') === 'pending').length,
          filed_count: reports.filter((r) => r.reporterId === id).length,
          is_suspended: isLocallySuspended(id),
          suspended_until: mod?.isSuspended ? (mod.suspendedUntil ?? null) : null,
          note: mod?.note ?? null,
          is_admin: id === DEMO_USER.id,
        }
      })
      .filter(
        (r) =>
          (!q || contains(r.email, q) || r.user_id === q) &&
          (!a.p_filter ||
            (a.p_filter === 'reported' && r.reported_count > 0) ||
            (a.p_filter === 'suspended' && r.is_suspended) ||
            (a.p_filter === 'posters' && r.post_count > 0) ||
            (a.p_filter === 'profiles' && r.has_profile)),
      )
      .sort((x, y) =>
        a.p_filter === 'reported'
          ? y.pending_reported_count - x.pending_reported_count || y.reported_count - x.reported_count
          : Number(y.user_id === DEMO_USER.id) - Number(x.user_id === DEMO_USER.id),
      )
    return slice(rows, a)
  },

  admin_moderate_user({ p_user_id, p_suspended, p_until, p_note }) {
    if (p_suspended && p_user_id === DEMO_USER.id) fail('self')
    if (p_suspended && p_until && new Date(p_until).getTime() <= Date.now()) fail('until')
    if (p_note != null && p_note.length > 500) fail('too_long')
    if (!localUserIds().includes(p_user_id)) fail('not_found')
    const map = readModeration()
    const prev = map[p_user_id] ?? { isSuspended: false, suspendedUntil: null, note: null }
    map[p_user_id] = {
      isSuspended: p_suspended ?? prev.isSuspended,
      suspendedUntil: p_suspended == null ? prev.suspendedUntil : p_suspended ? (p_until ?? null) : null,
      note: p_note == null ? prev.note : p_note.trim() || null,
      updatedAt: nowIso(),
    }
    writeModeration(map)
    const action = p_suspended ? 'suspend_user' : p_suspended === false ? 'unsuspend_user' : 'note_user'
    localLog(action, 'user', p_user_id, { email: emailOf(p_user_id), until: p_until ?? null, note: p_note })
  },

  admin_list_admission_reports(a) {
    const rows = read(KEYS.admissions, [])
      .map((r) => ({
        id: r.id,
        created_at: r.createdAt,
        updated_at: r.updatedAt ?? null,
        user_id: r.userId,
        email: emailOf(r.userId),
        semester: r.semester,
        applied_room: r.appliedRoom,
        result: r.result,
        assigned_dormitory: r.assignedDormitory ?? null,
        converted_score: r.convertedScore,
        gender: r.gender,
        college_code: r.collegeCode,
        grade: r.grade,
        is_excluded: Boolean(r.isExcluded),
        admin_note: r.adminNote ?? null,
      }))
      .filter(
        (r) =>
          (!a.p_semester || r.semester === a.p_semester) &&
          (!a.p_room || r.applied_room === a.p_room) &&
          (!a.p_result || r.result === a.p_result) &&
          (a.p_excluded == null || r.is_excluded === a.p_excluded),
      )
      .sort(newest)
    return slice(rows, a)
  },

  admin_update_admission_report({ p_report_id, p_excluded, p_note }) {
    if (p_note != null && p_note.length > 500) fail('too_long')
    const list = read(KEYS.admissions, [])
    if (!list.some((r) => r.id === p_report_id)) fail('not_found')
    write(
      KEYS.admissions,
      list.map((r) =>
        r.id === p_report_id
          ? { ...r, isExcluded: p_excluded ?? Boolean(r.isExcluded), adminNote: p_note == null ? r.adminNote : p_note.trim() || null }
          : r,
      ),
    )
    const action = p_excluded ? 'exclude_admission' : p_excluded === false ? 'include_admission' : 'note_admission'
    localLog(action, 'admission_report', p_report_id, { excluded: p_excluded, note: p_note })
  },

  admin_list_activity({ p_kind, p_limit = ADMIN_PAGE_SIZE, p_offset = 0 }) {
    if (p_kind === 'scores' || p_kind === 'predictions') return { total: 0, items: [] }
    if (p_kind !== 'admin') fail('invalid')
    const logs = read(KEYS.logs, [])
    return { total: logs.length, items: logs.slice(p_offset, p_offset + p_limit) }
  },
}

import { isSupabaseConfigured } from '../config.js'
import { readModeration } from './localModeration.js'

// 신고 · 이용 정지 (supabase/migrations/20261008000000_roommate_reports.sql)
// 신고는 운영자만 Supabase Dashboard 에서 본다 (roommate_reports_admin).
// 정지 여부는 운영자가 roommate_moderation.is_suspended 로 정한다.
// Supabase 미연결 시에는 이 브라우저에만 저장 (데모 계정).
export const DETAIL_MAX = 500

export const REPORT_REASONS = [
  { value: 'abuse', label: '욕설·비하·불쾌한 내용' },
  { value: 'fake', label: '거짓 정보' },
  { value: 'spam', label: '광고·홍보·도배' },
  { value: 'privacy', label: '개인정보 노출' },
  { value: 'gender', label: '성별·조건을 속임' },
  { value: 'etc', label: '기타' },
]

const REPORTS_KEY = 'jbnu-dorm:roommate-reports'
const REQUESTS_KEY = 'jbnu-dorm:roommate-requests' // lib/roommateRequests.js

const ERRORS = {
  duplicate: '이미 신고했어요. 운영자가 확인하고 있어요.',
  not_found: '신고할 글을 찾을 수 없어요. 삭제되었을 수 있어요.',
  own: '내 글은 신고할 수 없어요.',
  detail: '기타 사유는 신고 내용을 적어 주세요.',
  reason: '신고 사유를 골라 주세요.',
  too_long: `신고 내용은 ${DETAIL_MAX}자까지 쓸 수 있어요.`,
  suspended: '이용이 정지된 계정이라 신고할 수 없어요.',
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

function validate(reason, detail) {
  if (!REPORT_REASONS.some((r) => r.value === reason)) throw new Error(ERRORS.reason)
  if (reason === 'etc' && !detail) throw new Error(ERRORS.detail)
  if (detail.length > DETAIL_MAX) throw new Error(ERRORS.too_long)
}

function saveLocal(report) {
  const reports = read(REPORTS_KEY, [])
  const same = (r) =>
    r.reporterId === report.reporterId && r.targetType === report.targetType && r.targetId === report.targetId
  if (reports.some(same)) throw new Error(ERRORS.duplicate)
  write(REPORTS_KEY, [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'pending', ...report }, ...reports])
}

async function rpc(name, args) {
  const { supabase } = await import('./supabase.js')
  const { error } = await supabase.rpc(name, args)
  if (error) throw new Error(ERRORS[error.hint] ?? '신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.')
}

/** 게시글 신고 */
export async function reportPost(post, reason, detail, userId) {
  const text = detail.trim()
  validate(reason, text)
  if (post.authorId === userId) throw new Error(ERRORS.own)
  if (!isSupabaseConfigured) {
    return saveLocal({
      reporterId: userId,
      reportedId: post.authorId,
      targetType: 'post',
      targetId: post.id,
      reason,
      detail: text || null,
      snapshot: { content: post.content, checklist: post.checklist },
    })
  }
  await rpc('report_roommate_post', { p_post_id: post.id, p_reason: reason, p_detail: text || null })
}

/** 받은 신청 신고 */
export async function reportRequest(request, reason, detail, userId) {
  const text = detail.trim()
  validate(reason, text)
  if (!isSupabaseConfigured) {
    const target = read(REQUESTS_KEY, []).find((r) => r.id === request.id)
    return saveLocal({
      reporterId: userId,
      reportedId: target?.applicantId ?? null,
      targetType: 'request',
      targetId: request.id,
      reason,
      detail: text || null,
      snapshot: { message: request.message, reply: request.reply },
    })
  }
  await rpc('report_roommate_request', { p_request_id: request.id, p_reason: reason, p_detail: text || null })
}

/** 내 이용 정지 상태 { suspended, until }. userId 는 데모에서만 쓴다 */
export async function fetchMyStatus(userId) {
  if (!isSupabaseConfigured) {
    const m = readModeration()[userId]
    const suspended = Boolean(m?.isSuspended && (!m.suspendedUntil || new Date(m.suspendedUntil) > new Date()))
    return { suspended, until: suspended ? (m.suspendedUntil ?? null) : null }
  }
  const { supabase } = await import('./supabase.js')
  const { data, error } = await supabase.rpc('my_roommate_status')
  if (error || !data?.length) return { suspended: false, until: null }
  return { suspended: Boolean(data[0].suspended), until: data[0].suspended_until }
}

import { REPORT_REASONS } from '../../lib/roommateReports.js'

// 관리 화면의 시각은 모두 한국 시간으로, 연도는 두 자리로 보여 준다: "26. 10. 4. 14:05"
// (DB 는 UTC 시각 전체를 그대로 저장한다. 표시만 줄인다)
const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: '2-digit',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const KST_DATE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric' })

// 잘못된 시각이면 Intl.DateTimeFormat 이 오류를 내므로 먼저 확인한다
const validDate = (iso) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}
export const formatKst = (iso) => {
  const d = validDate(iso)
  return d ? KST.format(d) : '—'
}
export const formatKstDate = (iso) => {
  const d = validDate(iso)
  return d ? KST_DATE.format(d) : '—'
}

/** 신고 당시 내용(snapshot)처럼 모양을 보장할 수 없는 값을 화면에 안전한 글자로 */
export const asText = (value) => (value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value))
export const formatCount = (n) => Number(n ?? 0).toLocaleString('ko-KR')
/** 학점: 3.5 → "3.50", 값이 없으면 "—" */
export const formatGpa = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—')
export const formatGpaRange = (lo, hi) => (Number.isFinite(lo) && Number.isFinite(hi) ? `${formatGpa(lo)} ~ ${formatGpa(hi)}` : '—')

export const reasonLabel = (value) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value

export const POST_STATUS_FILTERS = [
  { value: null, label: '전체' },
  { value: 'open', label: '모집 중' },
  { value: 'closed', label: '모집완료' },
  { value: 'hidden', label: '숨김' },
  { value: 'reported', label: '신고 대기' },
  { value: 'suspended', label: '정지된 사용자' },
]

export const REPORT_STATUS_FILTERS = [
  { value: 'pending', label: '처리 대기' },
  { value: 'reviewed', label: '처리 완료' },
  { value: 'dismissed', label: '기각' },
  { value: null, label: '전체' },
]

export const REPORT_STATUS_LABEL = { pending: '처리 대기', reviewed: '처리 완료', dismissed: '기각' }

export const USER_FILTERS = [
  { value: null, label: '전체' },
  { value: 'reported', label: '신고받은 사용자' },
  { value: 'suspended', label: '정지 중' },
  { value: 'posters', label: '글을 쓴 사용자' },
  { value: 'profiles', label: '체크리스트 등록' },
]

export const POST_STATE_LABEL = { open: '게시 중', closed: '모집완료', hidden: '숨김', deleted: '삭제됨' }

// 관리 기록(admin_logs.action) 이름
export const ACTION_LABEL = {
  hide_post: '글 숨김',
  show_post: '글 다시 보이기',
  close_post: '모집완료로 변경',
  reopen_post: '다시 모집으로 변경',
  delete_post: '글 삭제',
  review_report: '신고 처리 완료',
  dismiss_report: '신고 기각',
  reopen_report: '신고를 대기로 되돌림',
  note_report: '신고 메모',
  suspend_user: '이용 정지',
  unsuspend_user: '정지 해제',
  note_user: '사용자 메모',
  exclude_admission: '제보 학습 제외',
  include_admission: '제보 학습 포함',
  note_admission: '제보 메모',
  enable_support: '후원 메뉴 켜기',
  disable_support: '후원 메뉴 끄기',
  set_roommate_semester: '룸메이트 모집 학기 변경',
}

/** 정지 기한 안내: "2026. 10. 4. 14:00까지" / "무기한" */
export const suspendedUntilLabel = (until) => (until ? `${formatKst(until)}까지` : '무기한')

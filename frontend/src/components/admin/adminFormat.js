import { REPORT_REASONS } from '../../lib/roommateReports.js'

// 관리 화면의 시각은 모두 한국 시간으로 보여 준다 (DB 는 UTC 로 저장)
const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const KST_DATE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' })

export const formatKst = (iso) => (iso ? KST.format(new Date(iso)) : '—')
export const formatKstDate = (iso) => (iso ? KST_DATE.format(new Date(iso)) : '—')
export const formatCount = (n) => Number(n ?? 0).toLocaleString('ko-KR')

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
}

/** 정지 기한 안내: "2026. 10. 4. 14:00까지" / "무기한" */
export const suspendedUntilLabel = (until) => (until ? `${formatKst(until)}까지` : '무기한')

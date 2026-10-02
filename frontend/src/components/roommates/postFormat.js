import { CHECKLIST_ITEMS, answersMatch, normalizeChecklist } from '../../data/roommateChecklist.js'
import { findCollege } from '../../data/colleges.js'
import { DORMITORIES } from '../../data/dormitories.js'

// 한국 시간 기준 시:분 · 월/일 (두 자리)
const KST_TIME = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const KST_DAY = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })
const part = (fmt, date, type) => fmt.formatToParts(date).find((p) => p.type === type)?.value ?? ''

/**
 * 글·신청을 올린 시각
 *   · 1분 전까지: "방금 전" · 1시간 전까지: "12분 전"
 *   · 24시간 전까지: 올린 시각 "14:05" · 그보다 전: 올린 날짜 "05/12"
 */
export function timeAgo(iso) {
  // 시각이 없거나 잘못됐으면 비워 둔다 (Intl 은 잘못된 날짜면 오류를 낸다)
  if (!iso) return ''
  const date = new Date(iso)
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (!Number.isFinite(minutes)) return ''
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (minutes <= 24 * 60) return `${part(KST_TIME, date, 'hour')}:${part(KST_TIME, date, 'minute')}`
  return `${part(KST_DAY, date, 'month')}/${part(KST_DAY, date, 'day')}`
}

export const dormName = (code) => DORMITORIES.find((d) => d.code === code)?.name ?? code
/** 카드 · 자세히 보기 제목: "창의관 1인실" (호실을 모르는 예전 글은 "창의관") */
export const dormTitle = (post) => [dormName(post.dormitory), post.roomType].filter(Boolean).join(' ')
/** 이 호관의 호실 유형 (예: 창의관 → ['1인실', '2인실']) */
export const dormRooms = (code) => DORMITORIES.find((d) => d.code === code)?.rooms ?? []
export const collegeName = (code) => findCollege(code)?.name ?? ''
export const genderLabel = (gender) => (gender === '여' ? '여자' : '남자')

/** 내 정보와 맞는 항목 수 (예: 12 → "나와 12/15 일치"). 자리 항목은 서로 달라야 일치 (answersMatch) */
export function matchCount(mine, theirs) {
  if (!mine || !theirs) return null
  const a = normalizeChecklist(mine)
  const b = normalizeChecklist(theirs)
  return CHECKLIST_ITEMS.filter((i) => answersMatch(i, a[i.key], b[i.key])).length
}

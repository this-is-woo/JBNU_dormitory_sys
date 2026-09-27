import { semesterLabel } from '../../lib/semester.js'
import { collegeName, dormName } from '../roommates/postFormat.js'

// 채팅 화면 공통 표기. 시각은 모두 한국 시간
const KST_PARTS = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function kst(iso) {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return null
  const p = Object.fromEntries(KST_PARTS.formatToParts(date).map((x) => [x.type, x.value]))
  return p
}

/** "2026.09.23" (날짜 구분선) */
export const dayLabel = (iso) => {
  const p = kst(iso)
  return p ? `${p.year}.${p.month}.${p.day}` : ''
}

/** "00:18" (말풍선 옆 시각) */
export const clockLabel = (iso) => {
  const p = kst(iso)
  return p ? `${p.hour}:${p.minute}` : ''
}

/** 상대를 부르는 말: 내가 글쓴이면 상대는 신청자, 내가 신청자면 상대는 글쓴이 */
export const counterpartRole = (thread) => (thread.role === 'author' ? '신청자' : '글쓴이')

/** 대화방 이름: 받은 신청은 신청자 정보, 보낸 신청은 신청한 글 */
export function threadTitle(thread) {
  if (thread.role === 'applicant') return `${dormName(thread.dormitory)} 룸메이트 글`
  const c = thread.counterpart
  if (!c) return '내 정보를 삭제한 신청자'
  return [collegeName(c.collegeCode), c.age && `${c.age}세`].filter(Boolean).join(' · ')
}

/** 대화방 부제: "받은 신청 · 대동관 · 2027년 1학기" (첫 메시지를 보내기 전이면 "새 채팅") */
export function threadContext(thread) {
  return [
    thread.draft ? '새 채팅' : thread.role === 'author' ? '받은 신청' : '보낸 신청',
    dormName(thread.dormitory),
    thread.semester && semesterLabel(thread.semester),
  ]
    .filter(Boolean)
    .join(' · ')
}

export const DELETED_TEXT = '삭제된 메시지입니다.'

/** 목록의 마지막 메시지 미리보기 */
export function previewText(thread) {
  const m = thread.lastMessage
  if (!m) return '아직 메시지가 없어요.'
  if (m.deletedAt) return DELETED_TEXT
  if (m.kind === 'request') {
    if (m.body) return m.body
    return thread.role === 'applicant' ? '룸메 신청을 보냈어요.' : '룸메 신청이 왔어요.'
  }
  return m.body
}

/** 답장 인용 한 줄 (길면 자른다) */
export function quoteText(message) {
  if (!message) return '이전 메시지'
  if (message.deletedAt) return DELETED_TEXT
  const text = (message.body ?? '룸메 신청').replace(/\s+/g, ' ').trim()
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

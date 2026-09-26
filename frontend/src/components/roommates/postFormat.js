import { CHECKLIST_ITEMS, isAnswered } from '../../data/roommateChecklist.js'
import { findCollege } from '../../data/colleges.js'
import { DORMITORIES } from '../../data/dormitories.js'

const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' })

export function timeAgo(iso) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (minutes > -1) return '방금 전'
  if (minutes > -60) return rtf.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours > -24) return rtf.format(hours, 'hour')
  return rtf.format(Math.round(hours / 24), 'day')
}


export const dormName = (code) => DORMITORIES.find((d) => d.code === code)?.name ?? code
export const collegeName = (code) => findCollege(code)?.name ?? ''
export const genderLabel = (gender) => (gender === '여' ? '여자' : '남자')

/** 내 체크리스트와 같은 답의 수 (예: 12 → "나와 12/18 일치") */
export function matchCount(mine, theirs) {
  if (!mine || !theirs) return null
  return CHECKLIST_ITEMS.filter((i) => isAnswered(mine[i.key]) && mine[i.key] === theirs[i.key]).length
}

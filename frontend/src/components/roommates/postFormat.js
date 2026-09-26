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

export const isLink = (text) => /^https?:\/\/\S+$/.test(text)

export const dormName = (code) => DORMITORIES.find((d) => d.code === code)?.name ?? code
export const collegeName = (code) => findCollege(code)?.name ?? ''
export const genderLabel = (gender) => (gender === '여' ? '여자' : '남자')

/** 카드에 보여줄 핵심 항목 */
export function highlights(checklist = {}) {
  const items = [
    { label: checklist.smoking ? '흡연' : '비흡연', warn: checklist.smoking },
    { label: checklist.sleepHabit ? '잠버릇 있음' : '잠버릇 없음', warn: checklist.sleepHabit },
  ]
  if (checklist.bedtime && checklist.wakeup) items.push({ label: `취침 ${checklist.bedtime} · 기상 ${checklist.wakeup}` })
  if (checklist.roomCleaning) items.push({ label: `방 청소 ${checklist.roomCleaning}` })
  if (checklist.relationship) items.push({ label: checklist.relationship })
  return items
}

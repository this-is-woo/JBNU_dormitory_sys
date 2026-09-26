// 합격 결과 제보 선택지 (supabase/migrations/20260930000000_admission_reports.sql 의 CHECK 제약과 같아야 합니다)
import { findCollege } from './colleges.js'

// 지원 자격: backend/app/dormitories.py 의 eligible_rooms() 와 같은 규칙
const MEDICAL = ['medicine', 'nursing']
const NOT_GENERAL = ['law'] // 창의관만 지원 가능

/**
 * 지원한 호실 유형.
 * B타입 2인실은 대동·새빛·한빛관을 한꺼번에 선발한 뒤 점수 순으로 배정하므로 하나로 받고,
 * 합격하면 배정된 호관(halls)을 따로 고른다.
 */
export const APPLY_ROOMS = [
  { code: 'changui_1', label: '창의관 1인실', genders: ['남', '여'], colleges: 'all' },
  { code: 'changui_2', label: '창의관 2인실', genders: ['남', '여'], colleges: 'all' },
  {
    code: 'b_2',
    label: 'B타입 2인실',
    hint: '대동·새빛·한빛관',
    genders: ['남', '여'],
    colleges: 'general',
    halls: [
      { code: 'hanbit', label: '한빛관', genders: ['남'] },
      { code: 'saebit', label: '새빛관', genders: ['남', '여'] },
      { code: 'daedong', label: '대동관', genders: ['남'] },
    ],
  },
  { code: 'hanbit_6', label: '한빛관 6인실', genders: ['남'], colleges: 'general' },
  { code: 'chambit_2', label: '참빛관 2인실', genders: ['남', '여'], colleges: 'general' },
  { code: 'hyemin_1', label: '혜민관 1인실', genders: ['남', '여'], colleges: 'medical' },
  { code: 'hyemin_2', label: '혜민관 2인실', genders: ['남', '여'], colleges: 'medical' },
]

export const findApplyRoom = (code) => APPLY_ROOMS.find((r) => r.code === code) ?? null

function collegeAllowed(room, collegeCode) {
  const college = findCollege(collegeCode)
  if (!college || college.specialCampus) return false
  if (room.colleges === 'all') return true
  if (room.colleges === 'medical') return MEDICAL.includes(collegeCode)
  return !NOT_GENERAL.includes(collegeCode)
}

/** 성별·단과대학으로 지원할 수 있는 호실인지 (아직 안 골랐으면 통과) */
export function canApply(room, { gender, collegeCode }) {
  return (!gender || room.genders.includes(gender)) && (!collegeCode || collegeAllowed(room, collegeCode))
}

export const RESULTS = [
  { value: 'accepted', label: '합격' },
  { value: 'waitlist', label: '추가 합격', hint: '예비 번호를 받고 나중에 합격' },
  { value: 'rejected', label: '불합격' },
]

export const GRADES = [
  { value: 'freshman', label: '신입생', hint: '입학 전·첫 학기에 지원' },
  { value: '1', label: '1학년' },
  { value: '2', label: '2학년' },
  { value: '3', label: '3학년' },
  { value: '4', label: '4학년 이상' },
  { value: 'graduate', label: '대학원생' },
]

export const semesterLabel = (value) => {
  const [year, term] = value.split('-')
  return `${year}년 ${term}학기`
}

/**
 * 제보할 수 있는 학기: 지난 2년 + 이번 학기 (최신순).
 * 2학기 선발은 6월께, 다음 해 1학기 선발은 12월께 발표되므로 그때부터 목록에 넣는다.
 */
export function semesterOptions(now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const list = []
  if (month >= 12) list.push(`${year + 1}-1`)
  if (month >= 6) list.push(`${year}-2`)
  list.push(`${year}-1`)
  for (let y = year - 1; y >= year - 2; y -= 1) list.push(`${y}-2`, `${y}-1`)
  return list
}

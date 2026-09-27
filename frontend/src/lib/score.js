// 전북대 생활관 선발 환산점수 계산.
// 백엔드 backend/app/services/scoring.py 와 같은 규칙을 유지해야 합니다.

export const GPA_MIN = 1.0
export const GPA_MAX = 4.5
export const POINT_MAX = 99
export const POINT_WEIGHT = 0.009

const GPA_PATTERN = /^[1-4](\.\d{0,2})?$/ // 1.0 ~ 4.x, 소수 둘째 자리까지
const POINT_PATTERN = /^\d{1,2}$/ // 0 ~ 99

/** 입력 중인 학점 문자열이 1.0 ~ 4.5 범위를 벗어나지 않는지 (빈 값·"3." 같은 입력 중 상태 허용) */
export function isGpaInputAllowed(value) {
  return value === '' || (GPA_PATTERN.test(value) && Number(value) <= GPA_MAX)
}

/** 상점/벌점 입력 문자열이 0 ~ 99 정수인지 */
export function isPointInputAllowed(value) {
  return value === '' || POINT_PATTERN.test(value)
}

/** "07" → "7" */
export function normalizePoint(value) {
  return value === '' ? '' : String(Number(value))
}

export function parseGpa(value) {
  if (value === '') return null
  const n = Number(value)
  return n >= GPA_MIN && n <= GPA_MAX ? n : null
}

export function parsePoint(value) {
  return value === '' ? 0 : Number(value)
}

/** 소수점 셋째 자리에서 반올림 */
export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100

/** 성적점수 = ((학점 + (상점 × 0.009 − 벌점 × 0.009)) / 4.5) × 90 */
export function calcGradeScore(gpa, merit, demerit) {
  return ((gpa + (merit * POINT_WEIGHT - demerit * POINT_WEIGHT)) / GPA_MAX) * 90
}

/** 환산점수 = 성적점수 + 거리점수(5 ~ 10점) */
export function calcScoreBreakdown({ gpa, merit, demerit, distanceScore }) {
  const gradeScore = calcGradeScore(gpa, merit, demerit)
  return {
    gradeScore: round2(gradeScore),
    distanceScore,
    convertedScore: round2(gradeScore + distanceScore),
  }
}

export const formatScore = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—')

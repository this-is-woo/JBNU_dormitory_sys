// 학기 표기: 'YYYY-1' | 'YYYY-2'
// 1학기 3~8월, 2학기 9월~다음 해 2월 (1~2월은 전년도 2학기)

export function currentSemester(now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 9) return `${year}-2`
  if (month <= 2) return `${year - 1}-2`
  return `${year}-1`
}

export function nextSemester(semester) {
  const [year, term] = semester.split('-').map(Number)
  return term === 1 ? `${year}-2` : `${year + 1}-1`
}

export function previousSemester(semester) {
  const [year, term] = semester.split('-').map(Number)
  return term === 2 ? `${year}-1` : `${year - 1}-2`
}

export const semesterLabel = (value) => {
  const [year, term] = value.split('-')
  return `${year}년 ${term}학기`
}

/** 룸메이트 글을 쓸 수 있는 학기: 이번 학기 + 다음 학기 한 학기 미리 */
export function writableSemesters(now = new Date()) {
  const current = currentSemester(now)
  return [current, nextSemester(current)]
}

/** 룸메이트 찾기 사이드바의 학기 필터: 다음 학기 · 이번 학기 · 지난 학기 (최신순) */
export function browsableSemesters(now = new Date()) {
  const current = currentSemester(now)
  return [nextSemester(current), current, previousSemester(current)]
}

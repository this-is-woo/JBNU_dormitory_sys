// 「2026학년도 2학기 생활관비 안내」 기준 (참빛관 1인실(장애인실)·3인실, 창의관 기혼자숙소는 일반 선발이 아니라 제외). 매 학기 확인해 갱신하세요.
// Supabase 를 연결하면 `dormitories` · `dormitory_rooms` 테이블 값이 우선 사용됩니다. (supabase/migrations 참고)
// 호실 유형 code(예: changui_1)는 backend/app/dormitories.py 와 같아야 합니다.

export const SELECTION_TYPES = {
  A: { label: 'A타입', summary: '참빛관 단독 선발' },
  B: { label: 'B타입', summary: '대동·새빛·한빛관 호관 통합 선발 후 고득점순 배정' },
  C: { label: 'C타입', summary: '의과대학·간호대학 전용' },
  D: { label: 'D타입', summary: '1인실이 있는 창의관 — 모든 단과대학 지원 가능' },
}

// 생활관 공식 홈페이지의 호관별 소개 페이지
const infoUrl = (menu) => `https://likehome.jbnu.ac.kr/home/main/inner.php?sMenu=${menu}`

// 호실 유형은 인기(합격선) 높은 순
export const DORMITORIES = [
  {
    code: 'changui',
    infoUrl: infoUrl('C9000'),
    name: '창의관',
    type: 'D',
    genders: ['남', '여'],
    rooms: ['1인실', '2인실'],
    meal: '급식 없음',
    eligibility: '모든 단과대학 (치과대학·약학대학·법학전문대학원 포함)',
  },
  {
    code: 'hanbit',
    infoUrl: infoUrl('C6000'),
    name: '한빛관',
    type: 'B',
    genders: ['남'],
    rooms: ['2인실', '4인실'],
    meal: '직영급식 (미선택 가능)',
    eligibility: '학부 · 일반대학원',
  },
  {
    code: 'saebit',
    infoUrl: infoUrl('C5000'),
    name: '새빛관',
    type: 'B',
    genders: ['여'],
    rooms: ['2인실'],
    meal: '직영급식 (미선택 가능)',
    eligibility: '학부 · 일반대학원',
  },
  {
    code: 'daedong',
    infoUrl: infoUrl('C2000'),
    name: '대동관',
    type: 'B',
    genders: ['남'],
    rooms: ['2인실'],
    meal: '직영급식 (미선택 가능)',
    eligibility: '학부 · 일반대학원',
  },
  {
    code: 'chambit',
    infoUrl: infoUrl('C3000'),
    name: '참빛관',
    type: 'A',
    genders: ['남', '여'],
    rooms: ['2인실'],
    meal: '참빛관 식당',
    eligibility: '학부 · 일반대학원',
  },
  {
    code: 'hyemin',
    infoUrl: infoUrl('C4000'),
    name: '혜민관',
    type: 'C',
    genders: ['남', '여'],
    rooms: ['1인실', '2인실'],
    meal: '급식 없음',
    eligibility: '의과대학 · 간호대학',
  },
]

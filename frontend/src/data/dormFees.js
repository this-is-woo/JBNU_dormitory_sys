// 생활관비 · 방학 관리비 · 식당 이용 시간
// 출처: 전북대학교 생활관 홈페이지 「생활관비 안내」 (아래 FEE_SOURCE). 학기마다 공지를 보고 갱신하세요.
// 금액은 원 단위, 해당 없음은 null
// 일반 선발이 아닌 참빛관 1인실(장애인실)·3인실, 창의관 기혼자숙소는 제외했다.

export const FEE_SOURCE = {
  label: '전북대학교 생활관 「생활관비 안내」',
  url: 'https://likehome.jbnu.ac.kr/home/main/inner.php?sMenu=inner_D1000_copy',
  checkedAt: '2026-09-26',
}

const 직영급식 = '직영급식 (미선택 가능)'

/** 2026학년도 2학기 생활관비. 관리비 116일, 급식비 직영 76일 · BTL 79일 (3식 기준) */
export const SEMESTER_FEES = {
  title: '2026학년도 2학기 생활관비',
  columns: { managementDays: '116일', mealDays: '직영 76일 · BTL 79일' },
  payment: [
    '전액 또는 분할 납부 (외국인은 분할 납부 불가)',
    '현금(가상계좌) 납부 또는 카드(전북은행 신용·체크카드만 가능) 결제',
  ],
  groups: [
    {
      dorm: '대동관',
      campus: '전주 · 직영',
      note: 직영급식,
      rows: [
        { room: '2인실 (1층)', dayFee: 5720, termFee: 663520, mealDay: 13110, mealTerm: 996360, utility: null, total: 1659880 },
        { room: '2인실', dayFee: 5000, termFee: 580000, mealDay: 13110, mealTerm: 996360, utility: null, total: 1576360 },
        { room: '3인실', dayFee: null, termFee: null, mealDay: null, mealTerm: null, utility: null, total: null },
      ],
    },
    {
      dorm: '참빛관',
      campus: '전주 · BTL',
      note: '참빛관 식당',
      rows: [
        { room: '2인실', dayFee: 6880, termFee: 798080, mealDay: 8970, mealTerm: 708630, utility: null, total: 1506710 },
      ],
    },
    {
      dorm: '혜민관',
      campus: '전주 · BTL',
      note: null,
      rows: [
        { room: '2인실', dayFee: 6270, termFee: 727320, mealDay: null, mealTerm: null, utility: null, total: 727320 },
        { room: '1인실', dayFee: 12560, termFee: 1456960, mealDay: null, mealTerm: null, utility: null, total: 1456960 },
      ],
    },
    {
      dorm: '새빛관',
      campus: '전주 · BTL',
      note: 직영급식,
      rows: [{ room: '2인실', dayFee: 6410, termFee: 743560, mealDay: 13110, mealTerm: 996360, utility: null, total: 1739920 }],
    },
    {
      dorm: '한빛관',
      campus: '전주 · BTL',
      note: 직영급식,
      rows: [
        { room: '2인실', dayFee: 5170, termFee: 599720, mealDay: 13110, mealTerm: 996360, utility: 200000, total: 1796080 },
        { room: '4인실', dayFee: 5950, termFee: 690200, mealDay: 13110, mealTerm: 996360, utility: 200000, total: 1886560 },
      ],
    },
    {
      dorm: '창의관',
      campus: '전주 · BTL',
      note: null,
      rows: [
        { room: '2인실', dayFee: 5830, termFee: 676280, mealDay: null, mealTerm: null, utility: 200000, total: 876280 },
        { room: '1인실', dayFee: 11670, termFee: 1353720, mealDay: null, mealTerm: null, utility: 200000, total: 1553720 },
      ],
    },
    {
      dorm: '청운관',
      campus: '익산 · 직영',
      note: null,
      rows: [{ room: '2인실', dayFee: 7500, termFee: 870000, mealDay: null, mealTerm: null, utility: null, total: 870000 }],
    },
  ],
}

const 참빛위탁식당 = '참빛관 위탁식당 1일 8,970원 (1식 2,990원) 선택 이용 가능'

/** 2026학년도 생활관 특별개관(방학 중) 겨울방학 관리비. 관리비 56일, 급식비 BTL 30일 */
export const WINTER_FEES = {
  title: '2026학년도 겨울방학 특별개관 관리비',
  columns: { managementDays: '56일', mealDays: 'BTL 30일' },
  groups: [
    {
      dorm: '대동관',
      campus: '전주 · 직영',
      note: null,
      rows: [
        { room: '2인실 (1층)', dayFee: 5720, termFee: 320320, mealDay: null, mealTerm: null, total: 320320 },
        { room: '2인실', dayFee: 5000, termFee: 280000, mealDay: null, mealTerm: null, total: 280000 },
      ],
    },
    {
      dorm: '참빛관',
      campus: '전주 · BTL',
      note: 참빛위탁식당,
      rows: [
        { room: '2인실', dayFee: 6880, termFee: 385280, mealDay: 8970, mealTerm: 269100, total: 654700 },
      ],
    },
    {
      dorm: '새빛관',
      campus: '전주 · BTL',
      note: null,
      rows: [{ room: '2인실', dayFee: 6410, termFee: 358900, mealDay: null, mealTerm: null, total: 358900 }],
    },
    {
      dorm: '한빛관',
      campus: '전주 · BTL',
      note: null,
      rows: [
        { room: '2인실', dayFee: 7050, termFee: 394800, mealDay: null, mealTerm: null, total: 394800 },
        { room: '4인실', dayFee: 8770, termFee: 491100, mealDay: null, mealTerm: null, total: 491100 },
      ],
    },
    {
      dorm: '혜민관',
      campus: '전주 · BTL',
      note: null,
      rows: [
        { room: '2인실', dayFee: 6270, termFee: 351100, mealDay: null, mealTerm: null, total: 351100 },
        { room: '1인실', dayFee: 12560, termFee: 703300, mealDay: null, mealTerm: null, total: 703300 },
      ],
    },
    {
      dorm: '창의관',
      campus: '전주 · BTL',
      note: null,
      rows: [
        { room: '2인실', dayFee: 8010, termFee: 448500, mealDay: null, mealTerm: null, total: 448500 },
        { room: '1인실', dayFee: 16040, termFee: 898200, mealDay: null, mealTerm: null, total: 898200 },
      ],
    },
    {
      dorm: '청운관',
      campus: '익산 · 직영',
      note: null,
      rows: [{ room: '2인실', dayFee: 7500, termFee: 420000, mealDay: null, mealTerm: null, total: 420000 }],
    },
  ],
}

/** 식사 시간. cols 순서: 학기 중 대동·새빛·한빛 월~금 / 학기 중 참빛 월~금 · 토 · 일(공휴일) / 방학 기간 */
export const MEAL_TIMES = {
  title: '식당 이용 시간',
  columns: [
    { group: '학기 중 · 대동·새빛·한빛관', label: '월~금' },
    { group: '학기 중 · 참빛관', label: '월~금' },
    { group: '학기 중 · 참빛관', label: '토요일' },
    { group: '학기 중 · 참빛관', label: '일요일 (공휴일)' },
    { group: '방학 기간', label: '방학 중' },
  ],
  rows: [
    { meal: '아침', times: ['07:30 ~ 09:00', '07:30 ~ 09:00', '07:30 ~ 09:00', '07:30 ~ 09:00', '07:30 ~ 09:00'] },
    { meal: '점심', times: ['11:45 ~ 13:45', '11:45 ~ 13:45', '11:45 ~ 13:45', '11:45 ~ 13:45', '12:00 ~ 13:30'] },
    { meal: '저녁', times: ['17:30 ~ 19:00', '17:30 ~ 19:00', '17:30 ~ 18:30', '17:30 ~ 18:30', '17:30 ~ 19:00'] },
  ],
  places: [
    { label: '대동·새빛·한빛관', text: '관리동 식당 (월~금), 참빛관 식당 (토·일)' },
    { label: '참빛관', text: '참빛관 식당' },
  ],
}

// 「전북대 룸메이트 체크리스트 ver.4」 항목.
// 답변은 roommate_posts.checklist(jsonb)에 { key: 값 } 으로 저장됩니다.
//   type 'ox'  → true(O) / false(X)
//   options    → 선택한 문구 그대로 저장

const CLEANING = ['매일', '일주일에 한 번', '일주일에 2-3번', '일주일에 4-5번', '더러울 때만']

export const CHECKLIST_SECTIONS = [
  {
    title: '생활 습관',
    items: [
      { key: 'smoking', label: '흡연', type: 'ox' },
      { key: 'sleepHabit', label: '잠버릇', type: 'ox' },
      { key: 'deepSleeper', label: '잠귀가 어둡나요?', type: 'ox' },
      { key: 'mealPlan', label: '의무식', type: 'ox' },
      { key: 'lateSnack', label: '야식', type: 'ox' },
      { key: 'earphones', label: '소음이 나는 취미(게임, 노래 듣기 등)는 이어폰 사용', type: 'ox' },
    ],
  },
  {
    title: '시간',
    items: [
      { key: 'bedtime', label: '취침 시간', options: ['10시 이전', '10-11시', '11-12시', '12-1시', '1시 이후'] },
      { key: 'wakeup', label: '기상 시간', options: ['6시 이전', '6-7시', '7-8시', '8-9시', '9-10시', '10시 이후'] },
      { key: 'lampOff', label: '야간 공부할 때 스탠드 끄는 시간', options: ['11시 이전', '11-12시', '12-1시'] },
    ],
  },
  {
    title: '청소 · 위생',
    items: [
      { key: 'roomCleaning', label: '방 청소 주기', options: CLEANING },
      { key: 'bathroomCleaning', label: '화장실 청소 주기', options: CLEANING },
      { key: 'sharedTrash', label: '방 쓰레기통 공유', type: 'ox' },
      {
        key: 'recycling',
        label: '분리수거',
        options: ['분리수거함을 놓고 한 번에 버린다', '생길 때마다 각자 치운다'],
      },
    ],
  },
  {
    title: '관계 · 공유',
    items: [
      {
        key: 'relationship',
        label: '원하는 룸메이트와의 관계',
        options: ['베스트 프렌드', '중간', '베스트 프렌드와 중간 사이', '비즈니스 관계'],
      },
      {
        key: 'phoneCalls',
        label: '룸메이트의 방 안 전화 통화',
        options: ['무조건 밖에서', '배달 전화만', '(부모님과의) 짧은 전화만', '짧은 전화만', '상관 없음'],
      },
      { key: 'sharing', label: '물건 공유', options: ['절대 안 돼', '허락 맡고 가능', '상관 없음'] },
      { key: 'friendsOver', label: '친구 초대', type: 'ox' },
      {
        key: 'seat',
        label: '원하는 침대/책상 자리',
        options: ['문과 마주보는, 에어컨 없는 자리', '문과 마주보지 않는, 에어컨 직방 자리', '상관 없음'],
      },
    ],
  },
]

export const CHECKLIST_ITEMS = CHECKLIST_SECTIONS.flatMap((s) => s.items)

/** 번호는 섹션을 가로질러 1부터 차례로 */
export const itemNumber = (key) => CHECKLIST_ITEMS.findIndex((i) => i.key === key) + 1

export const isAnswered = (value) => value !== undefined && value !== null && value !== ''

export function answerLabel(item, value) {
  if (!isAnswered(value)) return '—'
  if (item.type === 'ox') return value ? 'O' : 'X'
  // 예상 밖의 값(객체 등)이 저장돼 있어도 화면이 멈추지 않게 글자로 바꿔 보여 준다
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** 취침 시간 필터: 12시 이전(10시 이전·10-11·11-12) / 12시 이후 */
export const EARLY_BEDTIMES = ['10시 이전', '10-11시', '11-12시']

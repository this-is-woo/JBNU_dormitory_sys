// 「전북대 룸메이트 체크리스트 ver.4」 항목.
// 답변은 roommate_posts.checklist(jsonb)에 { key: 값 } 으로 저장됩니다.
//   type 'ox'    → true(O) / false(X)
//   options      → 선택한 문구 그대로 저장
//   type 'multi' → 고른 문구 배열 (예: ['코골이', '잠꼬대']). none 을 고르면 [none] 하나만
// 항목·선택지를 바꾸면 예전 답은 normalizeChecklist 가 새 형식으로 옮긴다
// (DB 에 저장된 답은 supabase/migrations/20261014000000_checklist_v5.sql 이 한 번에 옮김)

// 취침 시간·스탠드 끄는 시간은 24시 형태 (밤 12시 = 24시)
const BEDTIMES = ['22시 이전', '22-23시', '23-24시', '24-1시', '1시 이후']
const CLEANING = ['매일', '일주일에 한 번', '일주일에 2-3번', '일주일에 4-5번', '더러울 때만']

export const CHECKLIST_SECTIONS = [
  {
    title: '생활 습관',
    items: [
      { key: 'smoking', label: '흡연', type: 'ox' },
      { key: 'sleepHabit', label: '잠버릇', type: 'multi', options: ['코골이', '이갈이', '잠꼬대', '기타'], none: '없음' },
      { key: 'deepSleeper', label: '잠귀가 어둡나요?', type: 'ox' },
      { key: 'lateSnack', label: '야식', type: 'ox' },
    ],
  },
  {
    title: '시간',
    items: [
      { key: 'bedtime', label: '취침 시간', options: BEDTIMES },
      { key: 'wakeup', label: '기상 시간', options: ['6시 이전', '6-7시', '7-8시', '8-9시', '9-10시', '10시 이후'] },
      { key: 'lampOff', label: '야간 공부할 때 스탠드 끄는 시간', options: ['23시 이전', '23-24시', '24-1시'] },
    ],
  },
  {
    title: '청소 · 위생',
    items: [
      { key: 'roomCleaning', label: '방 청소 주기', options: CLEANING },
      { key: 'bathroomCleaning', label: '화장실 청소 주기', options: CLEANING },
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
        options: ['베스트 프렌드', '중간', '베스트 프렌드와 중간 사이', '비즈니스'],
      },
      {
        key: 'phoneCalls',
        label: '룸메이트의 방 안 전화 통화',
        options: ['무조건 밖에서', '(부모님과의) 짧은 전화만', '짧은 전화만', '상관 없음'],
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

export const isAnswered = (value) =>
  value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)

// ── 예전 답 → 새 형식 (체크리스트 ver.4 → 지금) ──
const REMOVED_KEYS = ['mealPlan', 'earphones', 'sharedTrash']
const LEGACY_VALUES = {
  bedtime: { '10시 이전': '22시 이전', '10-11시': '22-23시', '11-12시': '23-24시', '12-1시': '24-1시' },
  lampOff: { '11시 이전': '23시 이전', '11-12시': '23-24시', '12-1시': '24-1시' },
  relationship: { '비즈니스 관계': '비즈니스' },
}

/**
 * 저장된 답을 지금 항목에 맞게 바꾼다. 옮길 수 없는 답은 비운다(다시 고르게).
 *   · 잠버릇 X → ['없음'], 잠버릇 O → 비움 (어떤 잠버릇인지 알 수 없음)
 *   · 없어진 선택지(배달 전화만)·항목(의무식·이어폰·쓰레기통 공유) → 비움/삭제
 */
export function normalizeChecklist(checklist) {
  if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist)) return {}
  const out = { ...checklist }
  REMOVED_KEYS.forEach((key) => delete out[key])
  for (const [key, map] of Object.entries(LEGACY_VALUES)) {
    if (out[key] in map) out[key] = map[out[key]]
  }
  if (out.sleepHabit === false) out.sleepHabit = ['없음']
  for (const item of CHECKLIST_ITEMS) {
    const value = out[item.key]
    if (!isAnswered(value)) continue
    const ok =
      item.type === 'ox'
        ? typeof value === 'boolean'
        : item.type === 'multi'
          ? Array.isArray(value) && value.every((v) => v === item.none || item.options.includes(v))
          : item.options.includes(value)
    if (!ok) delete out[item.key]
  }
  return out
}

/** 복수 선택 항목에서 선택지 하나를 누를 때: '없음'은 혼자만, 다른 것을 고르면 '없음'은 빠진다 */
export function toggleMulti(item, current, option) {
  const list = Array.isArray(current) ? current : []
  if (option === item.none) return list.includes(item.none) ? [] : [item.none]
  const rest = list.filter((v) => v !== item.none)
  const next = rest.includes(option) ? rest.filter((v) => v !== option) : [...rest, option]
  // 선택지 순서대로 저장해 비교·표시가 흔들리지 않게
  return item.options.filter((o) => next.includes(o))
}

/** 두 답이 같은지 (복수 선택은 고른 것이 모두 같아야 같음) */
export function sameAnswer(a, b) {
  if (!isAnswered(a) || !isAnswered(b)) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v) => b.includes(v))
  }
  return a === b
}

export function answerLabel(item, value) {
  if (!isAnswered(value)) return '—'
  if (item.type === 'ox') return value ? 'O' : 'X'
  if (Array.isArray(value)) return value.join(', ')
  // 예상 밖의 값(객체 등)이 저장돼 있어도 화면이 멈추지 않게 글자로 바꿔 보여 준다
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** 취침 시간 필터: 24시 이전(22시 이전·22-23·23-24) / 24시 이후 */
export const EARLY_BEDTIMES = ['22시 이전', '22-23시', '23-24시']

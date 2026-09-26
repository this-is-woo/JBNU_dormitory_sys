import { CHECKLIST_ITEMS, CHECKLIST_SECTIONS, answerLabel, isAnswered, itemNumber } from '../../data/roommateChecklist.js'

const same = (mine, theirs, key) => isAnswered(mine?.[key]) && mine[key] === theirs?.[key]

/** 일치도 단계: 색과 한마디 */
export function matchLevel(match) {
  const ratio = match / CHECKLIST_ITEMS.length
  if (ratio >= 0.7) return { tone: 'high', label: '잘 맞아요' }
  if (ratio >= 0.45) return { tone: 'mid', label: '무난해요' }
  return { tone: 'low', label: '차이가 있어요' }
}

/** 섹션별 일치 수 */
export function sectionMatches(mine, theirs) {
  return CHECKLIST_SECTIONS.map((s) => ({
    title: s.title,
    total: s.items.length,
    match: s.items.filter((i) => same(mine, theirs, i.key)).length,
  }))
}

/** 도넛 모양 일치도 (가운데 퍼센트) */
export function MatchRing({ match, size = 76 }) {
  const total = CHECKLIST_ITEMS.length
  const r = 30
  const c = 2 * Math.PI * r
  const { tone, label } = matchLevel(match)
  return (
    <div className={`mr-ring is-${tone}`} style={{ width: size }}>
      <svg viewBox="0 0 76 76" width={size} height={size} role="img" aria-label={`${total}개 중 ${match}개 일치, ${label}`}>
        <circle className="mr-ring-track" cx="38" cy="38" r={r} />
        <circle
          className="mr-ring-value"
          cx="38"
          cy="38"
          r={r}
          strokeDasharray={`${(match / total) * c} ${c}`}
          transform="rotate(-90 38 38)"
        />
        <text x="38" y="42" textAnchor="middle" className="mr-ring-text">
          {Math.round((match / total) * 100)}%
        </text>
      </svg>
      <span className="mr-ring-label">{label}</span>
    </div>
  )
}

/** 섹션별 막대 4개 */
export function SectionBars({ mine, theirs }) {
  return (
    <ul className="mr-sections">
      {sectionMatches(mine, theirs).map((s) => (
        <li key={s.title}>
          <span className="mr-section-name">{s.title}</span>
          <span className="mr-section-bar" aria-hidden="true">
            {Array.from({ length: s.total }, (_, i) => (
              <span key={i} className={i < s.match ? 'is-on' : ''} />
            ))}
          </span>
          <span className="mr-section-count tabular">
            {s.match}/{s.total}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** 18개 항목을 나 / 상대 로 나란히 비교 */
export function CompareTable({ mine, theirs, theirLabel = '신청자' }) {
  return (
    <div className="mr-compare">
      <div className="mr-compare-head" aria-hidden="true">
        <span>항목</span>
        <span>나</span>
        <span>{theirLabel}</span>
      </div>
      {CHECKLIST_SECTIONS.map((section) => (
        <section key={section.title}>
          <h4>{section.title}</h4>
          <dl>
            {section.items.map((item) => {
              const ok = same(mine, theirs, item.key)
              return (
                <div key={item.key} className={`mr-compare-row${ok ? ' is-same' : ''}`}>
                  <dt>
                    <span className="mr-mark" aria-label={ok ? '같음' : '다름'}>
                      {ok ? '✓' : ''}
                    </span>
                    <span className="cl-no tabular">{itemNumber(item.key)}</span>
                    {item.label}
                  </dt>
                  <dd>{answerLabel(item, mine?.[item.key])}</dd>
                  <dd>{answerLabel(item, theirs?.[item.key])}</dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
    </div>
  )
}

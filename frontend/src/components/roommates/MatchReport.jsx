import { CHECKLIST_SECTIONS, answerLabel, isAnswered, itemNumber } from '../../data/roommateChecklist.js'

const same = (mine, theirs, key) => isAnswered(mine?.[key]) && mine[key] === theirs?.[key]

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

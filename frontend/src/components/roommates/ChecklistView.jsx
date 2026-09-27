import { CHECKLIST_SECTIONS, answerLabel, answersMatch, itemNumber, normalizeChecklist } from '../../data/roommateChecklist.js'

/**
 * 체크리스트 답변을 섹션별 표 형태로 보여준다 (읽기 전용)
 * @param {object} [compare] 내 체크리스트. 주면 나와 맞는 항목을 초록색으로 표시 (자리 항목은 서로 달라야 맞음)
 */
export default function ChecklistView({ checklist: raw, compare = null }) {
  const checklist = normalizeChecklist(raw)
  const mine = compare ? normalizeChecklist(compare) : null
  return (
    <div className="cl-view">
      {CHECKLIST_SECTIONS.map((section) => (
        <section key={section.title} className="cl-view-section">
          <h3>{section.title}</h3>
          <dl>
            {section.items.map((item) => {
              const value = checklist[item.key]
              const ox = item.type === 'ox' && typeof value === 'boolean'
              const same = Boolean(mine) && answersMatch(item, mine[item.key], value)
              return (
                <div key={item.key} className={`cl-view-row${same ? ' is-match' : ''}`}>
                  <dt>
                    <span className="cl-no tabular">{itemNumber(item.key)}</span>
                    {item.label}
                  </dt>
                  <dd className={ox ? `cl-ox ${value ? 'is-o' : 'is-x'}` : ''}>
                    {same && (
                      <span className="cl-match-mark" aria-label="나와 맞음">
                        ✓
                      </span>
                    )}
                    {answerLabel(item, value)}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
    </div>
  )
}

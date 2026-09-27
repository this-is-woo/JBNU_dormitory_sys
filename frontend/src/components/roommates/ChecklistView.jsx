import { CHECKLIST_SECTIONS, answerLabel, itemNumber, normalizeChecklist } from '../../data/roommateChecklist.js'

/** 체크리스트 답변을 섹션별 표 형태로 보여준다 (읽기 전용) */
export default function ChecklistView({ checklist: raw }) {
  const checklist = normalizeChecklist(raw)
  return (
    <div className="cl-view">
      {CHECKLIST_SECTIONS.map((section) => (
        <section key={section.title} className="cl-view-section">
          <h3>{section.title}</h3>
          <dl>
            {section.items.map((item) => {
              const value = checklist[item.key]
              const ox = item.type === 'ox' && typeof value === 'boolean'
              return (
                <div key={item.key} className="cl-view-row">
                  <dt>
                    <span className="cl-no tabular">{itemNumber(item.key)}</span>
                    {item.label}
                  </dt>
                  <dd className={ox ? `cl-ox ${value ? 'is-o' : 'is-x'}` : ''}>{answerLabel(item, value)}</dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
    </div>
  )
}

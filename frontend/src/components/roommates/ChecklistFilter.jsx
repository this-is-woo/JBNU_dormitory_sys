import { CHECKLIST_SECTIONS, itemNumber } from '../../data/roommateChecklist.js'
import ChoiceGroup from './ChoiceGroup.jsx'

const OX = [
  { value: true, label: 'O' },
  { value: false, label: 'X' },
]

const optionsOf = (item) => (item.type === 'ox' ? OX : item.options.map((o) => ({ value: o, label: o })))

/** { key: [고른 답...] } 중 하나라도 고른 항목 수 */
export const countChecklistFilters = (value) => Object.values(value).filter((v) => v.length).length

/** 고른 항목마다 글의 답이 고른 답 중 하나여야 통과 (항목끼리는 AND, 한 항목 안에서는 OR) */
export function matchesChecklist(checklist = {}, value) {
  return Object.entries(value).every(([key, picked]) => !picked.length || picked.includes(checklist[key]))
}

/**
 * 룸메이트 체크리스트 18개 항목을 섹션별로 접었다 펼 수 있는 필터.
 * value: { [itemKey]: 고른 답 배열 }
 */
export default function ChecklistFilter({ value, onChange }) {
  const total = countChecklistFilters(value)
  const setItem = (key) => (picked) => onChange({ ...value, [key]: picked })

  return (
    <div className="cl-filter">
      <div className="cl-filter-head">
        <h2>
          체크리스트
          {total > 0 && <span className="cl-filter-badge tabular">{total}</span>}
        </h2>
        {total > 0 && (
          <button type="button" className="cl-filter-clear" onClick={() => onChange({})}>
            지우기
          </button>
        )}
      </div>
      <p className="cl-filter-hint">원하는 답만 골라 보세요. 한 항목에서 여러 개를 고르면 그중 하나라도 맞는 글이 보여요.</p>

      {CHECKLIST_SECTIONS.map((section) => {
        const count = section.items.filter((i) => value[i.key]?.length).length
        return (
          <details key={section.title} className="cl-filter-section" open={count > 0 || undefined}>
            <summary>
              <span>{section.title}</span>
              {count > 0 && <span className="cl-filter-badge tabular">{count}</span>}
              <svg className="cl-filter-chevron" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="cl-filter-items">
              {section.items.map((item) => (
                <div key={item.key} className={`cl-filter-item${value[item.key]?.length ? ' is-active' : ''}`}>
                  <span className="cl-filter-label">
                    <span className="tabular">{itemNumber(item.key)}</span>
                    {item.label}
                  </span>
                  <ChoiceGroup
                    label={`${item.label} 필터`}
                    size="xs"
                    variant={item.type === 'ox' ? 'ox' : undefined}
                    multiple
                    options={optionsOf(item)}
                    value={value[item.key] ?? []}
                    onChange={setItem(item.key)}
                  />
                </div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}

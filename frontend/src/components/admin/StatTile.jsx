import { IconAlert, IconChevronRight } from '../common/Icons.jsx'
import { formatCount } from './adminFormat.js'

/**
 * 숫자 하나와 짧은 설명. onClick 이 있으면 눌러서 해당 탭으로 간다.
 * value 가 숫자면 천 단위 쉼표를 넣고, 글자(예: "3.35 ~ 3.95")면 그대로 보여 준다.
 */
export default function StatTile({ label, value, sub, flag, onClick }) {
  const body = (
    <>
      <span className="adm-stat-label">{label}</span>
      <span className="adm-stat-value">{typeof value === 'number' ? formatCount(value) : value}</span>
      {sub && <span className="adm-stat-sub">{sub}</span>}
      {flag && (
        <span className="adm-stat-flag">
          <IconAlert width={14} height={14} />
          {flag}
        </span>
      )}
      {onClick && <IconChevronRight className="adm-stat-arrow" width={16} height={16} />}
    </>
  )
  return onClick ? (
    <button type="button" className="adm-stat is-link" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="adm-stat">{body}</div>
  )
}

import './ScoreFormula.css'

const Op = ({ children }) => (
  <span className="f-op" aria-hidden="true">
    {children}
  </span>
)

/** 설명용 수식: 분수 형태로 한눈에 */
export function FormulaDisplay() {
  return (
    <div className="formula-display" role="math" aria-label="환산점수 = (학점 + 상점 곱하기 0.009 빼기 벌점 곱하기 0.009) 나누기 4.5 곱하기 90 더하기 거리점수">
      <span className="fd-result">환산점수</span>
      <Op>=</Op>
      <span className="fd-group">
        <span className="fd-fraction">
          <span className="fd-num">
            학점 <Op>+</Op> 상점<Op>×</Op>0.009 <Op>−</Op> 벌점<Op>×</Op>0.009
          </span>
          <span className="fd-den">4.5</span>
        </span>
        <Op>×</Op>
        <span>90</span>
      </span>
      <Op>+</Op>
      <span className="fd-accent">거리점수</span>
    </div>
  )
}

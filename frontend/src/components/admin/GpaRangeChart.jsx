import { useState } from 'react'
import { formatCount, formatGpa, formatGpaRange } from './adminFormat.js'

// 단과대학별 학점 분포. 한 줄이 한 단과대학이고, 모든 줄이 같은 학점 눈금을 쓴다.
//   가는 선 = 최저 ~ 최고 · 막대 = 가운데 50%(하위 25% ~ 상위 25%) · 점 = 평균
// 마우스를 올리거나, 차트에 초점을 두고 ↑/↓ 키로 줄마다 자세한 값을 본다. 모든 값은 "표로 보기"에도 있다.
const GPA_MAX = 4.5
const TICK_STEP = 0.5
// 기록이 이보다 적으면 값이 크게 흔들리므로 흐리게 보여 준다
export const SMALL_SAMPLE = 5

/**
 * 눈금 시작: 모든 줄의 가운데 50%와 평균이 여유 있게 들어가는 0.5 단위 (1.0 ~ 3.0 사이, 끝은 항상 4.5).
 * 최저값 하나(예: 장난으로 넣은 1.0) 때문에 눈금이 넓어져 단과대학끼리 비교하기 어려워지지 않게,
 * 최저값은 기준에서 뺀다. 눈금보다 낮은 최저값은 선을 왼쪽 끝에서 ◂ 로 잘라 보여 준다.
 */
function axisStart(rows) {
  const lows = rows.flatMap((r) => [r.q1, r.mean]).filter(Number.isFinite)
  if (!lows.length) return 1
  const low = Math.floor((Math.min(...lows) - 0.1) / TICK_STEP) * TICK_STEP
  return Math.max(1, Math.min(3, low))
}

const summary = (r) =>
  `${r.name} ${formatCount(r.n)}건: 평균 ${formatGpa(r.mean)}, 중앙값 ${formatGpa(r.median)}, ` +
  `가운데 50% ${formatGpaRange(r.q1, r.q3)}, 최저 ${formatGpa(r.min)}, 최고 ${formatGpa(r.max)}`

function Tip({ row, x }) {
  return (
    <span className="adm-range-tip" style={{ '--x': `${x}%` }}>
      <span className="adm-range-tip-head">
        {row.name} · {formatCount(row.n)}건
      </span>
      <span>
        <strong>{formatGpa(row.mean)}</strong> 평균
      </span>
      <span>
        <strong>{formatGpa(row.median)}</strong> 중앙값
      </span>
      <span>
        <strong>{formatGpaRange(row.q1, row.q3)}</strong> 가운데 50%
      </span>
      <span>
        <strong>{formatGpaRange(row.min, row.max)}</strong> 최저 ~ 최고
      </span>
    </span>
  )
}

/**
 * rows: [{ code, name, n, mean, min, q1, median, q3, max }] (보여 줄 순서대로)
 * labelledBy: 차트 제목 요소의 id
 */
export default function GpaRangeChart({ rows, labelledBy }) {
  const [active, setActive] = useState(null)
  const [focused, setFocused] = useState(false)
  const start = axisStart(rows)
  const ticks = Array.from({ length: Math.round((GPA_MAX - start) / TICK_STEP) + 1 }, (_, i) => start + i * TICK_STEP)
  const pct = (v) => Math.min(100, Math.max(0, ((v - start) / (GPA_MAX - start)) * 100))
  const shown = rows[active] ?? null
  const clipped = rows.some((r) => r.min < start)

  function onKey(e) {
    const moves = { ArrowUp: -1, ArrowDown: 1 }
    if (e.key in moves) {
      e.preventDefault()
      setActive((i) => Math.min(rows.length - 1, Math.max(0, (i ?? -1) + moves[e.key])))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : rows.length - 1)
    } else if (e.key === 'Escape') {
      setActive(null)
    }
  }

  return (
    <figure className="adm-range" aria-labelledby={labelledBy}>
      <div className="adm-range-legend" aria-hidden="true">
        <span>
          <span className="adm-range-key is-dot" />
          평균
        </span>
        <span>
          <span className="adm-range-key is-band" />
          가운데 50%
        </span>
        <span>
          <span className="adm-range-key is-whisker" />
          최저 ~ 최고
        </span>
      </div>

      <div
        className="adm-range-body"
        role="group"
        aria-label="단과대학별 학점 분포. 위아래 화살표 키로 단과대학마다 자세한 값을 볼 수 있어요."
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => {
          setFocused(true)
          setActive((i) => i ?? 0)
        }}
        onBlur={() => {
          setFocused(false)
          setActive(null)
        }}
        onPointerLeave={() => setActive(null)}
      >
        <div className="adm-range-axis" aria-hidden="true">
          <span className="adm-range-name">단과대학</span>
          <span className="adm-range-strip">
            <span className="adm-range-track">
              {ticks.map((t) => (
                <span key={t} className="adm-range-tick" style={{ left: `${pct(t)}%` }}>
                  {t.toFixed(1)}
                </span>
              ))}
            </span>
          </span>
          <span className="adm-range-value">평균</span>
        </div>

        <ol className="adm-range-rows">
          {rows.map((r, i) => (
            <li
              key={r.code}
              className={`adm-range-row${active === i ? ' is-active' : ''}${r.n < SMALL_SAMPLE ? ' is-sparse' : ''}`}
              onPointerEnter={() => setActive(i)}
            >
              <span className="adm-range-name">
                <span>{r.name}</span>
                <small>
                  {formatCount(r.n)}건{r.n < SMALL_SAMPLE && ' · 표본 적음'}
                </small>
              </span>
              <span className="adm-range-strip" aria-hidden="true">
                <span className="adm-range-track">
                  {ticks.map((t) => (
                    <span key={t} className="adm-range-grid" style={{ left: `${pct(t)}%` }} />
                  ))}
                  {r.max > r.min && (
                    <span
                      className={`adm-range-whisker${r.min < start ? ' is-clipped' : ''}`}
                      style={{ left: `${pct(r.min)}%`, width: `${pct(r.max) - pct(r.min)}%` }}
                    />
                  )}
                  {r.q3 > r.q1 && (
                    <span className="adm-range-iqr" style={{ left: `${pct(r.q1)}%`, width: `${pct(r.q3) - pct(r.q1)}%` }} />
                  )}
                  <span className="adm-range-dot" style={{ left: `${pct(r.mean)}%` }} />
                  {active === i && <Tip row={r} x={pct(r.mean)} />}
                </span>
              </span>
              <span className="adm-range-value tabular">
                <span className="sr-only">평균 </span>
                {formatGpa(r.mean)}
              </span>
            </li>
          ))}
        </ol>

        <p className="sr-only" aria-live="polite">
          {focused && shown ? summary(shown) : ''}
        </p>
      </div>

      {clipped && (
        <p className="adm-range-note">
          선 왼쪽 끝의 ◂ 는 최저값이 눈금({start.toFixed(1)})보다 낮다는 뜻이에요. 정확한 값은 막대에 마우스를 올리거나 표로
          보기에서 확인할 수 있어요.
        </p>
      )}
    </figure>
  )
}

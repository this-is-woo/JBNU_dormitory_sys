import { useLayoutEffect, useRef, useState } from 'react'

// 막대 차트 한 개 = 지표 하나 (여러 지표는 작은 차트 여러 개로. 축을 공유하거나 두 개 두지 않는다)
const TOP = 20 // 오늘 값 라벨 자리
const PLOT_H = 96
const AXIS_H = 22 // x축 날짜 자리 (높이에 포함해 카드 안에서 잘리지 않게)
const LEFT = 30 // y축 눈금 자리
const HEIGHT = TOP + PLOT_H + AXIS_H
const BAR_MAX = 24
const RADIUS = 4

const DAY_LABEL = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' })
export const dayLabel = (day) => DAY_LABEL.format(new Date(`${day}T12:00:00+09:00`))
const shortDay = (day) => {
  const [, m, d] = day.split('-')
  return `${Number(m)}/${Number(d)}`
}

// 0 ~ 최댓값을 1·2·5 단위의 깔끔한 눈금으로
function niceMax(value) {
  if (value <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(value))
  const f = value / exp
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp
}

// 위쪽 모서리만 둥근 막대 (바닥은 기준선에 붙어 각지게)
function barPath(x, y, w, h) {
  const r = Math.min(RADIUS, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/**
 * 최근 며칠의 건수 막대 차트. 마우스를 올리거나 키보드(←/→)로 날짜별 값을 볼 수 있다.
 * data: [{ day: 'YYYY-MM-DD', value }] (오래된 날부터, 마지막이 오늘)
 */
export default function TrendChart({ title, unit = '건', data }) {
  const [ref, width] = useWidth()
  const [active, setActive] = useState(null)
  const n = data.length
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const plotW = Math.max(0, width - LEFT)
  const slot = n ? plotW / n : 0
  const barW = Math.max(2, Math.min(BAR_MAX, slot * 0.62))
  const base = TOP + PLOT_H
  const yOf = (v) => base - (v / max) * PLOT_H
  const cx = (i) => LEFT + i * slot + slot / 2
  const today = data[n - 1]
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const shown = active == null ? null : data[active]

  function onPointer(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - rect.left - LEFT) / slot)
    setActive(i >= 0 && i < n ? i : null)
  }

  function onKey(e) {
    const moves = { ArrowLeft: -1, ArrowRight: 1 }
    if (e.key in moves) {
      e.preventDefault()
      setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + moves[e.key])))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : n - 1)
    }
  }

  const tipLeft = shown ? Math.min(Math.max(cx(active), 56), Math.max(56, width - 56)) : 0

  return (
    <figure className="adm-trend">
      <figcaption>
        <span>{title}</span>
        <span className="adm-trend-total">
          14일 합계 {total.toLocaleString('ko-KR')}
          {unit}
        </span>
      </figcaption>
      <div className="adm-trend-plot" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            tabIndex={0}
            role="img"
            aria-label={`${title}: 최근 14일 합계 ${total}${unit}, 오늘 ${today?.value ?? 0}${unit}. 화살표 키로 날짜별 값을 볼 수 있어요.`}
            onPointerMove={onPointer}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive((i) => i ?? n - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
            {/* 눈금: 위쪽 가는 선 + 기준선 */}
            <line className="adm-trend-grid" x1={LEFT} x2={width} y1={TOP + 0.5} y2={TOP + 0.5} />
            <line className="adm-trend-base" x1={LEFT} x2={width} y1={base + 0.5} y2={base + 0.5} />
            <text className="adm-trend-tick" x={LEFT - 6} y={TOP + 4} textAnchor="end">
              {max.toLocaleString('ko-KR')}
            </text>
            <text className="adm-trend-tick" x={LEFT - 6} y={base + 4} textAnchor="end">
              0
            </text>

            {data.map((d, i) => {
              const h = base - yOf(d.value)
              return (
                <g key={d.day}>
                  {d.value > 0 && (
                    <path
                      className={`adm-trend-bar${active === i ? ' is-active' : ''}`}
                      d={barPath(cx(i) - barW / 2, yOf(d.value), barW, h)}
                    />
                  )}
                  {/* 막대보다 넓은 투명 영역: 막대가 없거나 가늘어도 마우스가 쉽게 닿게 */}
                  <rect x={LEFT + i * slot} y={TOP} width={slot} height={PLOT_H} fill="transparent" />
                </g>
              )
            })}

            {/* 값 라벨은 오늘 하나만 (나머지는 툴팁과 표에서) */}
            {today && (
              <text className="adm-trend-label" x={cx(n - 1)} y={yOf(today.value) - 6} textAnchor="middle">
                {today.value.toLocaleString('ko-KR')}
              </text>
            )}

            {n > 0 && (
              <>
                <text className="adm-trend-tick" x={cx(0)} y={HEIGHT - 5} textAnchor="middle">
                  {shortDay(data[0].day)}
                </text>
                <text className="adm-trend-tick" x={cx(n - 1)} y={HEIGHT - 5} textAnchor="middle">
                  오늘
                </text>
              </>
            )}
          </svg>
        )}
        <div className={`adm-trend-tip${shown ? ' is-visible' : ''}`} style={{ left: tipLeft }} aria-live="polite">
          {shown && (
            <>
              <strong className="tabular">
                {shown.value.toLocaleString('ko-KR')}
                {unit}
              </strong>
              <span>{dayLabel(shown.day)}</span>
            </>
          )}
        </div>
      </div>
    </figure>
  )
}

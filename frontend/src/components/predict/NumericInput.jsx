import { useEffect, useRef, useState } from 'react'

/**
 * 허용 범위를 벗어나는 입력은 반영하지 않고, 잠깐 안내 문구를 띄우는 숫자 입력칸.
 * @param {(value: string) => boolean} isAllowed  입력 중인 문자열 검사
 * @param {(value: string) => string} [normalize] 반영 전 정리 (예: "07" → "7")
 */
export default function NumericInput({ id, value, onChange, isAllowed, normalize, warning, ...inputProps }) {
  const [showWarning, setShowWarning] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleChange = (e) => {
    let next = e.target.value.trim()
    // 일부 휴대폰의 숫자 키패드는 소수점을 쉼표로 넣는다 (3,85 → 3.85)
    if (inputProps.inputMode === 'decimal') next = next.replace(',', '.')
    if (isAllowed(next)) {
      setShowWarning(false)
      onChange(normalize ? normalize(next) : next)
      return
    }
    setShowWarning(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShowWarning(false), 2000)
  }

  return (
    <div className="field">
      <input
        id={id}
        type="text"
        autoComplete="off"
        className={`input tabular${showWarning ? ' is-invalid' : ''}`}
        value={value}
        onChange={handleChange}
        aria-describedby={`${id}-warning`}
        {...inputProps}
      />
      <p id={`${id}-warning`} className={`field-warning${showWarning ? ' is-visible' : ''}`} role="status">
        {showWarning ? warning : ''}
      </p>
    </div>
  )
}

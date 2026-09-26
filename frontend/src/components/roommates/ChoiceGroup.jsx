/**
 * 칩 모양 선택 버튼 묶음.
 * - 단일 선택: value 는 값 하나
 * - 다중 선택(multiple): value 는 배열
 * - variant="ox": O / X 동그라미 버튼
 * options: { value, label, disabled?, hint? }[]
 */
export default function ChoiceGroup({ label, options, value, onChange, multiple = false, size = 'md', variant }) {
  const isSelected = (v) => (multiple ? value.includes(v) : value === v)

  function toggle(v) {
    if (!multiple) return onChange(v)
    onChange(isSelected(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
    <div
      className={`choice-group choice-${size}${variant ? ` choice-${variant}` : ''}`}
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`choice${isSelected(o.value) ? ' is-selected' : ''}`}
          role={multiple ? 'checkbox' : 'radio'}
          aria-checked={isSelected(o.value)}
          disabled={o.disabled}
          title={o.hint}
          onClick={() => toggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

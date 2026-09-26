/** 식당 이용 시간 표 (src/data/dormFees.js 의 MEAL_TIMES) */
export default function MealTable({ data }) {
  // 같은 group 이 이어지면 머리글을 합친다
  const groups = []
  for (const c of data.columns) {
    const last = groups.at(-1)
    if (last?.label === c.group) last.span += 1
    else groups.push({ label: c.group, span: 1 })
  }

  return (
    <div className="fee-scroll" role="region" aria-label={data.title} tabIndex={0}>
      <table className="fee-table meal-table">
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="fee-dorm-col">
              구분
            </th>
            {groups.map((g) => (
              <th key={g.label} scope="colgroup" colSpan={g.span}>
                {g.label}
              </th>
            ))}
          </tr>
          <tr>
            {data.columns.map((c) => (
              <th key={`${c.group}-${c.label}`} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.meal}>
              <th scope="row" className="fee-dorm">
                <strong>{r.meal}</strong>
              </th>
              {r.times.map((t, i) => (
                <td key={data.columns[i].group + data.columns[i].label} className="tabular">
                  {t}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

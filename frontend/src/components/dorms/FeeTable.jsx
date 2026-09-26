const won = (n) => (n == null ? '—' : n.toLocaleString('ko-KR'))

/**
 * 생활관비 표. 생활관마다 첫 줄에 생활관 이름·구분·비고를 세로로 합쳐 보여 준다.
 * @param {object} data        SEMESTER_FEES 또는 WINTER_FEES (src/data/dormFees.js)
 * @param {boolean} showUtility 공공요금 열 표시 (학기 중만)
 */
export default function FeeTable({ data, showUtility = false }) {
  const { columns, groups } = data
  return (
    <div className="fee-scroll" role="region" aria-label={data.title} tabIndex={0}>
      <table className="fee-table">
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="fee-dorm-col">
              생활관
            </th>
            <th scope="col" rowSpan={2}>
              호실
            </th>
            <th scope="colgroup" colSpan={2}>
              관리비
            </th>
            <th scope="colgroup" colSpan={2}>
              급식비
            </th>
            {showUtility && (
              <th scope="col" rowSpan={2}>
                공공요금
              </th>
            )}
            <th scope="col" rowSpan={2} className="fee-total">
              합계
            </th>
            <th scope="col" rowSpan={2}>
              비고
            </th>
          </tr>
          <tr>
            <th scope="col">1일</th>
            <th scope="col">
              전체 <small>({columns.managementDays})</small>
            </th>
            <th scope="col">
              1일 <small>(3식)</small>
            </th>
            <th scope="col">
              전체 <small>({columns.mealDays})</small>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) =>
            g.rows.map((r, i) => (
              <tr key={`${g.dorm}-${r.room}`} className={i === 0 ? 'is-group-start' : ''}>
                {i === 0 && (
                  <th scope="rowgroup" rowSpan={g.rows.length} className="fee-dorm">
                    <strong>{g.dorm}</strong>
                    <span>{g.campus}</span>
                  </th>
                )}
                <th scope="row" className="fee-room">
                  {r.room}
                </th>
                <td className="tabular">{won(r.dayFee)}</td>
                <td className="tabular">{won(r.termFee)}</td>
                <td className="tabular">{won(r.mealDay)}</td>
                <td className="tabular">{won(r.mealTerm)}</td>
                {showUtility && <td className="tabular">{won(r.utility)}</td>}
                <td className="tabular fee-total">{r.total == null ? '운영 안 함' : won(r.total)}</td>
                {i === 0 && (
                  <td rowSpan={g.rows.length} className="fee-note">
                    {g.note ?? ''}
                  </td>
                )}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  )
}

import './Pagination.css'

/** 보여 줄 쪽 번호: 처음·끝과 현재 쪽 주변만, 사이는 … 으로 */
function pageItems(page, pageCount) {
  const around = new Set([1, pageCount, page - 1, page, page + 1])
  const pages = [...around].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const items = []
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) items.push(p - pages[i - 1] === 2 ? p - 1 : `gap-${p}`)
    items.push(p)
  })
  return items
}

const Chevron = ({ flip }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * 쪽 번호 이동. 한 쪽뿐이면 그리지 않는다.
 * @param {number} page       현재 쪽 (1부터)
 * @param {number} pageCount  전체 쪽 수
 */
export default function Pagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null
  return (
    <nav className="pagination" aria-label="게시글 페이지">
      <button
        type="button"
        className="page-btn page-arrow"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 페이지"
      >
        <Chevron />
      </button>
      {pageItems(page, pageCount).map((item) =>
        typeof item === 'string' ? (
          <span key={item} className="page-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`page-btn tabular${item === page ? ' is-current' : ''}`}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`${item}페이지`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="page-btn page-arrow"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="다음 페이지"
      >
        <Chevron flip />
      </button>
    </nav>
  )
}

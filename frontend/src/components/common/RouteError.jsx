import { useEffect } from 'react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router'

// 새 버전이 배포된 뒤, 예전 화면이 이제는 없는 파일(코드 조각)을 불러오려 할 때 나는 오류
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|is not a valid JavaScript MIME type/i

export const isChunkLoadError = (error) => CHUNK_ERROR.test(String(error?.message ?? error ?? ''))

/**
 * 화면을 그리다가 오류가 났을 때 보여 주는 페이지 (라우터의 errorElement).
 * 흰 화면이나 개발용 오류 화면 대신, 새로고침·홈으로 돌아갈 길을 준다.
 */
export default function RouteError() {
  const error = useRouteError()
  const chunk = isChunkLoadError(error)
  const notFound = isRouteErrorResponse(error) && error.status === 404

  useEffect(() => {
    console.error(error)
  }, [error])

  const title = chunk ? '새 버전이 나왔어요' : notFound ? '페이지를 찾을 수 없어요' : '화면을 표시하지 못했어요'
  const body = chunk
    ? '사이트가 업데이트돼서 새로고침이 필요해요.'
    : notFound
      ? '주소가 바뀌었거나 삭제된 페이지일 수 있어요.'
      : '일시적인 문제일 수 있어요. 새로고침해도 계속되면 잠시 후 다시 들어와 주세요.'

  return (
    <section className="container route-error" role="alert">
      <title>{`${title} | JBNU Dormi`}</title>
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="route-error-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
          새로고침
        </button>
        {!chunk && (
          <Link to="/" className="btn btn-secondary btn-lg">
            홈으로
          </Link>
        )}
      </div>
    </section>
  )
}

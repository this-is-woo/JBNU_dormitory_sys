import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <>
      <title>페이지를 찾을 수 없어요 | JBNU Dormi</title>
      <section className="container" style={{ padding: '120px 0 40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 40 }}>페이지를 찾을 수 없어요</h1>
        <p style={{ marginTop: 14, fontSize: 17, color: 'var(--c-text-2)' }}>
          주소가 바뀌었거나 삭제된 페이지일 수 있어요.
        </p>
        <Link to="/" className="btn btn-primary btn-lg" style={{ marginTop: 32 }}>
          홈으로 돌아가기
        </Link>
      </section>
    </>
  )
}

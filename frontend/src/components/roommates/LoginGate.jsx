import { useState } from 'react'
import { authMode } from '../../hooks/useAuth.js'

function GoogleMark(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

const PERKS = [
  ['체크리스트로 글쓰기', '생활 습관 18개 항목을 골라 나를 소개해요.'],
  ['조건에 맞는 룸메이트 찾기', '호관·성별·체크리스트 답으로 원하는 글만 골라 봐요.'],
  ['내 글 관리', '내 구글 계정으로 쓴 글을 수정·삭제하고 모집완료로 바꿔요.'],
]

/** 룸메이트 찾기는 구글 로그인 후 이용 */
export default function LoginGate({ onSignIn }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setPending(true)
    setError('')
    try {
      await onSignIn()
    } catch (err) {
      setError(err.message)
      setPending(false)
    }
  }

  return (
    <section className="login-gate" aria-labelledby="login-gate-title">
      <div className="login-gate-card">
        <h2 id="login-gate-title">로그인하고 룸메이트를 찾아보세요</h2>
        <p className="login-gate-lead">
          룸메이트 찾기는 구글 계정으로 로그인한 학생만 이용할 수 있어요. 글과 연락처는 로그인한 사용자에게만 보입니다.
        </p>

        <ul className="login-gate-perks">
          {PERKS.map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{body}</span>
            </li>
          ))}
        </ul>

        <button type="button" className="btn btn-google btn-lg" onClick={handleClick} disabled={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : <GoogleMark />}
          Google 계정으로 로그인
        </button>
        {error && (
          <p className="rm-error" role="alert">
            {error}
          </p>
        )}
        {authMode === 'demo' && (
          <p className="login-gate-demo">
            Supabase 가 연결되지 않아 지금은 이 브라우저에만 저장되는 데모 계정으로 로그인됩니다.
          </p>
        )}
      </div>
    </section>
  )
}

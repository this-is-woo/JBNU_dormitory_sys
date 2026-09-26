import { useState } from 'react'
import { Link } from 'react-router'
import { authMode } from '../../hooks/useAuth.js'
import Modal from '../common/Modal.jsx'
import GoogleSignInButton from './GoogleSignInButton.jsx'
import './Auth.css'

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

const DEFAULT_POINTS = [
  '구글 계정으로 한 번에 로그인해요. 따로 가입할 필요가 없어요.',
  '이메일과 이름은 본인 확인에만 쓰고, 게시글에는 표시하지 않아요.',
  '로그인하면 내가 쓴 글을 수정·삭제하고 모집완료로 바꿀 수 있어요.',
]

/**
 * 글쓰기·결과 제보 등 로그인이 필요한 순간에만 여는 구글 로그인 창.
 * @param {string} reason     창 위쪽 안내 (예: "글을 쓰려면 로그인이 필요해요.")
 * @param {string[]} points   로그인하면 무엇이 되는지 짧은 안내
 */
export default function LoginModal({ open, reason, points = DEFAULT_POINTS, onClose, onSignIn, onIdToken }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleRedirect() {
    setPending(true)
    setError('')
    try {
      await onSignIn()
    } catch (err) {
      setError(err.message)
    } finally {
      // 로그아웃 뒤 다시 열었을 때 버튼이 눌린 채로 남지 않도록
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="로그인" subtitle={reason}>
      <div className="login-box">
        <ul className="login-points">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        {authMode === 'google-button' ? (
          <GoogleSignInButton
            onCredential={(token, nonce) => {
              setError('')
              return onIdToken(token, nonce)
            }}
            onError={setError}
          />
        ) : (
          <button type="button" className="btn btn-google btn-lg" onClick={handleRedirect} disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : <GoogleMark />}
            Google 계정으로 로그인
          </button>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <p className="login-foot">
          로그인하면 <Link to="/terms">서비스 약관</Link>과 <Link to="/privacy">개인정보처리방침</Link>에 동의하는
          것으로 봐요.
        </p>
        {authMode === 'demo' && (
          <p className="login-foot">Supabase 가 연결되지 않아 이 브라우저에만 저장되는 데모 계정으로 로그인됩니다.</p>
        )}
      </div>
    </Modal>
  )
}

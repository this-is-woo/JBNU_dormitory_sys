import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID } from '../../config.js'
import { createNonce, loadGoogleIdentity } from '../../lib/googleIdentity.js'
import { isDarkTheme, onThemeChange } from '../../lib/preferences.js'

const MAX_WIDTH = 400 // 구글 버튼이 허용하는 최대 너비

/**
 * 구글이 직접 그리는 "Google 계정으로 로그인" 버튼.
 * 사이트 테마(휴대폰 다크 모드 · 내 정보 > 설정의 테마)에 맞춰 검정/흰색 버튼을 고르고, 카드 너비에 맞춘다.
 * @param {(token: string, nonce: string) => Promise<void>} onCredential
 */
export default function GoogleSignInButton({ onCredential, onError }) {
  const slot = useRef(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [dark, setDark] = useState(isDarkTheme)
  // 콜백이 바뀌어도 버튼을 다시 초기화하지 않도록 최신 값만 참조
  const handlers = useRef({ onCredential, onError })
  handlers.current = { onCredential, onError }

  useEffect(() => onThemeChange(() => setDark(isDarkTheme())), [])

  useEffect(() => {
    let active = true
    Promise.all([loadGoogleIdentity(), createNonce()])
      .then(([gis, nonce]) => {
        if (!active || !slot.current) return
        gis.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          ux_mode: 'popup',
          context: 'signin',
          use_fedcm_for_button: true,
          callback: async ({ credential }) => {
            setPending(true)
            try {
              await handlers.current.onCredential(credential, nonce.raw)
            } catch (err) {
              handlers.current.onError(err.message)
              setPending(false)
            }
          },
        })
        slot.current.replaceChildren()
        gis.renderButton(slot.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'center',
          locale: 'ko',
          width: Math.min(MAX_WIDTH, slot.current.parentElement.clientWidth),
        })
        setReady(true)
      })
      .catch((err) => active && handlers.current.onError(err.message))
    return () => {
      active = false
    }
  }, [dark])

  return (
    <div className={`google-btn${ready ? ' is-ready' : ''}${pending ? ' is-pending' : ''}`}>
      <div ref={slot} className="google-btn-slot" />
      {!ready && <div className="google-btn-placeholder" aria-hidden="true" />}
      {pending && (
        <div className="google-btn-pending" role="status">
          <span className="spinner" aria-hidden="true" /> 로그인하는 중…
        </div>
      )}
    </div>
  )
}

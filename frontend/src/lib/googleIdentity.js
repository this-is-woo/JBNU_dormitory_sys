// Google Identity Services(GIS) — 구글이 그려 주는 "Google 계정으로 로그인" 버튼.
// 로그인하면 구글이 ID 토큰을 사이트로 바로 넘겨주고, 그 토큰으로 Supabase 세션을 만든다.
// 그래서 구글 로그인 창에 Supabase 주소 대신 이 사이트 주소(브랜드 인증 후에는 앱 이름)가 표시된다.
// https://developers.google.com/identity/gsi/web
// https://supabase.com/docs/guides/auth/social-login/auth-google

import { uid } from './uid.js'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

let loading = null

/** GIS 스크립트를 한 번만 불러온다 */
export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  loading ??= new Promise((resolve, reject) => {
    const fail = () => {
      loading = null
      reject(new Error('구글 로그인 버튼을 불러오지 못했어요. 광고 차단 기능을 끄고 새로고침해 보세요.'))
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    // 스크립트는 받았지만 차단 기능 등으로 구글 로그인 객체가 만들어지지 않은 경우도 실패로 본다
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : fail())
    script.onerror = fail
    document.head.append(script)
  })
  return loading
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 재사용 공격을 막는 nonce.
 * 구글에는 해시값을, Supabase 에는 원래 값을 넘기면 Supabase 가 둘을 대조한다.
 */
export async function createNonce() {
  const raw = uid()
  return { raw, hashed: await sha256Hex(raw) }
}

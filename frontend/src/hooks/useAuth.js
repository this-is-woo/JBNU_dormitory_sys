import { useCallback, useEffect, useState } from 'react'
import { GOOGLE_CLIENT_ID, isSupabaseConfigured } from '../config.js'

// Supabase 가 연결되지 않은 개발 환경에서는 실제 구글 로그인 대신 이 브라우저에만 저장되는 데모 계정을 쓴다.
const DEMO_USER_KEY = 'jbnu-dorm:demo-user'
// 데모 계정의 로그인·로그아웃을 같은 화면의 다른 컴포넌트(헤더 메뉴 ↔ 룸메이트 페이지)에 알린다
const DEMO_AUTH_EVENT = 'jbnu-dorm:demo-auth'
const DEMO_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@jbnu.ac.kr', name: '데모 사용자' }

// demo: Supabase 미연결 / google-button: 구글 공식 버튼(GIS) / google-redirect: Supabase 로그인 페이지로 이동
export const authMode = !isSupabaseConfigured ? 'demo' : GOOGLE_CLIENT_ID ? 'google-button' : 'google-redirect'

const toUser = (u) =>
  u && {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email,
  }

function readDemoUser() {
  try {
    return localStorage.getItem(DEMO_USER_KEY) ? DEMO_USER : null
  } catch {
    return null
  }
}

/**
 * 구글 로그인 상태.
 * status: 'loading' | 'signedOut' | 'signedIn'
 */
export function useAuth() {
  const [user, setUser] = useState(() => (isSupabaseConfigured ? undefined : readDemoUser()))

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const sync = () => setUser(readDemoUser())
      window.addEventListener(DEMO_AUTH_EVENT, sync)
      return () => window.removeEventListener(DEMO_AUTH_EVENT, sync)
    }
    let active = true
    let subscription
    import('../lib/supabase.js').then(({ supabase }) => {
      if (!active) return
      supabase.auth.getSession().then(({ data }) => active && setUser(toUser(data.session?.user) ?? null))
      ;({ data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(toUser(session?.user) ?? null)
      }))
    })
    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async () => {
    if (!isSupabaseConfigured) {
      try {
        localStorage.setItem(DEMO_USER_KEY, '1')
      } catch {
        // 저장하지 못해도 이번 화면에서는 로그인 상태를 유지
      }
      setUser(DEMO_USER)
      window.dispatchEvent(new Event(DEMO_AUTH_EVENT))
      return
    }
    const { supabase } = await import('../lib/supabase.js')
    // 구글 로그인 후 지금 보고 있던 페이지로 돌아온다
    // (Supabase Dashboard → Authentication → URL Configuration 의 Redirect URLs 에 등록돼 있어야 함)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw new Error('구글 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }, [])

  /** 구글 공식 버튼이 넘겨준 ID 토큰으로 Supabase 세션을 만든다 (세션은 onAuthStateChange 로 반영) */
  const signInWithIdToken = useCallback(async (token, nonce) => {
    const { supabase } = await import('../lib/supabase.js')
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })
    if (error) throw new Error('구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.')
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      try {
        localStorage.removeItem(DEMO_USER_KEY)
      } catch {
        // 무시
      }
      setUser(null)
      window.dispatchEvent(new Event(DEMO_AUTH_EVENT))
      return
    }
    const { supabase } = await import('../lib/supabase.js')
    await supabase.auth.signOut()
    // 구글 원탭 자동 로그인이 바로 다시 로그인시키지 않도록
    window.google?.accounts?.id?.disableAutoSelect()
    setUser(null)
  }, [])

  const status = user === undefined ? 'loading' : user ? 'signedIn' : 'signedOut'
  return { status, user: user ?? null, signIn, signInWithIdToken, signOut }
}

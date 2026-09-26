import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../config.js'

// Supabase 가 연결되지 않은 개발 환경에서는 실제 구글 로그인 대신 이 브라우저에만 저장되는 데모 계정을 쓴다.
const DEMO_USER_KEY = 'jbnu-dorm:demo-user'
const DEMO_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@jbnu.ac.kr', name: '데모 사용자' }

export const authMode = isSupabaseConfigured ? 'google' : 'demo'

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
    if (!isSupabaseConfigured) return
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

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      try {
        localStorage.removeItem(DEMO_USER_KEY)
      } catch {
        // 무시
      }
      setUser(null)
      return
    }
    const { supabase } = await import('../lib/supabase.js')
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  const status = user === undefined ? 'loading' : user ? 'signedIn' : 'signedOut'
  return { status, user: user ?? null, signIn, signOut }
}

import { useCallback, useSyncExternalStore } from 'react'
import { GOOGLE_CLIENT_ID, SUPABASE_URL, isSupabaseConfigured } from '../config.js'

// Supabase 가 연결되지 않은 개발 환경에서는 실제 구글 로그인 대신 이 브라우저에만 저장되는 데모 계정을 쓴다.
const DEMO_USER_KEY = 'jbnu-dorm:demo-user'
// 데모 계정의 로그인·로그아웃을 같은 화면의 다른 컴포넌트(헤더 메뉴 ↔ 룸메이트 페이지)에 알린다
const DEMO_AUTH_EVENT = 'jbnu-dorm:demo-auth'
export const DEMO_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@jbnu.ac.kr', name: '데모 사용자' }

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
 * Supabase 가 이 브라우저에 저장해 둔 로그인 정보를 바로 읽는다 (supabase-js 를 받기 전에 화면을 그리려고).
 * undefined: 모름(확인 중) · null: 로그아웃 · 객체: 로그인. 진짜 상태는 곧 getSession 으로 맞춘다.
 */
function readStoredUser() {
  try {
    // 구글 로그인에서 막 돌아온 경우: supabase-js 가 주소의 값을 처리할 때까지 기다린다
    if (/[?&#](code|access_token|error)=/.test(window.location.search + window.location.hash)) return undefined
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const session = JSON.parse(raw)
    return toUser(session?.user ?? session?.currentSession?.user) ?? undefined
  } catch {
    return undefined
  }
}

// ── 로그인 상태 저장소: 앱 전체에서 하나 ──
// 예전에는 이 훅을 쓰는 화면마다 따로 확인해서, 페이지를 옮길 때마다 "확인하는 중"으로 돌아갔다.
let current = isSupabaseConfigured ? readStoredUser() : readDemoUser()
let started = false
const listeners = new Set()

// 같은 사람이면 같은 객체를 유지한다 (토큰 갱신마다 화면 전체가 다시 그려지지 않게)
function emit(next) {
  const same = current && next && current.id === next.id && current.email === next.email && current.name === next.name
  if (same || current === next) return
  current = next
  listeners.forEach((fn) => fn())
}

function start() {
  if (started) return
  started = true
  if (!isSupabaseConfigured) {
    window.addEventListener(DEMO_AUTH_EVENT, () => emit(readDemoUser()))
    return
  }
  // 불러오지 못하면(네트워크·저장소 오류) 로그아웃 상태로 둔다. "확인하는 중"에 머물러 화면이 멈추지 않게.
  const signedOut = (err) => {
    console.warn('[auth] 로그인 상태를 확인하지 못했습니다.', err)
    emit(null)
  }
  import('../lib/supabase.js')
    .then(({ supabase }) => {
      supabase.auth
        .getSession()
        .then(({ data }) => emit(toUser(data.session?.user) ?? null))
        .catch(signedOut)
      supabase.auth.onAuthStateChange((_event, session) => emit(toUser(session?.user) ?? null))
    })
    .catch(signedOut)
}

function subscribe(fn) {
  start()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const snapshot = () => current

/**
 * 구글 로그인 상태.
 * status: 'loading' | 'signedOut' | 'signedIn'
 */
export function useAuth() {
  const user = useSyncExternalStore(subscribe, snapshot, snapshot)

  const signIn = useCallback(async () => {
    if (!isSupabaseConfigured) {
      try {
        localStorage.setItem(DEMO_USER_KEY, '1')
      } catch {
        // 저장하지 못해도 이번 화면에서는 로그인 상태를 유지
      }
      emit(DEMO_USER)
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
      emit(null)
      window.dispatchEvent(new Event(DEMO_AUTH_EVENT))
      return
    }
    // 채팅 알림은 끊지 않는다: 로그아웃해도 이 기기로 계속 받는다.
    // (이 기기에서 다른 계정으로 로그인하면 save_push_subscription 이 그 계정으로 옮긴다.
    //  끄려면 채팅 목록의 [알림 꺼짐] 또는 브라우저 · 휴대폰 설정)
    try {
      const { supabase } = await import('../lib/supabase.js')
      // 서버에 알리지 못하면(오프라인 등) 이 브라우저의 세션만이라도 지운다.
      // 그렇지 않으면 화면만 로그아웃되고, 새로고침하면 다시 로그인된 채로 돌아온다.
      const { error } = await supabase.auth.signOut()
      if (error) await supabase.auth.signOut({ scope: 'local' })
    } catch (err) {
      console.warn('[auth] 로그아웃 중 오류', err)
    }
    // 구글 원탭 자동 로그인이 바로 다시 로그인시키지 않도록
    window.google?.accounts?.id?.disableAutoSelect()
    emit(null)
  }, [])

  const status = user === undefined ? 'loading' : user ? 'signedIn' : 'signedOut'
  return { status, user: user ?? null, signIn, signInWithIdToken, signOut }
}

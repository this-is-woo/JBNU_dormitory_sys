import { useEffect, useState } from 'react'
import { ADMIN_EMAIL, isSupabaseConfigured } from '../config.js'
import { useAuth } from './useAuth.js'

// 계정마다 한 번만 DB 에 묻는다 (헤더와 관리자 페이지가 같은 요청을 두 번 보내지 않게)
const answers = new Map() // userId → Promise<boolean>

// DB 에 묻는다: 지금 로그인한 계정이 admins 에 있는지 (관리 기능 코드는 /admin 을 열 때만 받도록 여기서 따로 부른다)
async function askServer() {
  if (!isSupabaseConfigured) return true
  const { supabase } = await import('../lib/supabase.js')
  const { data, error } = await supabase.rpc('is_admin')
  if (error) throw error
  return data === true
}

/**
 * 관리자 메뉴를 보여 줄 후보인지. 화면 표시용이고, 실제 권한은 DB(is_admin)가 정한다.
 * 데모(Supabase 미연결)에서는 개발 서버에서만 데모 계정을 관리자로 본다.
 */
function isCandidate(user) {
  if (!user) return false
  if (!isSupabaseConfigured) return import.meta.env.DEV
  return user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
}

/**
 * useAuth + 관리자 여부.
 * adminStatus: 'loading' | 'yes' | 'no'
 * isAdminEmail: 관리자 이메일로 로그인했는지 (DB 에 등록이 안 된 경우의 안내에 쓴다)
 */
export function useAdmin() {
  const auth = useAuth()
  const candidate = auth.status === 'signedIn' && isCandidate(auth.user)
  const userId = auth.user?.id ?? null
  const [answer, setAnswer] = useState({ userId: null, isAdmin: false })

  useEffect(() => {
    if (!candidate) return
    let active = true
    if (!answers.has(userId)) {
      answers.set(
        userId,
        askServer().catch(() => {
          answers.delete(userId) // 네트워크 오류면 다음에 다시 묻는다
          return false
        }),
      )
    }
    answers.get(userId).then((isAdmin) => active && setAnswer({ userId, isAdmin }))
    return () => {
      active = false
    }
  }, [candidate, userId])

  const adminStatus =
    auth.status === 'loading' ? 'loading' : !candidate ? 'no' : answer.userId === userId ? (answer.isAdmin ? 'yes' : 'no') : 'loading'
  return { ...auth, adminStatus, isAdmin: adminStatus === 'yes', isAdminEmail: candidate }
}

// 빌드 시점에 주입되는 환경변수 (.env.local / Vercel Environment Variables)
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)

export const OFFICIAL_DORM_URL = 'https://likehome.jbnu.ac.kr'
export const JBNU_URL = 'https://www.jbnu.ac.kr'

// 개인정보처리방침·약관에 표시하는 운영자 문의처
export const CONTACT_EMAIL = 'thisiswoo04@gmail.com'

// 빌드 시점에 주입되는 환경변수 (.env.local / Vercel Environment Variables)
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)

// Google Cloud → OAuth 클라이언트(웹 애플리케이션)의 클라이언트 ID. 공개해도 되는 값이다.
// 있으면 구글 공식 로그인 버튼을, 없으면 Supabase 로그인 페이지로 이동하는 방식을 쓴다.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export const OFFICIAL_DORM_URL = 'https://likehome.jbnu.ac.kr'
export const JBNU_URL = 'https://www.jbnu.ac.kr'

// 개인정보처리방침·약관에 표시하는 운영자 문의처
export const CONTACT_EMAIL = 'thisiswoo04@gmail.com'

// 관리자 메뉴를 보여 줄 구글 계정. 화면 표시용일 뿐이고, 실제 권한은 DB 의 admins 테이블이 정한다
// (supabase/migrations/20261010000000_admin.sql). 이 값을 바꿔도 관리 기능을 쓸 수는 없다.
export const ADMIN_EMAIL = 'thisiswoo04@gmail.com'

// 후원 (개발자 삼각김밥 사주기, /support): 카카오페이 송금 링크. QR 이미지는 src/assets/kakaopay-qr.png
export const KAKAOPAY_DONATE_URL = 'https://qr.kakaopay.com/FNeRX2nr6'

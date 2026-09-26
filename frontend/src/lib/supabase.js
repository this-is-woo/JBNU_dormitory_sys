import { createClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from '../config.js'

// 환경변수가 없으면 null. 사용하는 쪽에서 기본 데이터로 대체한다.
// 브라우저에는 publishable(anon) 키만 두고, 데이터 보호는 테이블 RLS 정책으로 한다.
export const supabase = isSupabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null

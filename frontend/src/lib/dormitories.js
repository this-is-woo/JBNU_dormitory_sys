import { isSupabaseConfigured } from '../config.js'
import { DORMITORIES } from '../data/dormitories.js'

const staticByCode = Object.fromEntries(DORMITORIES.map((d) => [d.code, d]))

const fromRow = (row) => ({
  code: row.code,
  name: row.name,
  type: row.selection_type,
  genders: row.genders ?? [],
  rooms: [...(row.dormitory_rooms ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((r) => r.room_type),
  meal: row.meal_plan ?? '',
  // 지원 자격 설명 문구는 화면용이라 기본 데이터에서 가져온다
  eligibility: staticByCode[row.code]?.eligibility ?? '',
  infoUrl: staticByCode[row.code]?.infoUrl ?? null,
})

/**
 * 생활관 목록. Supabase `dormitories` + `dormitory_rooms` 테이블을 우선 읽고,
 * 설정이 없거나 실패하면 내장 데이터(src/data/dormitories.js)를 쓴다.
 * @returns {Promise<{items: object[], source: 'supabase' | 'static'}>}
 */
export async function fetchDormitories() {
  if (!isSupabaseConfigured) return { items: DORMITORIES, source: 'static' }
  try {
    // supabase-js 는 이 페이지에서만 필요하므로 지연 로딩한다.
    const { supabase } = await import('./supabase.js')
    const { data, error } = await supabase
      .from('dormitories')
      .select('*, dormitory_rooms(room_type, sort_order)')
      .order('sort_order')
    if (error) throw error
    if (!data?.length) return { items: DORMITORIES, source: 'static' }
    return { items: data.map(fromRow), source: 'supabase' }
  } catch (err) {
    console.warn('[supabase] 생활관 목록을 불러오지 못해 기본 데이터를 사용합니다.', err)
    return { items: DORMITORIES, source: 'static' }
  }
}

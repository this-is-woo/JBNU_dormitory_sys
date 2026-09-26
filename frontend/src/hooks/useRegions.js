import { useEffect, useState } from 'react'

// regions.json 은 홈의 주소지 드롭다운에서만 필요하므로 별도 청크로 지연 로딩한다.
// 파일은 scripts/build_regions.py 로 생성된다.
let cache = null

/**
 * 시/도 → 시/군/구 데이터
 * sido[]: { code, name, sigungu[]: { code, name, km, distanceScore } } — 2026학년도 선발기준 거리 데이터
 */
export function useRegions() {
  const [regions, setRegions] = useState(cache)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (cache) return
    let active = true
    import('../data/regions.json')
      .then((mod) => {
        cache = mod.default
        if (active) setRegions(cache)
      })
      .catch((err) => active && setError(err))
    return () => {
      active = false
    }
  }, [])

  return { regions, error, loading: !regions && !error }
}

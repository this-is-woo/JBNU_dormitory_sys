import { useEffect, useState } from 'react'

// regions.json(약 160KB)은 예측 페이지에서만 필요하므로 별도 청크로 지연 로딩한다.
// 파일은 scripts/build_regions.py 로 생성된다.
let cache = null

/**
 * 시/도 → 시/군/구 → 읍/면/동 데이터
 * sido[]: { code, name, sigungu[]: { code, name, km, distanceScore, note?, emd: [code, name][] } }
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

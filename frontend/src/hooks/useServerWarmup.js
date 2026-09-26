import { useEffect } from 'react'
import { checkHealth } from '../lib/api.js'

/**
 * 사이트에 들어오자마자 /health 를 한 번 호출해 잠든 Render 인스턴스를 미리 깨운다.
 * 결과는 화면에 표시하지 않는다. (예측 요청이 느리면 결과 패널에서 안내)
 */
export function useServerWarmup() {
  useEffect(() => {
    checkHealth().catch(() => {})
  }, [])
}

import { API_BASE_URL } from '../config.js'

// Render 무료 플랜은 유휴 상태에서 잠들기 때문에 첫 요청이 50초 이상 걸릴 수 있다.
const DEFAULT_TIMEOUT_MS = 70_000

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function errorMessage(body, status) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) return detail.map((d) => d.msg).join(', ')
  return `요청을 처리하지 못했습니다. (HTTP ${status})`
}

async function request(path, { timeout = DEFAULT_TIMEOUT_MS, body, ...options } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(errorMessage(data, res.status), res.status)
    return data
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err.name === 'AbortError') {
      throw new ApiError('서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.')
    }
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.')
  } finally {
    clearTimeout(timer)
  }
}

/** 서버 상태 확인 (잠든 Render 인스턴스를 깨우는 역할도 한다) */
export const checkHealth = () => request('/health')

/**
 * 호실 유형별 합격률 예측
 * @param {{collegeCode:string, gpa:number, merit:number, demerit:number, sidoCode:string, sigunguCode:string}} payload
 */
export const predictAdmission = (payload) => request('/api/v1/predict', { method: 'POST', body: payload })

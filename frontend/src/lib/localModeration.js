// 데모(Supabase 미연결)에서 관리자 페이지가 정한 이용 정지. 이 브라우저에만 저장된다.
// 실제 서비스에서는 DB 의 roommate_moderation 이 이 역할을 한다.
const KEY = 'jbnu-dorm:roommate-moderation' // { [userId]: { isSuspended, suspendedUntil, note, updatedAt } }

export function readModeration() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

export function writeModeration(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // 저장소를 쓸 수 없으면 새로고침하면 사라진다
  }
}

/** 지금 정지 중인지 (기한이 지났으면 아님) */
export function isLocallySuspended(userId, now = Date.now()) {
  const m = readModeration()[userId]
  return Boolean(m?.isSuspended && (!m.suspendedUntil || new Date(m.suspendedUntil).getTime() > now))
}

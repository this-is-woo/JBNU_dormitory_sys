// 로그인하러 구글에 다녀온 뒤 "누르려던 버튼"을 이어서 하기 위한 기억.
// 구글 로그인을 도중에 그만두면 기억이 남아, 한참 뒤 다른 곳에서 로그인했을 때 엉뚱한 창이 뜰 수 있다.
// 그래서 잠깐(10분)만 유효하게 한다. 탭을 닫으면 사라지도록 sessionStorage 에 둔다.
const TTL_MS = 10 * 60 * 1000

export function rememberAfterLogin(key, value) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify({ value, at: Date.now() }))
    else sessionStorage.removeItem(key)
  } catch {
    // 저장하지 못하면 로그인 뒤 이어서 하기만 생략된다
  }
}

/** 기억한 값 (없거나 오래됐으면 null) */
export function recallAfterLogin(key) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key))
    if (saved && typeof saved === 'object' && Date.now() - saved.at < TTL_MS) return saved.value ?? null
    sessionStorage.removeItem(key)
  } catch {
    // 예전 형식이거나 저장소를 못 쓰면 없는 것으로 본다
  }
  return null
}

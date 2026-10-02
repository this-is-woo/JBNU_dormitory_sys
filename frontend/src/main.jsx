// 전역 스타일을 가장 먼저 불러와야 컴포넌트 CSS 가 그 위에 덮어쓸 수 있다.
import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { prefetchPages, router } from './router.jsx'

// 새 버전이 배포되면 예전 화면이 불러오려던 코드 조각이 사라진다. 그때는 한 번만 새로고침해 새 버전을 받는다.
// (방금 새로고침했는데도 또 실패하면 반복하지 않고, 화면의 오류 안내(RouteError)에 맡긴다)
const RELOADED_AT = 'jbnu-dorm:reloaded-for-update'
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT))
    if (last && Date.now() - last < 60_000) return
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch {
    // 저장소를 못 쓰면 반복 여부를 알 수 없으니 새로고침하지 않는다
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

// 첫 화면이 뜬 뒤 다른 페이지 코드를 미리 받아 둔다
if (document.readyState === 'complete') prefetchPages()
else window.addEventListener('load', prefetchPages, { once: true })

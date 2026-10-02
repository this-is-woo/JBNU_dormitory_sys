import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router'
import RouteError from './components/common/RouteError.jsx'
import Layout from './components/layout/Layout.jsx'
import HomePage from './pages/HomePage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

// 예전 신청 내역 주소(/roommates/requests[/:id][?post=]) → 채팅 주소 (쿼리 유지)
function LegacyChatRedirect() {
  const { requestId } = useParams()
  const { search } = useLocation()
  return <Navigate to={`/chats${requestId ? `/${requestId}` : ''}${search}`} replace />
}

// 홈 말고는 그 페이지를 열 때 코드를 받는다 (첫 화면에서 받을 코드를 줄여 빨리 뜨게).
// 대신 첫 화면이 뜨고 나서 한가할 때 미리 받아 두므로(prefetchPages), 탭을 눌렀을 때 기다리지 않는다.
const pages = {
  roommates: () => import('./pages/RoommatesPage.jsx'),
  dorms: () => import('./pages/DormsPage.jsx'),
  chatList: () => import('./pages/ChatListPage.jsx'),
  chatRoom: () => import('./pages/ChatRoomPage.jsx'),
  support: () => import('./pages/SupportPage.jsx'),
  policy: () => import('./pages/PolicyPage.jsx'),
  admin: () => import('./pages/AdminPage.jsx'),
  me: () => import('./pages/MyPage.jsx'),
}
const page = (load, name = 'default') => () => load().then((m) => ({ Component: m[name] }))

/** 자주 여는 페이지의 코드를 미리 받아 둔다 (첫 화면이 다 뜬 뒤, 브라우저가 한가할 때) */
export function prefetchPages() {
  const run = () => {
    for (const load of [pages.roommates, pages.dorms, pages.chatList, pages.chatRoom, pages.me]) load().catch(() => {})
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 2000)
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    // 헤더·푸터까지 그리지 못한 경우
    errorElement: <RouteError />,
    // 첫 화면이 다른 페이지(예: /roommates)여서 그 코드를 받는 동안: 빈 화면 (아주 잠깐)
    HydrateFallback: () => null,
    children: [
      {
        // 페이지에서 난 오류는 헤더·푸터를 둔 채로 본문 자리에 보여 준다
        errorElement: <RouteError />,
        children: [
          { path: '/', element: <HomePage /> },
          // 예전 주소 호환: 합격률 예측은 홈으로 합쳐졌다
          { path: '/predict', element: <Navigate to="/" replace /> },
          { path: '/roommates', lazy: page(pages.roommates) },
          // 채팅: 룸메 신청으로 시작된 대화
          { path: '/chats', lazy: page(pages.chatList) },
          // 새 대화창: 첫 메시지를 보내기 전까지는 아무것도 저장하지 않는다
          { path: '/chats/new/:postId', lazy: page(pages.chatRoom) },
          { path: '/chats/:requestId', lazy: page(pages.chatRoom) },
          // 예전 주소 호환 (신청 내역 → 채팅)
          { path: '/roommates/requests', element: <LegacyChatRedirect /> },
          { path: '/roommates/requests/:requestId', element: <LegacyChatRedirect /> },
          { path: '/dorms', lazy: page(pages.dorms) },
          // 내 정보: 계정 · 룸메이트 찾기 정보 · 바로가기 · 알림 · 로그아웃 (모바일 하단 탭의 [내 정보])
          { path: '/me', lazy: page(pages.me) },
          { path: '/support', lazy: page(pages.support) },
          // 관리자만 (권한은 DB 가 확인하고, 다른 사용자에게는 없는 페이지로 보인다)
          { path: '/admin', lazy: page(pages.admin) },
          { path: '/privacy', lazy: page(pages.policy, 'PrivacyPage') },
          { path: '/terms', lazy: page(pages.policy, 'TermsPage') },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

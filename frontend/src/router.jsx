import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router'
import RouteError from './components/common/RouteError.jsx'
import Layout from './components/layout/Layout.jsx'
import DormsPage from './pages/DormsPage.jsx'
import HomePage from './pages/HomePage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import { PrivacyPage, TermsPage } from './pages/PolicyPage.jsx'
import RoommatesPage from './pages/RoommatesPage.jsx'
import SupportPage from './pages/SupportPage.jsx'

// 예전 신청 내역 주소(/roommates/requests[/:id][?post=]) → 채팅 주소 (쿼리 유지)
function LegacyChatRedirect() {
  const { requestId } = useParams()
  const { search } = useLocation()
  return <Navigate to={`/chats${requestId ? `/${requestId}` : ''}${search}`} replace />
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    // 헤더·푸터까지 그리지 못한 경우
    errorElement: <RouteError />,
    children: [
      {
        // 페이지에서 난 오류는 헤더·푸터를 둔 채로 본문 자리에 보여 준다
        errorElement: <RouteError />,
        children: [
          { path: '/', element: <HomePage /> },
          // 예전 주소 호환: 합격률 예측은 홈으로 합쳐졌다
          { path: '/predict', element: <Navigate to="/" replace /> },
          { path: '/roommates', element: <RoommatesPage /> },
          // 채팅: 룸메 신청으로 시작된 대화 (로그인한 사용자만 쓰므로 열 때 코드를 받는다)
          { path: '/chats', lazy: () => import('./pages/ChatListPage.jsx').then((m) => ({ Component: m.default })) },
          // 새 대화창: 첫 메시지를 보내기 전까지는 아무것도 저장하지 않는다
          { path: '/chats/new/:postId', lazy: () => import('./pages/ChatRoomPage.jsx').then((m) => ({ Component: m.default })) },
          { path: '/chats/:requestId', lazy: () => import('./pages/ChatRoomPage.jsx').then((m) => ({ Component: m.default })) },
          // 예전 주소 호환 (신청 내역 → 채팅)
          { path: '/roommates/requests', element: <LegacyChatRedirect /> },
          { path: '/roommates/requests/:requestId', element: <LegacyChatRedirect /> },
          { path: '/dorms', element: <DormsPage /> },
          { path: '/support', element: <SupportPage /> },
          // 관리자만 (권한은 DB 가 확인하고, 다른 사용자에게는 없는 페이지로 보인다).
          // 일반 사용자는 쓰지 않으므로 이 페이지를 열 때만 코드를 받는다.
          { path: '/admin', lazy: () => import('./pages/AdminPage.jsx').then((m) => ({ Component: m.default })) },
          { path: '/privacy', element: <PrivacyPage /> },
          { path: '/terms', element: <TermsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

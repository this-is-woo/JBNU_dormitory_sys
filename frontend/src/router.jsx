import { createBrowserRouter, Navigate } from 'react-router'
import Layout from './components/layout/Layout.jsx'
import DormsPage from './pages/DormsPage.jsx'
import HomePage from './pages/HomePage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import { PrivacyPage, TermsPage } from './pages/PolicyPage.jsx'
import RoommatesPage from './pages/RoommatesPage.jsx'
import SupportPage from './pages/SupportPage.jsx'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      // 예전 주소 호환: 합격률 예측은 홈으로 합쳐졌다
      { path: '/predict', element: <Navigate to="/" replace /> },
      { path: '/roommates', element: <RoommatesPage /> },
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
])

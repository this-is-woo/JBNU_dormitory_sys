import { Outlet, ScrollRestoration } from 'react-router'
import { useServerWarmup } from '../../hooks/useServerWarmup.js'
import Footer from './Footer.jsx'
import Header from './Header.jsx'

export default function Layout() {
  useServerWarmup()

  return (
    <>
      <div className="app-shell">
        <a href="#main" className="skip-link">
          본문 바로가기
        </a>
        <Header />
        <main id="main" className="app-main">
          <Outlet />
        </main>
        <Footer />
      </div>
      <ScrollRestoration />
    </>
  )
}

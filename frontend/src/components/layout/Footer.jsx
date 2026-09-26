import { Link } from 'react-router'
import { JBNU_URL, OFFICIAL_DORM_URL } from '../../config.js'
import { IconExternal } from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'
import { NAV_ITEMS } from './Header.jsx'
import './Footer.css'

const EXTERNAL_LINKS = [
  { href: OFFICIAL_DORM_URL, label: '전북대학교 생활관' },
  { href: JBNU_URL, label: '전북대학교' },
]

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-about">
          <Logo size="sm" />
          <p>
            전북대학교 생활관 선발 기준으로 환산점수를 계산하고, 과거 선발 데이터로 학습한 AI 모델로 생활관별
            합격 가능성을 예측합니다.
          </p>
        </div>

        <nav className="footer-col" aria-label="서비스 메뉴">
          <h2>서비스</h2>
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Link to={item.to}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="footer-col" aria-label="관련 사이트">
          <h2>관련 사이트</h2>
          <ul>
            {EXTERNAL_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                  <IconExternal width={14} height={14} />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="footer-col">
          <h2>데이터 출처</h2>
          <ul className="footer-sources">
            <li>거리점수 · 전북대 생활관 「2025학년도 선발기준 거리 데이터」</li>
            <li>행정구역 · 행정표준코드관리시스템 법정동코드</li>
            <li>생활관 정보 · 「2024학년도 생활관생 모집안내」</li>
          </ul>
        </div>
      </div>

      <div className="container footer-bottom">
        <p className="footer-disclaimer">
          <span className="footer-disclaimer-full">
            본 서비스는 전북대학교 공식 서비스가 아니며 예측 결과는 참고용입니다. 실제 선발 기준과 결과는 생활관
            공지사항을 확인하세요.
          </span>
          <span className="footer-disclaimer-short">전북대학교 비공식 서비스 · 예측 결과는 참고용</span>
        </p>
        <p className="footer-legal">
          <Link to="/privacy">개인정보처리방침</Link>
          <Link to="/terms">서비스 약관</Link>
          <span>© {new Date().getFullYear()} JBNU Dormitory Predictor</span>
        </p>
      </div>
    </footer>
  )
}

import { Link } from 'react-router'
import { OFFICIAL_DORM_URL } from '../../config.js'
import Logo from '../common/Logo.jsx'
import './Footer.css'

// 페이지 이동은 헤더에 있으니, 푸터에는 꼭 필요한 것만: 약관 · 공식 사이트 · 비공식 안내 · 데이터 출처
const SOURCES = [
  '거리점수: 전북대 생활관 「2025학년도 선발기준 거리 데이터」',
  '행정구역: 행정표준코드관리시스템 법정동코드',
  '생활관 정보: 「2024학년도 생활관생 모집안내」',
]

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-top">
          <Logo size="sm" />
          <nav className="footer-links" aria-label="약관 및 관련 사이트">
            <Link to="/privacy">개인정보처리방침</Link>
            <Link to="/terms">서비스 약관</Link>
            <a href={OFFICIAL_DORM_URL} target="_blank" rel="noreferrer">
              전북대 생활관 ↗
            </a>
          </nav>
        </div>
        <p className="footer-note">
          전북대학교 공식 서비스가 아니며, 예측 결과는 참고용이에요. 실제 선발은 생활관 공지사항을 확인하세요.
        </p>
        <p className="footer-sources">
          {SOURCES.join(' · ')} · © {new Date().getFullYear()} JBNU Dormi
        </p>
      </div>
    </footer>
  )
}

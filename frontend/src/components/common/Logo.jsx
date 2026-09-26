import { Link } from 'react-router'
import './Logo.css'

/** 워드마크 로고: 세리프 "JBNU 생활관" */
export default function Logo({ size = 'md', onClick }) {
  return (
    <Link to="/" className={`logo logo-${size}`} onClick={onClick} aria-label="JBNU 생활관 홈">
      <span className="logo-en">JBNU</span>
      <span className="logo-ko">생활관</span>
    </Link>
  )
}

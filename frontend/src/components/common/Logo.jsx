import { Link } from 'react-router'
import './Logo.css'

/** 워드마크 로고: 세리프 "JBNU Dormi" */
export default function Logo({ size = 'md', onClick }) {
  return (
    <Link to="/" className={`logo logo-${size}`} onClick={onClick} aria-label="JBNU Dormi 홈">
      <span className="logo-en">JBNU</span>
      <span className="logo-name">Dormi</span>
    </Link>
  )
}

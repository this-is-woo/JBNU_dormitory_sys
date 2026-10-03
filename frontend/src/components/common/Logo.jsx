import { Link } from 'react-router'
import './Logo.css'

/** 로고: 굵은 "Dormi". i 의 점은 파란 점으로 바꿔 찍는다 */
export default function Logo({ size = 'md', onClick }) {
  return (
    <Link to="/" className={`logo logo-${size}`} onClick={onClick} aria-label="Dormi 홈">
      <span className="logo-word" aria-hidden="true">
        Dorm<span className="logo-i">ı</span>
      </span>
    </Link>
  )
}

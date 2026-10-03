import { useId } from 'react'

/**
 * 로고 심볼: 파란 둥근 사각형 안에 집(생활관), 창 자리에 초승달(잠 · dormire).
 * 달은 집에 뚫린 구멍이라 뒤의 파란 바탕이 비친다. 같은 모양이 favicon · 앱 아이콘에도 쓰인다.
 */
export default function LogoMark({ size = 28, className }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5b8ff7" />
          <stop offset="1" stopColor="#2f5fd0" />
        </linearGradient>
        <mask id={`${id}m`}>
          <path
            d="M8 15.2 16 8.6l8 6.6v8.3c0 .9-.7 1.6-1.6 1.6H9.6c-.9 0-1.6-.7-1.6-1.6z"
            fill="#fff"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="19" r="4" fill="#000" />
          <circle cx="17.9" cy="17.4" r="3.4" fill="#fff" />
        </mask>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}g)`} />
      <rect width="32" height="32" fill="#fff" mask={`url(#${id}m)`} />
    </svg>
  )
}

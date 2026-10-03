import { useEffect, useRef, useState } from 'react'
import { IconArrowLeft, IconArrowRight } from '../common/Icons.jsx'

/**
 * 생활관 카드 맨 위 사진 슬라이더: 외관 → 내부 사진.
 *   · 휴대폰: 손가락으로 옆으로 넘긴다 (브라우저의 가로 스크롤 + 칸 맞춤이라 버벅이지 않는다)
 *   · PC: 사진 위에 마우스를 올리면 좌우 화살표
 *   · 아래 점 · 오른쪽 위 "1 / 5" 로 몇 번째 사진인지 보여 준다
 * 사진이 한 장이면 슬라이더 없이 그 사진만 보여 준다.
 * @param {{ src: string, alt: string }[]} photos
 */
export default function DormGallery({ name, photos }) {
  const trackRef = useRef(null)
  const [index, setIndex] = useState(0)
  const count = photos.length

  // 스크롤 위치로 지금 사진 번호를 맞춘다 (한 프레임에 한 번만 계산)
  useEffect(() => {
    const track = trackRef.current
    if (!track || count < 2) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setIndex(Math.round(track.scrollLeft / track.clientWidth)))
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      track.removeEventListener('scroll', onScroll)
    }
  }, [count])

  function go(next) {
    const track = trackRef.current
    if (!track) return
    const target = Math.max(0, Math.min(count - 1, next))
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' })
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1)
    }
  }

  if (!count) return null
  if (count === 1) {
    const [p] = photos
    return (
      <div className="dorm-gallery">
        <img className="dorm-photo" src={p.src} alt={p.alt} width="960" height="540" loading="lazy" decoding="async" />
      </div>
    )
  }

  return (
    <div className="dorm-gallery" role="region" aria-roledescription="사진 슬라이더" aria-label={`${name} 사진`}>
      <div className="dorm-gallery-track" ref={trackRef} tabIndex={0} onKeyDown={onKeyDown}>
        {photos.map((p, i) => (
          <img
            key={p.src}
            className="dorm-photo"
            src={p.src}
            alt={p.alt}
            width="960"
            height="540"
            loading="lazy"
            decoding="async"
            aria-hidden={i !== index || undefined}
          />
        ))}
      </div>

      <span className="dorm-gallery-count tabular" aria-hidden="true">
        {index + 1} / {count}
      </span>

      <button
        type="button"
        className="dorm-gallery-arrow is-prev"
        aria-label="이전 사진"
        onClick={() => go(index - 1)}
        disabled={index === 0}
      >
        <IconArrowLeft width={18} height={18} />
      </button>
      <button
        type="button"
        className="dorm-gallery-arrow is-next"
        aria-label="다음 사진"
        onClick={() => go(index + 1)}
        disabled={index === count - 1}
      >
        <IconArrowRight width={18} height={18} />
      </button>

      <div className="dorm-gallery-dots">
        {photos.map((p, i) => (
          <button
            key={p.src}
            type="button"
            className={`dorm-gallery-dot${i === index ? ' is-active' : ''}`}
            aria-label={`${i + 1}번째 사진 보기`}
            aria-current={i === index || undefined}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </div>
  )
}

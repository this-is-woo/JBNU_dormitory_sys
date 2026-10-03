import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconArrowLeft, IconArrowRight } from '../common/Icons.jsx'

const mod = (a, n) => ((a % n) + n) % n
const HAS_SCROLLEND = typeof window !== 'undefined' && 'onscrollend' in window

/**
 * 생활관 카드 맨 위 사진 슬라이더: 외관 → 내부 사진. 끝에서 더 넘기면 처음으로 이어진다 (5/5 → 1/5, 1/5 → 5/5).
 *   · 휴대폰: 손가락으로 옆으로 넘긴다 (브라우저의 가로 스크롤 + 칸 맞춤이라 버벅이지 않는다)
 *   · PC: 사진 위에 마우스를 올리면 좌우 화살표
 *   · 아래 점 · 오른쪽 위 "1 / 5" 로 몇 번째 사진인지 보여 준다
 * 이어지게 하는 방법: 맨 앞에 마지막 사진, 맨 뒤에 첫 사진을 하나씩 더 붙여 두고(복제),
 * 복제 칸에 멈추면 같은 사진의 진짜 칸으로 몰래(애니메이션 없이) 옮긴다. 화면에는 같은 사진이라 티가 나지 않는다.
 * 사진이 한 장이면 슬라이더 없이 그 사진만 보여 준다.
 * @param {{ src: string, alt: string }[]} photos
 */
export default function DormGallery({ name, photos }) {
  const trackRef = useRef(null)
  const slotRef = useRef(1) // 지금 보이는 칸 (0: 앞 복제 · 1..count: 진짜 · count+1: 뒤 복제)
  const targetRef = useRef(null) // 화살표로 넘어가는 중인 칸 (빠르게 여러 번 누르면 거기서 이어서 센다)
  const [index, setIndex] = useState(0) // 진짜 사진 번호 (0부터)
  // 카드가 화면에 들어와 첫 사진을 받으면 나머지도 미리 받는다 (끝에서 처음으로 넘어갈 때 빈 칸이 보이지 않게)
  const [warm, setWarm] = useState(false)
  const count = photos.length

  // 칸 번호로 바로 옮긴다 (애니메이션 없이)
  const jump = (slot) => {
    const track = trackRef.current
    if (!track) return
    slotRef.current = slot
    track.scrollTo({ left: slot * track.clientWidth, behavior: 'instant' })
  }

  // 처음에는 첫 사진(1번 칸)에서 시작. 카드 폭이 바뀌어도(화면 회전 등) 같은 사진에 맞춘다
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || count < 2) return
    jump(1)
    const ro = new ResizeObserver(() => jump(slotRef.current))
    ro.observe(track)
    return () => ro.disconnect()
  }, [count])

  // 스크롤 위치로 지금 사진 번호를 맞추고, 복제 칸에 멈추면 진짜 칸으로 옮긴다
  useEffect(() => {
    const track = trackRef.current
    if (!track || count < 2) return
    let frame = 0
    let timer = 0
    let touching = false

    const settle = () => {
      if (touching) return // 손가락이 아직 화면에 있으면 놓은 뒤에
      const pos = track.scrollLeft / track.clientWidth
      // 화살표로 가는 중인데 아직 도착 전이면 기다린다 (중간에 몰래 옮길 때도 scrollend 가 오기 때문)
      if (targetRef.current != null && Math.abs(pos - targetRef.current) > 0.02) return
      targetRef.current = null
      const slot = Math.round(pos)
      if (slot <= 0) jump(count)
      else if (slot >= count + 1) jump(1)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const slot = Math.round(track.scrollLeft / track.clientWidth)
        slotRef.current = slot
        setIndex(mod(slot - 1, count))
      })
      // scrollend 를 모르는 브라우저(예전 사파리): 스크롤이 잠깐 멈추면 끝난 것으로 본다
      if (!HAS_SCROLLEND) {
        clearTimeout(timer)
        timer = setTimeout(settle, 140)
      }
    }
    const onTouchStart = () => {
      touching = true
      targetRef.current = null // 손가락으로 넘기기 시작하면 화살표로 가던 칸은 잊는다
    }
    const onTouchEnd = () => {
      touching = false
      if (!HAS_SCROLLEND) {
        clearTimeout(timer)
        timer = setTimeout(settle, 140)
      }
    }

    track.addEventListener('scroll', onScroll, { passive: true })
    // 트랙패드 · 마우스 휠로 직접 넘기기 시작해도 화살표로 가던 칸은 잊는다
    const onWheel = () => {
      targetRef.current = null
    }
    track.addEventListener('touchstart', onTouchStart, { passive: true })
    track.addEventListener('wheel', onWheel, { passive: true })
    track.addEventListener('touchend', onTouchEnd, { passive: true })
    track.addEventListener('touchcancel', onTouchEnd, { passive: true })
    if (HAS_SCROLLEND) track.addEventListener('scrollend', settle)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      track.removeEventListener('scroll', onScroll)
      track.removeEventListener('touchstart', onTouchStart)
      track.removeEventListener('wheel', onWheel)
      track.removeEventListener('touchend', onTouchEnd)
      track.removeEventListener('touchcancel', onTouchEnd)
      if (HAS_SCROLLEND) track.removeEventListener('scrollend', settle)
    }
  }, [count])

  // 한 칸 앞/뒤로 (화살표 · 키보드). 빠르게 여러 번 누르면 가는 중인 칸에서 이어서 센다.
  // 복제 칸을 넘어가야 하면 먼저 같은 그림이 보이는 진짜 쪽으로 사진 개수만큼 몰래 옮긴 뒤 넘긴다 (화면은 그대로)
  function step(dir) {
    const track = trackRef.current
    if (!track) return
    const w = track.clientWidth
    let slot = targetRef.current ?? Math.round(track.scrollLeft / w)
    if (slot + dir > count + 1 || slot + dir < 0) {
      const shift = slot + dir > count + 1 ? -count : count
      track.scrollTo({ left: track.scrollLeft + shift * w, behavior: 'instant' })
      slot += shift
    }
    targetRef.current = slot + dir
    track.scrollTo({ left: (slot + dir) * w, behavior: 'smooth' })
  }

  // 점: 그 사진으로
  function goTo(i) {
    const track = trackRef.current
    if (!track) return
    targetRef.current = i + 1
    track.scrollTo({ left: (i + 1) * track.clientWidth, behavior: 'smooth' })
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
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

  // [마지막 복제, ...진짜 사진, 첫 복제]
  const slides = [
    { ...photos[count - 1], key: 'clone-last', clone: true },
    ...photos.map((p, i) => ({ ...p, key: p.src, i })),
    { ...photos[0], key: 'clone-first', clone: true },
  ]

  return (
    <div className="dorm-gallery" role="region" aria-roledescription="사진 슬라이더" aria-label={`${name} 사진`}>
      <div className="dorm-gallery-track" ref={trackRef} tabIndex={0} onKeyDown={onKeyDown}>
        {slides.map((p, slot) => (
          <img
            key={p.key}
            className="dorm-photo"
            src={p.src}
            alt={p.clone ? '' : p.alt}
            width="960"
            height="540"
            loading={warm ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={slot === 1 && !warm ? () => setWarm(true) : undefined}
            aria-hidden={p.clone || p.i !== index || undefined}
          />
        ))}
      </div>

      <span className="dorm-gallery-count tabular" aria-hidden="true">
        {index + 1} / {count}
      </span>

      <button type="button" className="dorm-gallery-arrow is-prev" aria-label="이전 사진" onClick={() => step(-1)}>
        <IconArrowLeft width={18} height={18} />
      </button>
      <button type="button" className="dorm-gallery-arrow is-next" aria-label="다음 사진" onClick={() => step(1)}>
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
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  )
}

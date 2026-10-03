import { useEffect, useRef } from 'react'
import { vibrate } from '../../lib/preferences.js'
import { LONG_PRESS_MS, popPress } from '../../lib/press.js'

// 꾹 누르기: LONG_PRESS_MS 만큼 누르고 있으면 메뉴 (손가락이 이만큼 움직이면 스크롤로 보고 취소)
// 누르는 동안 천천히 눌리는 모습 · 메뉴가 뜰 때 튀어 오르는 모습은 lib/press.js (data-longpress)
const MOVE_TOLERANCE = 10

/**
 * 꾹 누르거나(휴대폰) 오른쪽 클릭하면(PC) onPress. 돌려주는 핸들러를 요소에 그대로 붙인다.
 * 꾹 누른 뒤 손을 떼면 이어서 오는 클릭(예: 링크 이동)은 막는다.
 */
export function useLongPress(onPress) {
  const timer = useRef(null)
  const start = useRef(null)
  const fired = useRef(false)
  const target = useRef(null)
  const cancel = () => {
    clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => cancel, [])
  return {
    'data-longpress': '',
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      start.current = { x: e.clientX, y: e.clientY }
      target.current = e.currentTarget
      fired.current = false
      cancel()
      timer.current = setTimeout(() => {
        timer.current = null
        fired.current = true
        vibrate(10) // 내 정보 > 설정에서 끌 수 있다
        popPress(target.current)
        onPress()
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e) => {
      if (!timer.current || !start.current) return
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => {
      e.preventDefault()
      cancel()
      fired.current = true
      onPress()
    },
    onClickCapture: (e) => {
      if (!fired.current) return
      fired.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}

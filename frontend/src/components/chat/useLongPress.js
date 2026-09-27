import { useEffect, useRef } from 'react'

// 꾹 누르기: 이만큼 누르고 있으면 메뉴 (손가락이 이만큼 움직이면 스크롤로 보고 취소)
const LONG_PRESS_MS = 450
const MOVE_TOLERANCE = 10

/**
 * 꾹 누르거나(휴대폰) 오른쪽 클릭하면(PC) onPress. 돌려주는 핸들러를 요소에 그대로 붙인다.
 * 꾹 누른 뒤 손을 떼면 이어서 오는 클릭(예: 링크 이동)은 막는다.
 */
export function useLongPress(onPress) {
  const timer = useRef(null)
  const start = useRef(null)
  const fired = useRef(false)
  const cancel = () => {
    clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => cancel, [])
  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      start.current = { x: e.clientX, y: e.clientY }
      fired.current = false
      cancel()
      timer.current = setTimeout(() => {
        timer.current = null
        fired.current = true
        navigator.vibrate?.(10)
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

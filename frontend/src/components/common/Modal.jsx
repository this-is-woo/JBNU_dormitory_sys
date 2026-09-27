import { useEffect, useRef } from 'react'
import { IconClose } from './Icons.jsx'
import './Modal.css'

/**
 * <dialog> 기반 모달. Esc·바깥 클릭으로 닫힌다.
 * @param {'md'|'lg'} size
 * @param {React.ReactNode} footer  하단 고정 영역 (버튼 등)
 * @param {React.ElementType} as    본문을 감쌀 요소 (form 이면 onSubmit 을 넘긴다)
 */
export default function Modal({ open, onClose, title, subtitle, size = 'md', footer, as: Wrapper = 'div', wrapperProps, children }) {
  const ref = useRef(null)
  // open 이 false 가 되어 이쪽에서 닫은 경우, 뒤따르는 close 이벤트로 onClose 를 한 번 더 부르지 않는다
  // (닫기 버튼 → onClose → open=false → dialog.close() → close 이벤트 → onClose 두 번째 호출을 막음)
  const closingByProp = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) {
      closingByProp.current = true
      dialog.close()
    }
  }, [open])

  // Esc 로 닫힌 경우처럼 브라우저가 먼저 닫았을 때만 부모에게 알린다
  function handleNativeClose() {
    if (closingByProp.current) {
      closingByProp.current = false
      return
    }
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      onClose={handleNativeClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
    >
      <Wrapper className="modal-frame" {...wrapperProps}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">{open && children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </Wrapper>
    </dialog>
  )
}

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

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      onClose={onClose}
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

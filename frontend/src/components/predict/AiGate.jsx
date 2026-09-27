import { IconSparkles } from '../common/Icons.jsx'
import './AiGate.css'

/**
 * 합격률은 재미로 보는 값이라는 안내를 확인하기 전까지 예측 영역을 흐리게 가리고,
 * [확인했어요]를 눌러야 예측을 쓸 수 있게 한다.
 */
export default function AiGate({ unlocked, onUnlock, children }) {
  return (
    <div className={`ai-gate${unlocked ? ' is-unlocked' : ''}`}>
      <div className="ai-gate-content" inert={!unlocked || undefined} aria-hidden={!unlocked || undefined}>
        {children}
      </div>

      {!unlocked && (
        <div className="ai-gate-overlay">
          <div className="ai-gate-card" role="dialog" aria-labelledby="ai-gate-title" aria-describedby="ai-gate-desc">
            <span className="ai-gate-icon">
              <IconSparkles width={22} height={22} />
            </span>
            <h2 id="ai-gate-title">합격률은 그냥 재미로 봐 주세요!</h2>
            <p id="ai-gate-desc">임시 기준으로 계산한 값이라 실제 선발과는 상관없어요.</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={onUnlock}>
              확인했어요
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

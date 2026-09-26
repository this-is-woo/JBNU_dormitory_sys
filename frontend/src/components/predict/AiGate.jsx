import { IconSparkles } from '../common/Icons.jsx'
import './AiGate.css'

/**
 * AI 모델이 완성되기 전까지 예측 영역을 흐리게 가리고,
 * 참고용 안내를 확인해야 사용할 수 있게 한다.
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
            <h2 id="ai-gate-title">AI 합격률 예측은 준비 중이에요</h2>
            <p id="ai-gate-desc">
              합격률을 계산하는 AI 모델이 아직 완성되지 않았습니다. 지금 보이는 합격률은 임시 기준으로 계산한 값이라
              실제 결과와 다를 수 있으니 <strong>참고용으로만</strong> 봐 주세요.
            </p>
            <button type="button" className="btn btn-primary btn-lg" onClick={onUnlock}>
              확인했어요
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

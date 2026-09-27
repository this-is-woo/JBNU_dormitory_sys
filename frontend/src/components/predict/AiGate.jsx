import './AiGate.css'

/**
 * 합격률은 재미로 보는 값이라는 안내를 예측 영역 대신 보여 주고,
 * [확인했어요]를 눌러야 예측을 쓸 수 있게 한다.
 */
export default function AiGate({ unlocked, onUnlock, children }) {
  if (unlocked) return children
  return (
    <div className="ai-gate" role="note" aria-labelledby="ai-gate-title">
      <p>
        <strong id="ai-gate-title">합격률은 그냥 재미로 봐 주세요!</strong> 임시 기준으로 계산한 값이라 실제
        선발과는 상관없어요.
      </p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onUnlock}>
        확인했어요
      </button>
    </div>
  )
}

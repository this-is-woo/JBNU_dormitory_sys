/**
 * 잠긴 게시판 위에 띄우는 안내. 로그인 → 내 정보 등록을 마쳐야 글을 볼 수 있다.
 * @param {'loading'|'signedOut'|'noProfile'|'error'} stage  error: 내 정보를 불러오지 못함
 */
export default function BoardGate({ stage, onLogin, onRegister, onRetry }) {
  const steps = [
    { label: '구글 로그인', done: stage === 'noProfile' || stage === 'error' },
    { label: '기본 정보 · 체크리스트 등록', done: false },
  ]
  return (
    <div className="board-gate" role="dialog" aria-labelledby="board-gate-title" aria-describedby="board-gate-desc">
      <h2 id="board-gate-title">체크리스트를 등록하고 룸메이트를 찾아보세요</h2>
      <p id="board-gate-desc">
        서로의 생활 습관을 공개한 사람끼리만 글을 볼 수 있어요. 한 번 등록하면 다른 사람의 체크리스트와 나와 얼마나
        맞는지까지 바로 확인할 수 있어요.
      </p>

      <ol className="board-gate-steps">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? 'is-done' : i === (stage === 'noProfile' || stage === 'error' ? 1 : 0) ? 'is-current' : ''}>
            <span className="board-gate-no">{s.done ? '✓' : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {stage === 'loading' && (
        <p className="board-gate-loading">
          <span className="spinner" aria-hidden="true" /> 확인하는 중…
        </p>
      )}
      {stage === 'signedOut' && (
        <button type="button" className="btn btn-primary btn-lg" onClick={onLogin}>
          로그인하기
        </button>
      )}
      {stage === 'error' && (
        <>
          <p className="board-gate-loading" role="alert">
            내 정보를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={onRetry}>
            다시 시도
          </button>
        </>
      )}
      {stage === 'noProfile' && (
        <button type="button" className="btn btn-primary btn-lg" onClick={onRegister}>
          내 정보 등록하기
        </button>
      )}
      <small>1분이면 끝나요 · 이메일과 이름은 어디에도 표시되지 않아요</small>
    </div>
  )
}

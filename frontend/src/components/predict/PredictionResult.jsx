import { SELECTION_TYPES } from '../../data/dormitories.js'
import { formatScore } from '../../lib/score.js'
import { IconAlert, IconInfo, IconRefresh, IconSparkles } from '../common/Icons.jsx'
import './PredictionResult.css'

function ResultSkeleton({ slow }) {
  return (
    <div className="result-body" aria-busy="true">
      <div className="result-loading">
        <span className="spinner" aria-hidden="true" />
        <p>
          {slow
            ? '예측 서버가 절전 모드에서 깨어나는 중이에요. 처음 한 번은 최대 1분 정도 걸릴 수 있어요.'
            : '합격률을 계산하고 있어요…'}
        </p>
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  )
}

/** 호실 유형 한 줄: 이름 · 막대 · 퍼센트 (등급 표시 없이 숫자만) */
function RoomRow({ room, rank }) {
  const percent = Math.round(room.probability * 100)
  return (
    <li className="prob-item">
      <span className="prob-rank tabular" aria-hidden="true">
        {rank}
      </span>
      <div className="prob-name">
        <strong>
          {room.dormitory} <span className="prob-room">{room.roomType}</span>
        </strong>
        <span className="prob-meta">
          {SELECTION_TYPES[room.type]?.label ?? room.type} · {room.genders.join('·')}
        </span>
      </div>
      <div
        className="prob-bar"
        role="progressbar"
        aria-label={`${room.name} 예상 합격률`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className="prob-fill" style={{ width: `${Math.max(percent, 1)}%` }} />
      </div>
      <strong className="prob-value tabular">
        {percent}
        <small>%</small>
      </strong>
    </li>
  )
}

/**
 * 환산점수 입력이 모두 채워지면 HomePage 가 자동으로 계산해 넘겨준다.
 * @param {{status: 'idle'|'loading'|'success'|'error', data?: object, prev?: object, error?: string, slow?: boolean}} props.result
 *   loading 중 prev 가 있으면(입력을 고쳐 다시 계산하는 중) 직전 결과를 흐리게 보여 준다
 */
export default function PredictionResult({ result, onRetry }) {
  const { status } = result
  const updating = status === 'loading' && Boolean(result.prev)
  const data = status === 'success' ? result.data : updating ? result.prev : null

  return (
    <section className={`card result-card${updating ? ' is-updating' : ''}`} aria-label="예측 결과" aria-busy={updating || undefined}>
      {data && (
        <div className="result-head">
          <div className="result-meta">
            <span className="result-score">
              {data.collegeName} · 환산점수 <strong className="tabular">{formatScore(data.score.convertedScore)}</strong>
            </span>
            {data.model.mode === 'model' ? (
              <span className="chip chip-primary">AI 모델 {data.model.version}</span>
            ) : (
              <span className="chip">임시 기준점</span>
            )}
            {updating && (
              <span className="result-updating" role="status">
                <span className="spinner" aria-hidden="true" />
                {result.slow ? '서버가 깨어나는 중이에요…' : '다시 계산하는 중…'}
              </span>
            )}
          </div>
        </div>
      )}

      {status === 'idle' && (
        <div className="result-empty">
          <IconSparkles width={28} height={28} />
          <p>단과대학·성별·직전학기 학점·주소지를 모두 입력하면 여기에 바로 계산돼요.</p>
        </div>
      )}

      {status === 'loading' && !updating && <ResultSkeleton slow={result.slow} />}

      {status === 'error' && (
        <div className="result-body">
          <div className="notice notice-danger" role="alert">
            <IconAlert width={18} height={18} />
            <div>
              <p>{result.error}</p>
              <button type="button" className="btn btn-secondary btn-sm retry-btn" onClick={onRetry}>
                <IconRefresh width={16} height={16} /> 다시 시도
              </button>
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="result-body">
          {data.notice && (
            <div className="notice notice-warning">
              <IconInfo width={18} height={18} />
              <p>{data.notice}</p>
            </div>
          )}
          {data.predictions.length > 0 && (
            <ul className="prob-list">
              {[...data.predictions]
                .sort((a, b) => b.probability - a.probability)
                .map((room, i) => (
                  <RoomRow key={room.code} room={room} rank={i + 1} />
                ))}
            </ul>
          )}

          <p className="result-footnote">
            {data.model.mode !== 'model' && '호실 유형별 임시 기준점과 내 환산점수의 차이로 추정한 값이에요. '}
            실제 선발은 성별·학년·단과대학별 모집 인원과 지원자 분포에 따라 달라지므로 참고용으로만 활용하세요.
          </p>
        </div>
      )}
    </section>
  )
}

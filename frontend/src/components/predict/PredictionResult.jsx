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
 * @param {{status: 'idle'|'loading'|'success'|'error', data?: object, error?: string, slow?: boolean}} props.result
 * @param {boolean} props.stale   결과를 받은 뒤 입력값이 바뀌었는지
 */
export default function PredictionResult({ result, stale, onRetry }) {
  const { status, data } = result

  return (
    <section className="card result-card" aria-label="예측 결과">
      {status === 'success' && (
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
          </div>
        </div>
      )}

      {status === 'idle' && (
        <div className="result-empty">
          <IconSparkles width={28} height={28} />
          <p>단과대학·성별·직전학기 학점·주소지를 입력하고 ‘합격률 예측하기’를 눌러 주세요.</p>
        </div>
      )}

      {status === 'loading' && <ResultSkeleton slow={result.slow} />}

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

      {status === 'success' && (
        <div className="result-body">
          {stale && (
            <div className="notice notice-warning">
              <IconInfo width={18} height={18} />
              <p>입력값이 바뀌었어요. 최신 결과를 보려면 다시 예측해 주세요.</p>
            </div>
          )}
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

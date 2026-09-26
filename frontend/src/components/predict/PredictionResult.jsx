import { SELECTION_TYPES } from '../../data/dormitories.js'
import { formatScore } from '../../lib/score.js'
import { IconAlert, IconInfo, IconRefresh, IconSparkles } from '../common/Icons.jsx'
import './PredictionResult.css'

function levelOf(probability) {
  if (probability >= 0.7) return { label: '안정', tone: 'success' }
  if (probability >= 0.4) return { label: '적정', tone: 'warning' }
  return { label: '도전', tone: 'danger' }
}

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

function RoomRow({ room }) {
  const level = levelOf(room.probability)
  const percent = Math.round(room.probability * 100)
  return (
    <li className="prob-item">
      <div className="prob-name">
        <strong>{room.dormitory}</strong>
        <span className="prob-room">{room.roomType}</span>
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
        <span className={`prob-fill tone-${level.tone}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="prob-value">
        <strong className="tabular">{percent}%</strong>
        <span className={`chip chip-${level.tone}`}>{level.label}</span>
      </div>
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
              <span className="chip chip-warning">임시 예측</span>
            )}
          </div>
        </div>
      )}

      {status === 'idle' && (
        <div className="result-empty">
          <IconSparkles width={28} height={28} />
          <p>단과대학·학점·주소지를 입력하고 ‘합격률 예측하기’를 눌러 주세요.</p>
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
          {data.model.mode !== 'model' && data.predictions.length > 0 && (
            <div className="notice">
              <IconInfo width={18} height={18} />
              <p>
                아직 학습된 모델이 연결되지 않아 임시 기준점으로 계산한 값입니다. 실제 합격 가능성과 다를 수
                있어요.
              </p>
            </div>
          )}

          {data.predictions.length > 0 && (
            <ul className="prob-list">
              {[...data.predictions]
                .sort((a, b) => b.probability - a.probability)
                .map((room) => (
                  <RoomRow key={room.code} room={room} />
                ))}
            </ul>
          )}

          <p className="result-footnote">
            같은 생활관이라도 1인실·2인실·6인실은 따로 선발되어 합격선이 다릅니다. 실제 선발은 성별·학년·단과대학별
            모집 인원과 지원자 분포에 따라 달라지므로 참고용으로만 활용하세요.
          </p>
        </div>
      )}
    </section>
  )
}

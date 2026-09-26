import { useEffect, useMemo, useRef, useState } from 'react'
import { IconAlert, IconArrowRight, IconGraduation, IconMapPin, IconStar } from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import AiGate from '../components/predict/AiGate.jsx'
import PredictionResult from '../components/predict/PredictionResult.jsx'
import { FormulaDisplay } from '../components/predict/ScoreFormula.jsx'
import ScoreInputTable from '../components/predict/ScoreInputTable.jsx'
import { findCollege } from '../data/colleges.js'
import { useRegions } from '../hooks/useRegions.js'
import { predictAdmission } from '../lib/api.js'
import { calcScoreBreakdown, parseGpa, parsePoint } from '../lib/score.js'
import { recordScore } from '../lib/scoreLog.js'
import './HomePage.css'

const INITIAL_FORM = {
  collegeCode: '',
  gpa: '',
  merit: '',
  demerit: '',
  sidoCode: '',
  sigunguCode: '',
  emdCode: '',
}
const SLOW_RESPONSE_MS = 4000
// 입력을 멈추고 이만큼 지나면 환산점수를 기록한다 (타이핑 중간값은 기록하지 않음)
const RECORD_DELAY_MS = 1500
const GATE_KEY = 'jbnu-dorm:ai-notice-acknowledged'

// 안내 확인 여부는 탭을 닫기 전까지만 기억한다 (저장소를 못 쓰는 환경이면 매번 안내)
function readAcknowledged() {
  try {
    return sessionStorage.getItem(GATE_KEY) === '1'
  } catch {
    return false
  }
}

const SCORE_RULES = [
  {
    icon: IconGraduation,
    title: '성적점수',
    range: '최대 90점',
    body: '직전 학기 평점(4.5 만점)을 90점 만점으로 환산합니다.',
  },
  {
    icon: IconStar,
    title: '상점 · 벌점',
    range: '1점당 ±0.009',
    body: '상점은 평점에 더하고 벌점은 뺍니다. 전년도 생활관 입주생에게만 반영돼요.',
  },
  {
    icon: IconMapPin,
    title: '거리점수',
    range: '5 ~ 10점',
    body: '생활관 관리동에서 주소지 시·군·구청까지 자동차 최단거리 20km마다 0.25점이 더해집니다.',
  },
]

function BlockHead({ id, title, desc }) {
  return (
    <header className="block-head">
      <h2 id={id}>{title}</h2>
      <p>{desc}</p>
    </header>
  )
}

export default function HomePage() {
  const { regions, error: regionsError } = useRegions()
  const [form, setForm] = useState(INITIAL_FORM)
  const [result, setResult] = useState({ status: 'idle' })
  const [submittedKey, setSubmittedKey] = useState(null)
  const [acknowledged, setAcknowledged] = useState(readAcknowledged)
  const resultRef = useRef(null)
  const slowTimer = useRef(null)

  useEffect(() => () => clearTimeout(slowTimer.current), [])

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  function acknowledge() {
    setAcknowledged(true)
    try {
      sessionStorage.setItem(GATE_KEY, '1')
    } catch {
      // 저장하지 못해도 이번 화면에서는 열린 상태를 유지
    }
  }

  const sigungu = useMemo(() => {
    const sido = regions?.sido.find((s) => s.code === form.sidoCode)
    return sido?.sigungu.find((g) => g.code === form.sigunguCode) ?? null
  }, [regions, form.sidoCode, form.sigunguCode])

  const college = findCollege(form.collegeCode)
  const gpa = parseGpa(form.gpa)
  const merit = parsePoint(form.merit)
  const demerit = parsePoint(form.demerit)
  const breakdown =
    gpa !== null && sigungu ? calcScoreBreakdown({ gpa, merit, demerit, distanceScore: sigungu.distanceScore }) : null

  // 단과대학·학점·주소지(시/군/구)가 모두 정해져 점수가 나오면 잠시 뒤 익명으로 기록
  const recordKey = college && breakdown ? [college.code, gpa, breakdown.distanceScore, breakdown.convertedScore].join('|') : null
  useEffect(() => {
    if (!recordKey) return
    const [collegeCode, g, distanceScore, convertedScore] = recordKey.split('|')
    const timer = setTimeout(
      () =>
        recordScore({
          collegeCode,
          gpa: Number(g),
          distanceScore: Number(distanceScore),
          convertedScore: Number(convertedScore),
        }),
      RECORD_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [recordKey])

  const payload =
    breakdown && college && form.emdCode
      ? {
          collegeCode: college.code,
          gpa,
          merit,
          demerit,
          sidoCode: form.sidoCode,
          sigunguCode: form.sigunguCode,
          emdCode: form.emdCode,
        }
      : null
  const payloadKey = payload ? JSON.stringify(payload) : null
  const isLoading = result.status === 'loading'

  async function runPrediction() {
    if (!payload || isLoading || !acknowledged) return
    setResult({ status: 'loading', slow: false })
    clearTimeout(slowTimer.current)
    slowTimer.current = setTimeout(
      () => setResult((r) => (r.status === 'loading' ? { ...r, slow: true } : r)),
      SLOW_RESPONSE_MS,
    )
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    try {
      const data = await predictAdmission(payload)
      setResult({ status: 'success', data })
      setSubmittedKey(payloadKey)
    } catch (err) {
      setResult({ status: 'error', error: err.message })
    } finally {
      clearTimeout(slowTimer.current)
    }
  }

  function handleReset() {
    setForm(INITIAL_FORM)
    setResult({ status: 'idle' })
    setSubmittedKey(null)
  }

  return (
    <>
      <title>JBNU Dormi | 생활관 합격 예측</title>
      <PageHeader
        title="내 점수로 보는 생활관 합격 가능성"
        lead="단과대학, 직전 학기 학점, JUMP에 등록된 주소지, 상·벌점을 입력하면 환산점수가 바로 계산되고 호관별 예상 합격률을 확인할 수 있어요."
      />

      <div className="container home-blocks">
        <section className="home-block" aria-labelledby="block-score">
          <BlockHead id="block-score" title="환산점수 계산" desc="입력하는 즉시 공식 선발 기준으로 환산점수가 계산돼요." />
          {regionsError && (
            <div className="notice notice-danger" role="alert">
              <IconAlert width={18} height={18} />
              <p>행정구역 데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>
            </div>
          )}
          <ScoreInputTable
            form={form}
            onChange={updateForm}
            regions={regions}
            college={college}
            sigungu={sigungu}
            breakdown={breakdown}
          />
          <div className="block-actions is-end">
            <button type="button" className="btn btn-ghost btn-lg" onClick={handleReset}>
              초기화
            </button>
          </div>
        </section>

        <section className="home-block" aria-labelledby="block-rules">
          <BlockHead id="block-rules" title="환산점수 계산 방법" desc="전북대학교 생활관 모집안내의 점수 산출 방법을 그대로 따릅니다." />
          <div className="formula-card">
            <FormulaDisplay />
            <p className="formula-note">최종 점수는 소수점 셋째 자리에서 반올림합니다.</p>
          </div>
          <div className="rule-grid">
            {SCORE_RULES.map(({ icon: Icon, title, range, body }) => (
              <article key={title} className="card rule-card">
                <span className="rule-icon">
                  <Icon width={20} height={20} />
                </span>
                <h3>{title}</h3>
                <p className="rule-range">{range}</p>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section ref={resultRef} className="home-block predict-result" aria-labelledby="block-result">
          <BlockHead id="block-result" title="호관별 예상 합격률" desc="같은 관이라도 1인실·2인실·6인실은 따로 선발되어 합격선이 달라요." />
          <AiGate unlocked={acknowledged} onUnlock={acknowledge}>
            <PredictionResult
              result={result}
              stale={result.status === 'success' && submittedKey !== payloadKey}
              onRetry={runPrediction}
            />
          </AiGate>
          <div className="block-actions">
            <p className="predict-hint">
              {!acknowledged
                ? '위 AI 예측 안내를 확인하면 합격률을 예측할 수 있어요.'
                : payload
                  ? '입력한 점수로 호관별 합격률을 계산해요.'
                  : '환산점수 계산의 항목을 모두 입력해 주세요.'}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={runPrediction}
              disabled={!payload || isLoading || !acknowledged}
            >
              {isLoading && <span className="spinner" aria-hidden="true" />}
              합격률 예측하기
              {!isLoading && <IconArrowRight width={18} height={18} />}
            </button>
          </div>
        </section>
      </div>
    </>
  )
}

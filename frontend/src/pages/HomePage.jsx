import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import LoginModal from '../components/auth/LoginModal.jsx'
import { IconAlert, IconArrowRight, IconChevronRight, IconUsers } from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import AiGate from '../components/predict/AiGate.jsx'
import PredictionResult from '../components/predict/PredictionResult.jsx'
import { FormulaDisplay } from '../components/predict/ScoreFormula.jsx'
import ScoreInputTable from '../components/predict/ScoreInputTable.jsx'
import ReportModal from '../components/report/ReportModal.jsx'
import { findCollege } from '../data/colleges.js'
import { useAuth } from '../hooks/useAuth.js'
import { useRegions } from '../hooks/useRegions.js'
import { recallAfterLogin, rememberAfterLogin } from '../lib/afterLogin.js'
import { predictAdmission } from '../lib/api.js'
import { calcScoreBreakdown, parseGpa, parsePoint } from '../lib/score.js'
import { recordScore } from '../lib/scoreLog.js'
import './HomePage.css'

const INITIAL_FORM = {
  collegeCode: '',
  gender: '',
  gpa: '',
  merit: '',
  demerit: '',
  sidoCode: '',
  sigunguCode: '',
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
    title: '성적점수',
    range: '최대 90점',
    body: '직전 학기 평점(4.5 만점)을 90점 만점으로 환산합니다.',
  },
  {
    title: '상점 · 벌점',
    // 평점에 ±0.009 → 90점 만점 환산 후 환산점수로는 1점당 ±0.18 (0.009 ÷ 4.5 × 90)
    range: '1점당 ±0.18',
    body: '상점 1점마다 환산점수가 0.18점 오르고, 벌점 1점마다 0.18점 내려갑니다. 전년도 생활관 입주생에게만 반영돼요.',
  },
  {
    title: '거리점수',
    range: '5 ~ 10점',
    body: ['거리(km) 기준: PC 카카오맵 → 길찾기', '출발지: 전북대학교 생활관 관리동', '도착지: 학생 주소의 시·군·구청'],
  },
]

// 구글 로그인 페이지로 이동했다 돌아오면 제보 창을 이어서 연다
const AFTER_LOGIN_KEY = 'jbnu-dorm:after-login-report'
const REPORT_LOGIN_POINTS = [
  '구글 계정으로 한 번에 로그인해요. 따로 가입할 필요가 없어요.',
  '계정당 학기별로 한 번만 제보할 수 있어 중복·장난 제보를 막아요.',
  '이메일·이름은 학습 데이터에 포함되지 않아요.',
]

const readAfterLogin = () => recallAfterLogin(AFTER_LOGIN_KEY) === 'report'
const writeAfterLogin = (on) => rememberAfterLogin(AFTER_LOGIN_KEY, on ? 'report' : null)

function BlockHead({ id, title, desc }) {
  return (
    <header className="block-head">
      <h2 id={id}>{title}</h2>
      {desc && <p>{desc}</p>}
    </header>
  )
}

export default function HomePage() {
  const { regions, error: regionsError } = useRegions()
  const [form, setForm] = useState(INITIAL_FORM)
  const [result, setResult] = useState({ status: 'idle' })
  const [submittedKey, setSubmittedKey] = useState(null)
  const [acknowledged, setAcknowledged] = useState(readAcknowledged)
  const { status: authStatus, user, signIn, signInWithIdToken } = useAuth()
  const [reportOpen, setReportOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const resultRef = useRef(null)
  const slowTimer = useRef(null)

  useEffect(() => () => clearTimeout(slowTimer.current), [])

  // 제보하려고 로그인했다면, 로그인이 끝나는 대로 제보 창을 연다
  useEffect(() => {
    if (authStatus !== 'signedIn' || !(loginOpen || readAfterLogin())) return
    writeAfterLogin(false)
    setLoginOpen(false)
    setReportOpen(true)
  }, [authStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  function openReport() {
    if (authStatus === 'signedIn') return setReportOpen(true)
    writeAfterLogin(true)
    setLoginOpen(true)
  }

  function closeLogin() {
    writeAfterLogin(false)
    setLoginOpen(false)
  }

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

  // 단과대학·성별·학점·주소지(시/군/구)가 모두 정해져 점수가 나오면 잠시 뒤 익명으로 기록.
  // 성별은 점수에 쓰이지 않지만 통계를 성별로 나눠 보려고 함께 남긴다. 성별을 나중에 고르면
  // 같은 계산이 성별 없이 한 번, 성별과 함께 한 번 두 번 남지 않도록 성별까지 정해진 뒤에 기록한다.
  const recordKey =
    college && form.gender && breakdown
      ? [college.code, form.gender, gpa, breakdown.distanceScore, breakdown.convertedScore].join('|')
      : null
  useEffect(() => {
    if (!recordKey) return
    const [collegeCode, gender, g, distanceScore, convertedScore] = recordKey.split('|')
    const timer = setTimeout(
      () =>
        recordScore({
          collegeCode,
          gender,
          gpa: Number(g),
          distanceScore: Number(distanceScore),
          convertedScore: Number(convertedScore),
        }),
      RECORD_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [recordKey])

  // 환산점수에는 성별이 필요 없지만, 합격률은 성별마다 지원 가능한 호관과 합격선이 달라 성별까지 있어야 예측한다
  const payload =
    breakdown && college && form.gender
      ? {
          collegeCode: college.code,
          gender: form.gender,
          gpa,
          merit,
          demerit,
          sidoCode: form.sidoCode,
          sigunguCode: form.sigunguCode,
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
        lead="입력하면 환산점수와 호관별 예상 합격률이 바로 나와요. 주소지는 JUMP에 등록된 주소 기준이에요."
      />

      {/* 모바일에서만: 룸메이트 찾기 소개 (PC 는 헤더 메뉴에 늘 보이므로 생략) */}
      <div className="container home-promo-wrap">
        <Link to="/roommates" className="home-promo">
          <span className="home-promo-icon" aria-hidden="true">
            <IconUsers width={22} height={22} />
          </span>
          <span className="home-promo-text">
            <span className="home-promo-kicker">룸메이트 찾기</span>
            <strong>요거 엄청 열심히 만들었어요..</strong>
            <span className="home-promo-desc">생활 습관 체크리스트로 나랑 잘 맞는 룸메이트를 찾고, 바로 채팅해 보세요.</span>
          </span>
          <span className="home-promo-go">
            룸메이트 찾기 바로가기
            <IconArrowRight width={16} height={16} />
          </span>
        </Link>
      </div>

      <div className="container home-blocks">
        <section className="home-block" aria-labelledby="block-score">
          <BlockHead id="block-score" title="환산점수 계산" />
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

        <section ref={resultRef} className="home-block predict-result" aria-labelledby="block-result">
          <BlockHead id="block-result" title="호관별 예상 합격률" desc="같은 관이라도 1인실·2인실·4인실은 따로 선발되어 합격선이 달라요." />
          <AiGate unlocked={acknowledged} onUnlock={acknowledge}>
            <PredictionResult
              result={result}
              stale={result.status === 'success' && submittedKey !== payloadKey}
              onRetry={runPrediction}
            />
          </AiGate>
          <div className="block-actions">
            {/* 안내가 필요할 때만 한 줄 (안내 확인 전에는 위 "재미로 봐 주세요" 안내가 설명한다) */}
            {acknowledged && !payload && (
              <p className="predict-hint">성별을 포함해 위 항목을 모두 입력하면 예측할 수 있어요.</p>
            )}
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

        <section className="home-block" aria-labelledby="block-rules">
          {/* 계산 방법은 필요할 때만 보도록 기본은 접어 둔다 */}
          <header className="block-head">
            <h2 id="block-rules">
              <button
                type="button"
                className="block-toggle"
                aria-expanded={rulesOpen}
                aria-controls="block-rules-body"
                onClick={() => setRulesOpen((open) => !open)}
              >
                환산점수 계산 방법
                <span className="block-toggle-hint">
                  {rulesOpen ? '접기' : '펼치기'}
                  <IconChevronRight width={18} height={18} />
                </span>
              </button>
            </h2>
          </header>
          <div id="block-rules-body" className="rules-body" hidden={!rulesOpen}>
            <div className="formula-card">
              <FormulaDisplay />
              <p className="formula-note">최종 점수는 소수점 셋째 자리에서 반올림합니다.</p>
            </div>
            <div className="rule-grid">
              {SCORE_RULES.map(({ title, range, body }) => (
                <article key={title} className="card rule-card">
                  <h3>{title}</h3>
                  <p className="rule-range">{range}</p>
                  {Array.isArray(body) ? (
                    <ul className="rule-lines">
                      {body.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{body}</p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-block" aria-labelledby="block-report">
          <BlockHead id="block-report" title="합격 결과 제보" />
          <div className="report-cta">
            <p>실제 선발 결과를 알려 주시면 합격선을 더 정확하게 예측할 수 있어요. 불합격 결과도 똑같이 중요해요.</p>
            <button type="button" className="btn btn-secondary" onClick={openReport}>
              결과 제보하기
            </button>
          </div>
        </section>
      </div>

      <LoginModal
        open={loginOpen}
        reason="결과를 제보하려면 로그인이 필요해요."
        points={REPORT_LOGIN_POINTS}
        onClose={closeLogin}
        onSignIn={signIn}
        onIdToken={signInWithIdToken}
      />
      {user && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          userId={user.id}
          defaults={{ collegeCode: college?.code, gender: form.gender, score: breakdown?.convertedScore, distance: sigungu?.distanceScore }}
        />
      )}
    </>
  )
}

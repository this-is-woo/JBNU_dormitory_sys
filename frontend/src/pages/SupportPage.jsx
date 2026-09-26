import kakaopayQr from '../assets/kakaopay-qr.png'
import { IconExternal } from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import { KAKAOPAY_DONATE_URL } from '../config.js'
import './SupportPage.css'

const USES = [
  { title: '서버가 잠들지 않게', body: '지금은 무료 서버라 한동안 안 쓰면 잠들어서, 첫 예측이 1분 가까이 걸려요.' },
  { title: '데이터베이스·도메인', body: '룸메이트 글과 합격 제보를 안정적으로 보관하고, 기억하기 쉬운 주소를 마련할게요.' },
  {
    title: '개발자의 굶주림 해소',
    body: '든든한 밥을 챙겨 먹어야 힘이 날 거 가튼데... ㅎㅎ 밥 챙겨먹는데 쓰겠습니다!',
  },
]

export default function SupportPage() {
  return (
    <>
      <title>개발자 삼각김밥 사주기 | JBNU Dormi</title>
      <PageHeader
        title="개발자 삼각김밥 사주기"
        lead={
          <span className="support-lead">
            안녕하세요! 개발자입니다.
            <br />
            사이트 운영에 돈이 드는 건 사실이지만, 저는 유료 버전, 무료 버전으로 나눠서 기능에 제한을 두고 싶지는
            않습니다.
            <br />
            그래서 구걸하기로 결정했습니다!
          </span>
        }
      />

      <div className="container support">
        <section className="card support-card" aria-labelledby="support-pay">
          <h2 id="support-pay">카카오페이로 보내기</h2>

          {/* PC 에서는 휴대폰으로 QR 을 찍고, 휴대폰에서는 버튼을 누르면 카카오페이가 열린다 */}
          <figure className="support-qr">
            <img src={kakaopayQr} alt="카카오페이 송금 QR 코드" width={331} height={331} />
            <figcaption>휴대폰 카메라나 카카오톡으로 QR을 찍어 주세요</figcaption>
          </figure>

          <a className="btn btn-lg support-btn" href={KAKAOPAY_DONATE_URL} target="_blank" rel="noreferrer">
            카카오페이로 보내기 <IconExternal width={16} height={16} />
          </a>
          <p className="support-hint">익명으로 보내려면 '받는 분 내역 표시'에서 이름을 변경하시면 돼요.</p>
        </section>

        <section className="support-uses" aria-labelledby="support-uses">
          <h2 id="support-uses">이렇게 쓸게요</h2>
          <ul>
            {USES.map((u) => (
              <li key={u.title} className="card">
                <strong>{u.title}</strong>
                <p>{u.body}</p>
              </li>
            ))}
          </ul>
          <p className="support-note">
            후원은 전적으로 자유예요. 후원하지 않아도 모든 기능을 똑같이 쓸 수 있어요. 송금은 카카오페이에서 이뤄지며, 이
            사이트는 후원 내역을 따로 저장하지 않아요.
          </p>
        </section>
      </div>
    </>
  )
}

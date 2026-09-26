import { Link } from 'react-router'
import PageHeader from '../components/common/PageHeader.jsx'
import { CONTACT_EMAIL } from '../config.js'
import './PolicyPage.css'

const EFFECTIVE_DATE = '2026년 9월 26일'

function Contact() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
}

export function PrivacyPage() {
  return (
    <>
      <title>개인정보처리방침 | JBNU 생활관</title>
      <PageHeader title="개인정보처리방침" lead={`시행일 ${EFFECTIVE_DATE}`} />
      <article className="container policy">
        <p>
          JBNU 생활관(이하 “서비스”)은 이용자의 개인정보를 꼭 필요한 만큼만 처리하며, 「개인정보 보호법」을
          지킵니다. 서비스는 전북대학교 공식 서비스가 아닌 개인이 운영하는 비영리 서비스입니다.
        </p>

        <h2>1. 처리하는 개인정보</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">구분</th>
              <th scope="col">항목</th>
              <th scope="col">언제</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>구글 로그인</td>
              <td>이메일 주소, 구글 계정 이름, 프로필 사진 주소, 구글 계정 식별자</td>
              <td>룸메이트 찾기에서 글을 쓰거나 내 글을 관리하려고 로그인할 때</td>
            </tr>
            <tr>
              <td>룸메이트 게시글</td>
              <td>성별, 나이, 호관, 단과대학, MBTI(선택), 생활 습관 체크리스트 답변, 자기소개(선택), 연락 방법</td>
              <td>글을 쓸 때 이용자가 직접 입력</td>
            </tr>
            <tr>
              <td>합격률 예측</td>
              <td>단과대학, 학점, 상점·벌점, 주소지(읍·면·동)</td>
              <td>합격률 예측하기를 누를 때 (로그인 정보와 연결하지 않음)</td>
            </tr>
          </tbody>
        </table>
        <p>
          구글 로그인으로는 위 항목만 받으며, 구글 계정의 비밀번호·연락처·메일 내용 등 다른 정보에는 접근하지
          않습니다.
        </p>

        <h2>2. 이용 목적</h2>
        <ul>
          <li>로그인한 이용자 확인, 본인이 쓴 글의 수정·삭제 권한 확인</li>
          <li>룸메이트 찾기 게시글 제공</li>
          <li>합격률 예측 결과 제공, 예측 모델 개선을 위한 통계 분석</li>
        </ul>

        <h2>3. 공개 범위</h2>
        <ul>
          <li>
            <strong>이메일 주소와 구글 계정 이름은 다른 이용자에게 보이지 않습니다.</strong> 게시글에는 작성자를
            알아볼 수 있는 계정 정보가 표시되지 않습니다.
          </li>
          <li>
            게시글 내용(연락 방법 포함)은 로그인하지 않은 사람도 볼 수 있습니다. 연락 방법에는 전화번호 대신
            오픈채팅 링크처럼 공개해도 괜찮은 수단을 적어 주세요.
          </li>
        </ul>

        <h2>4. 보유 기간과 파기</h2>
        <ul>
          <li>게시글: 이용자가 삭제하면 즉시 파기합니다.</li>
          <li>
            로그인 정보: 계정 삭제를 요청하면 지체 없이 파기하며, 그 계정으로 쓴 게시글도 함께 삭제됩니다.
          </li>
          <li>합격률 예측 기록: 누구의 요청인지 알 수 없는 형태로 저장되며, 모델 개선이 끝나면 파기합니다.</li>
        </ul>

        <h2>5. 제3자 제공</h2>
        <p>개인정보를 제3자에게 제공하거나 판매하지 않습니다. 광고·분석용 추적 도구도 사용하지 않습니다.</p>

        <h2>6. 처리 위탁과 국외 이전</h2>
        <p>서비스 운영을 위해 아래 클라우드 서비스를 이용하며, 데이터가 국외 서버에 저장될 수 있습니다.</p>
        <table>
          <thead>
            <tr>
              <th scope="col">업체</th>
              <th scope="col">위탁 업무</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>데이터베이스, 로그인 처리</td>
            </tr>
            <tr>
              <td>Google</td>
              <td>구글 계정 로그인</td>
            </tr>
            <tr>
              <td>Render</td>
              <td>합격률 예측 서버 운영</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>웹사이트 호스팅</td>
            </tr>
          </tbody>
        </table>

        <h2>7. 브라우저 저장소</h2>
        <p>
          로그인 상태 유지와 안내 확인 여부를 기억하기 위해 브라우저 저장소(localStorage, sessionStorage)를
          사용합니다. 브라우저 설정에서 언제든 지울 수 있으며, 지우면 로그아웃됩니다.
        </p>

        <h2>8. 이용자의 권리</h2>
        <p>
          이용자는 언제든 자신의 게시글을 수정·삭제할 수 있고, 개인정보의 열람·정정·삭제·처리 정지를 요청할
          수 있습니다. 구글 계정 설정의 “Google 계정에 액세스할 수 있는 서드 파티 앱”에서 연결을 끊을 수도
          있습니다.
        </p>

        <h2>9. 문의</h2>
        <p>
          개인정보 관련 문의와 계정 삭제 요청: <Contact />
        </p>

        <h2>10. 변경</h2>
        <p>이 방침이 바뀌면 이 페이지에 시행일과 함께 공지합니다.</p>

        <p className="policy-foot">
          <Link to="/terms">서비스 약관 보기</Link>
        </p>
      </article>
    </>
  )
}

export function TermsPage() {
  return (
    <>
      <title>서비스 약관 | JBNU 생활관</title>
      <PageHeader title="서비스 약관" lead={`시행일 ${EFFECTIVE_DATE}`} />
      <article className="container policy">
        <h2>1. 서비스 소개</h2>
        <p>
          JBNU 생활관(이하 “서비스”)은 전북대학교 생활관 환산점수 계산, 호관별 합격률 예측, 룸메이트 찾기 게시판을
          제공하는 개인 운영 비영리 서비스입니다. <strong>전북대학교 공식 서비스가 아닙니다.</strong>
        </p>

        <h2>2. 예측 결과</h2>
        <p>
          환산점수와 합격률은 공개된 선발 기준과 과거 자료로 계산한 <strong>참고용</strong> 정보입니다. 실제 선발
          결과와 다를 수 있으며, 서비스는 이를 근거로 한 결정에 책임을 지지 않습니다. 정확한 선발 기준은 전북대학교
          생활관 공지사항을 확인하세요.
        </p>

        <h2>3. 룸메이트 찾기</h2>
        <ul>
          <li>게시글은 누구나 볼 수 있고, 글쓰기와 내 글 관리는 구글 계정으로 로그인한 이용자만 할 수 있습니다.</li>
          <li>게시글의 내용과 연락 이후의 만남·거래는 이용자 본인의 책임입니다.</li>
          <li>
            다음 글은 예고 없이 숨기거나 삭제할 수 있습니다: 욕설·비방·차별, 광고·홍보, 타인의 개인정보 게시,
            거짓 정보, 룸메이트 찾기와 관계없는 글
          </li>
          <li>이 약관을 반복해서 어기는 계정은 이용을 제한할 수 있습니다.</li>
        </ul>

        <h2>4. 서비스 변경과 중단</h2>
        <p>
          서비스는 무료로 제공되며, 운영 사정에 따라 기능이 바뀌거나 중단될 수 있습니다. 무료 서버를 사용하므로 첫
          접속이 느리거나 일시적으로 이용할 수 없을 수 있습니다.
        </p>

        <h2>5. 개인정보</h2>
        <p>
          개인정보 처리는 <Link to="/privacy">개인정보처리방침</Link>을 따릅니다.
        </p>

        <h2>6. 문의</h2>
        <p>
          <Contact />
        </p>
      </article>
    </>
  )
}

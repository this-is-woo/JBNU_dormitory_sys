-- 합격률 예측에 성별 입력이 추가되어(성별마다 지원 가능한 호관·합격선이 다름) 예측 기록에도 성별을 남긴다.
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
-- 성별을 보내지 않던 예전 기록과 예전 화면의 요청은 null 로 남는다.
alter table public.prediction_logs add column if not exists gender text;

alter table public.prediction_logs drop constraint if exists prediction_logs_gender_check;
alter table public.prediction_logs add constraint prediction_logs_gender_check check (gender in ('남', '여'));

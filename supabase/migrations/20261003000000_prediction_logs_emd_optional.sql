-- 주소지 입력이 시/도 → 시/군/구 2단계로 바뀌어 읍/면/동 코드를 더 이상 받지 않는다.
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
alter table public.prediction_logs alter column emd_code drop not null;

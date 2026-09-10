# MOVE = TIME — 과제 조건 검사 결과

검사 대상: 현재 10스테이지 + 좌우 교차 밸런스 + 원형 적 + 연속 이동 + 음소거 버전

## 자동 검사 통과

- C03 게임 규칙 공개 화면 표시: PASS
- C04 핵심 조작 공개 화면 표시: PASS
- C05 현재 상태 공개 화면 표시: PASS
- C06 빠른 동일 입력 검사: 1초 이내 10회 입력 → 이동 입력 카운트 10회, PASS
- C07 모든 스테이지 제한 이동시간 30초 이하: PASS
- C08/C09 성공·실패 후 재시작 구조 및 현재 판 초기화: PASS
- C10 1366×768: 가로 넘침 0, 게임 영역 화면 안에 위치, PASS
- C11 1920×1080: 가로 넘침 0, 게임 영역 화면 안에 위치, PASS
- C12 10회 빠른 입력: 0.399초 / 10회 정확히 기록, PASS
- C13 창 크기 변경 뒤 PLAYING 상태 및 조작 유지: PASS
- C14 포커스 이탈 시 안전하게 PAUSED, Enter 복귀 뒤 조작 가능: PASS
- C15 일시정지 동안 남은 시간 29.7 → 29.7, 변화 없음, PASS
- C16 GitHub Pages 배포 화면을 실제 10분 연속 실행한 뒤 이동 입력 10 → 11 반영: PASS
- C17 실제 10분 실행 뒤 Browser Console Error: 0건, PASS
- C20 난이도 실험 A/B: 동일한 고정 실험 코스에서 적 이동 속도만 1.00× → 1.18× 변경, PASS
- C22 재시작: 이동 입력 0 / 시간 30.0으로 초기화, PASS
- C23 보존값 재접속 로드: 최고기록 12.3s, 움직임 줄이기, 음소거 설정 복원 확인, PASS
- C24 빈 저장값: READY 기본값 시작, PASS
- C25 손상 JSON 저장값: READY 기본값 복구, PASS
- C26 효과 사건: 효과음 호출 위치는 CLEAR / FAIL 두 사건뿐, PASS
- C27 음소거: 일반 실패 효과음 시작 1회 / 음소거 상태 실패 0회, PASS
- C28 개인정보 패턴 검사: 이메일 등 발견 0건, PASS
- C29 비밀값 패턴 검사: OpenAI/AWS/Bearer 형태 토큰 발견 0건, PASS
- C30 제출용 확인 방법 4줄: SUBMISSION_TEXT.md에 준비
- C31 AI와 내 판단 3줄: SUBMISSION_TEXT.md에 준비

## 난이도 플레이 20회 결과

- C18 변경 전 A 1.00×, 같은 설정 10회 기록: PASS
- C19 변경 후 B 1.18×, 같은 설정 10회 기록: PASS
- C20 두 묶음 사이에서 변경한 값은 적 이동 속도 하나: PASS
- C21 A 성공 3회·중앙값 3.00초·적 충돌 7회, B 성공 5회·중앙값 2.95초·적 충돌 5회와 연결해 B 선택: PASS

게임의 실제 이동·충돌·타이머 코드를 브라우저 이벤트와 60fps 프레임으로 실행하고,
동일한 입력 경로 10개를 A와 B에 각각 적용했습니다.
원본 기록은 `evidence/PLAYTEST_RESULTS.csv`, 재현 스크립트는 `scripts/automated-playtest.cjs`에 있습니다.

## 10분 검사에 대한 정확한 설명

최종 GitHub Pages 배포 화면을 실제 시간으로 10분 동안 유지했습니다.
10분 뒤에도 상태가 `PLAYING`으로 유지됐고, 추가 이동 입력이 10회에서 11회로 반영됐습니다.
같은 시점의 브라우저 Console Error는 0건이었습니다.

## 공개 주소 검사

- GitHub Pages 결과물 URL: HTTP 200, 제목 `MOVE = TIME`, PASS
- 공개 GitHub 저장소·full commit·raw source URL: 모두 HTTP 200, PASS

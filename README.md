# 가는 김에

이동시간에 볼일 처리시간, 완료 마감, 귀가 목표를 더해 방문 순서를 제안하고 Pleos 차량 내비로 전달하는 앱입니다.

## 제출 빌드

- 버전: 0.6.5 / versionCode 11
- APK: `apk/장선웅_가는김에_release.apk`
- Release 패키지: `ai.ganegime.app.release`
- 디버그 패키지: `ai.ganegime.app`
- 제출 APK는 별도의 키로 서명한 release 빌드이며 `debuggable=false`입니다. 기존 개발 앱의 저장된 일정과 설정을 보존하도록 나란히 설치됩니다.
- APK의 SHA-256과 서명 검증 결과는 `verification/`에 있습니다.

## 0.6.4 주차 상태 확인

속도 0과 P단을 1초 이상 확인한 뒤 조작을 허용합니다. 처음 실행할 때 차량 속도 권한을 허용하세요. 일반 Android 기기처럼 차량 상태를 읽지 못하는 환경에서는 잠깁니다. 에뮬레이터 차량 신호 조절, 검증 범위 및 기존 공개 제출 자료와의 버전 차이는 `verification/baseline-0.6.4/driving-guard.txt`를 확인하세요.

## 0.6.5 일정 진행

출발 전 마감 재검사, 미룬 볼일 보관, 복원, 개별 완료 후 남은 일정 재계산과 마감 여유 표시를 추가했습니다. 사용 순서와 검증 범위는 `verification/trip-progress.txt`를 참고하세요.

## 설치와 실행

공식 Pleos Connect 2.1 에뮬레이터(Android 14 / API 34, x86_64, 2560 × 1440)에서 검증했습니다. 일반 Android 기기에서는 차량 상태를 읽을 수 없어 입력이 잠깁니다. 공식 Pleos 환경에서 실행하세요.

```powershell
adb -s <대상 에뮬레이터 ID> install -r apk/장선웅_가는김에_release.apk
adb -s <대상 에뮬레이터 ID> shell am start --user current -n ai.ganegime.app.release/ai.ganegime.app.MainActivity
```

앱을 열고 상단 `설정 → 서버 연결 설정`에서 별도로 전달받은 서비스 접속 코드를 입력합니다. 카카오 REST API 키를 입력하는 곳이 아닙니다. `연결 확인` 후 출발지, 목적지, 들를 상점을 검색해 선택하고, 처리시간과 마감, 도착 목표를 입력해 계산합니다. 추천 일정의 `내비로 보내기`를 누르면 목적지와 경유 순서를 전달하고 응답을 확인합니다.

실제 검색, 교통 계산에는 인터넷과 유효한 서비스 접속 코드가 필요합니다. 원본 API 서버는 비공개이며 심사용 접속 게이트웨이가 별도의 코드를 검증합니다. APK, 소스에는 서비스 접속 코드나 카카오 키가 들어 있지 않습니다. 심사용 코드는 제출 이메일로 별도 전달합니다. 공개 자료에는 포함하지 않습니다. 유효기간은 2026년 12월 5일 23:59:59(한국시간)입니다. 자세한 설치, 시연 안내는 이 저장소의 `verification/review-guide.txt` 또는 이메일에 첨부한 `실행안내.txt`를 확인하세요.

접속 코드 없이도 상단 `비교 시연`에서 고정 데이터 비교와 마감, 처리시간, 필수 여부 변경 계산을 사용할 수 있습니다. 특정 상용 내비 제품의 성능 측정이 아니라 동일한 입력을 사용한 내부 기준 계산입니다.

## 폴더 구성

- `android/`: Kotlin Android 앱, 로컬 WebView UI, Pleos NaviHelper 연동
- `cloud/`: 실제 상점 검색, 교통 조회, 일정 계산 Worker와 단위 테스트
- `review-gateway/`: 만료되는 심사용 코드 검증 및 검색, 계산 전용 프록시
- `tests/`: WebView 동작 검증용 JS 테스트
- `apk/`: 서명된 제출용 APK
- `verification/`: 빌드, 서명, 실행 검증 결과

## 개발 환경과 빌드

JDK 21, Android SDK Platform 36 / Build Tools 36.0.0, Gradle Wrapper 8.14.3을 사용했습니다. SDK 경로는 `ANDROID_HOME` 또는 로컬 `android/local.properties`의 `sdk.dir`로 설정하세요. Pleos Maven 저장소에 접속할 수 있어야 합니다. 사용 SDK는 `ai.pleos.playground:NaviHelper:3.0.5`입니다.

```powershell
cd android
./gradlew.bat assembleDebug
```

Release를 재빌드하려면 개인 서명키를 만들고 `signing.properties.example`을 `signing.properties`로 복사하여 로컬 경로와 비밀번호를 입력한 뒤 실행합니다.

```powershell
./gradlew.bat assembleRelease
```

원본 서명 개인키와 비밀번호는 제출 자료에 포함하지 않았습니다. 다른 키로 만든 APK는 제공된 release APK 위에 업데이트할 수 없습니다. 새 키를 쓰는 개발자는 자신의 테스트 기기에서 기존 앱을 제거한 후 설치해야 하며, 제거 전 필요한 데이터를 보관해야 합니다.

## 서버 구성

현재 서버는 Sites의 비공개 접근 제어 뒤에서 실행됩니다. `cloud/worker.mjs`의 Worker `fetch` 진입점이 `/status`, `/search`, `/plan`을 처리합니다. 배포 플랫폼의 비밀 설정에 `KAKAO_REST_API_KEY`와 필요한 경우 `KAKAO_MOBILITY_REST_API_KEY`를 넣습니다. 서버를 다른 곳에 배포할 경우 인증 경계를 별도로 구현한 후 `LiveBridge.kt`의 endpoint와 인증 헤더를 해당 환경에 맞게 수정해야 합니다. 인증 없이 공개 배포하면 안 됩니다.

```powershell
cd cloud
node build.mjs
node --test cloud.test.mjs
```

서버가 Kakao Local 검색과 Kakao Mobility 방향별 경로를 조회합니다. 모든 구간에 조회 시점의 교통을 적용하며 미래 교통 예측, 영업시간 자동 조회, 자동 최적 상점 선정은 제공하지 않습니다. 주차, 도보, 대기시간은 사용자가 처리시간에 포함해야 합니다. 경유지가 2곳을 넘으면 구간을 나누고 완료 확인 후 남은 일정을 재계산합니다.

## 심사용 접속 게이트웨이

`review-gateway/worker.mjs`는 POST /status, /search, /plan만 원본 비공개 API로 전달합니다. 서버의 비밀 환경변수에 `UPSTREAM_SERVICE_TOKEN`(원본 API 접근 토큰), `REVIEW_CODE_SHA256`(심사용 코드의 SHA-256)을 설정하고 `REVIEW_EXPIRES_AT`에 ISO 만료시각을 지정합니다. 값은 소스에 포함하지 않습니다. 코드 형식은 review- 뒤에 32~80자의 영문, 숫자, 밑줄, 하이픈입니다. 충분히 긴 암호학적 난수로 생성하세요.

Android의 `LiveBridge.kt`는 review- 코드를 이 게이트웨이의 Authorization 헤더로 보냅니다. 개인 접속 코드는 기존 비공개 API를 사용합니다. 배포처를 바꾸면 코드의 고정 주소를 수정하세요. 게이트웨이 호출 제한은 Worker 인스턴스 단위이며 서비스 전체의 전역 한도를 보장하지 않습니다.

`verification/baseline-0.6.4/release-review-test.txt`는 이전 0.6.4 release APK에서 심사용 응답을 확인한 뒤 실제 검색, 계산, Pleos 전달을 검증한 결과입니다. Android 자동 시험 시 `-e reviewerMode true`를 지정하면 로컬 전용 자격증명을 적용하고 심사용 서버 응답 여부를 추가 검사합니다.

## 테스트

Node.js 24 환경에서 다음 명령으로 서버와 UI의 계산, 전송 조건을 검사할 수 있습니다.

```powershell
npm install
npm test
```

Android 기기 테스트 소스는 `android/app/src/androidTest/`에 있습니다. `SubmissionVideoTest`는 비교 시연과 실제 API, SDK 연동을 검사합니다. 실제 연동 테스트는 테스트 기기에 서비스 접속 코드를 먼저 설정하거나, 로컬 전용 `android/app/src/androidTest/assets/local-cloud.json`에 `{"token":"로컬 서비스 접속 코드"}` 형태로 설정해야 합니다. 이 파일은 공개하거나 제출하지 마세요. Release 테스트는 `-PtestBuildType=release` 옵션을 사용합니다.

## 디자인과 글꼴

Pleos의 중립적인 타이포그래피, 색상, 정보 위계 원칙을 참고했습니다. Asta Sans를 앱에 포함해 네트워크 없이 표시하며, 흰색, 회색 면과 얇은 구분선, 48px 이상의 주요 조작 영역을 사용합니다. 공식 Pleos 기본 앱이나 디자인 인증을 의미하지 않습니다.

Asta Sans는 SIL Open Font License 1.1을 따릅니다. 라이선스 원문은 `android/app/src/main/assets/fonts/OFL.txt`에 포함되어 있습니다.

참고:
- https://document.pleos.ai/en/docs/connect/guide/docs-design/foundations/typography
- https://document.pleos.ai/en/docs/connect/guide/docs-design/foundations/colors
- https://appdevchallenge.auto-hmg.io/guide/submission

실차 주행 검증과 사용자별 인증, 전역 호출량 관리는 후속 개발 범위입니다. 이번 버전은 에뮬레이터에서 검증한 공모전용 프로토타입입니다.

## 0.6.2 위치 진단 기록 정리

앱 자체 내비 진단은 장소 이름, 주소, 좌표, 원시 요청, SDK 응답, 예외 원문을 기록하지 않습니다. 화면 진단에는 고정된 이벤트 코드와 발생 시각만 메모리에 최대 80개 유지하며, 앱 코드에서 파일, Logcat으로 출력하지 않습니다. 같은 서명의 APK로 업데이트한 뒤 실행하면 이전 `navigation.log`를 삭제합니다. 입력 일정과 접속 코드는 기능을 위해 기기에 저장되며 이 변경으로 지우지 않습니다.

선택한 장소는 검색, 일정 계산을 위해 클라우드/Kakao로, 경로 안내를 위해 Pleos 내비로 전송됩니다. 외부 SDK, 서비스 및 OS가 관리하는 기록 정책까지 제어한다는 의미는 아닙니다.

`PrivacyRegressionTest`는 이전 로그 삭제와 오류 입력의 진단 유출 차단을 검사합니다. `SubmissionVideoTest#liveRecording`은 실제 검색, 계산, 내비 응답 후 장소 정보가 진단에 포함되지 않고 로그 파일도 생성되지 않는지 검사합니다. 공개 자료에는 테스트용 자격증명을 포함하지 않습니다.

## 0.6.3 화면과 시연 영상

구분선 중심의 화면, 분 단위 예상시각, 짧은 버튼 문구를 적용했습니다. 비교 시연과 실제 검색, 계산, 내비 전달은 새 release 앱으로 다시 확인했습니다. 제출 영상은 2분 30초 한국어 자막 영상이며 음성은 없습니다. 일정 계산과 API, SDK 연동 계약은 유지했습니다.


## 계산 근거와 재실행

2026.11.13 자료 보강: `evidence/`에 108개 가상 조건의 입력, 전체 결과, 재실행 코드를 추가했습니다. 이 분석은 0.6.3에서 생성했으며 0.6.5에서도 비교 계산기는 동일합니다. 앱의 일정 진행과 주행 입력 제한은 0.6.5 기준입니다.

```text
node evidence/benchmark.mjs evidence/results
```

외부 API나 접속 코드 없이 실행합니다. 세 볼일 모두 마감 내 완료 가능한 조건은 내부 이동시간 최소 기준 34개, 추천 44개입니다. 모두 불가능한 64개도 공개했습니다. 실제 이용자 성공률이나 상용 내비 비교가 아니며, 가정과 지연 민감도는 `evidence/README.md`에 설명했습니다.


## 제출 자료 0.6.5

소스와 APK는 이 GitHub 저장소로 제출합니다. 신청서, 기획서, 영상, 실행 안내와 접속 안내는 이메일에 첨부합니다. 제출 APK는 `apk/장선웅_가는김에_release.apk`입니다. 심사 기준 커밋 번호는 제출 이메일에 기재합니다. 이전 검증 기록은 baseline 폴더의 해당 버전 기록입니다. 최신 실행 안내는 `verification/review-guide.txt`입니다.


## 0.6.5 문구 수정본

앱 안내, 기획서, 영상 자막과 제출 안내의 가운데점을 쉼표로 정리했습니다. 기능과 버전은 동일하며 APK는 다시 빌드하고 서명했습니다. 수정 앱에서 비교 시연, 실제 검색, 일정 진행, 내비 연결과 주행 입력 제한을 다시 확인했습니다.


## 0.6.5 화면과 설명 정리

앱의 반복 안내와 장식 문구를 줄이고 결과 화면의 정보 순서를 정리했습니다. 기획서와 영상, 이메일 설명도 함께 다듬었습니다. 기능과 버전은 동일하며 APK는 다시 빌드하고 서명했습니다. 수정 앱에서 비교 시연, 실제 검색, 일정 진행, 내비 연결과 주행 입력 제한을 다시 확인했습니다.

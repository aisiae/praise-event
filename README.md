# 칭찬 스티커 이벤트

Apps Script와 Google Sheets 없이 동작하는 `Next.js + Firebase Firestore` 버전입니다.

## 제공 기능

- 이름·사번 기반 재직 직원 확인
- 이벤트 기간 중 하루 한 번 출석 스티커 지급
- 동료 칭찬 작성 및 동일 인원 하루 1회 칭찬 제한
- 관리자 이메일·비밀번호 로그인
- 직원 명단 일괄 등록과 재직 상태 관리
- 이벤트 기간과 결과 공개 설정
- 상품 등록, 가중치 추첨, 중복 당첨 제한
- 관리자 작업 로그

## 1. Firebase 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 생성합니다.
2. Firestore Database를 생성합니다.
3. Authentication에서 `이메일/비밀번호` 로그인 방식을 활성화합니다.
4. Authentication의 사용자 메뉴에서 관리자 계정을 하나 생성합니다.
5. 프로젝트 설정에서 웹 앱을 추가하고 Firebase Web SDK 설정값을 확인합니다.
6. 프로젝트 설정의 서비스 계정에서 비공개 키를 발급합니다.

## 2. 환경변수

`.env.example`을 `.env.local`로 복사한 후 값을 입력합니다.

- `NEXT_PUBLIC_FIREBASE_*`: Firebase 웹 앱 설정값
- `FIREBASE_PROJECT_ID`: 서비스 계정의 `project_id`
- `FIREBASE_CLIENT_EMAIL`: 서비스 계정의 `client_email`
- `FIREBASE_PRIVATE_KEY`: 서비스 계정의 `private_key`
- `ADMIN_EMAILS`: 관리자 이메일. 여러 명이면 쉼표로 구분

서비스 계정 JSON 파일과 비공개 키는 GitHub에 올리지 않습니다.

## 3. 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 4. 직원 명단 등록

관리자 화면에서 다음 열 순서로 엑셀 데이터를 붙여넣습니다.

```text
이름    사번    상태
정지영    202509004    재직
```

상태를 생략하면 자동으로 `재직` 처리됩니다.

## 5. Vercel 배포

1. 이 폴더를 비공개 GitHub 저장소에 업로드합니다.
2. Vercel에서 저장소를 Import합니다.
3. `.env.example`에 표시된 환경변수를 Vercel Project Settings에 등록합니다.
4. 배포 후 Firebase Authentication의 Authorized domains에 Vercel 도메인을 추가합니다.

## 보안

- Firestore 보안 규칙은 브라우저의 직접 접근을 모두 차단합니다.
- 데이터 조회와 변경은 Vercel 서버 API에서 Firebase Admin SDK로 처리합니다.
- 관리자 API는 Firebase ID 토큰과 `ADMIN_EMAILS` 허용 목록을 모두 확인합니다.

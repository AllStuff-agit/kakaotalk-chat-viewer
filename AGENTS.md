# Repository Guidelines

## 프로젝트 구조 및 모듈 구성

이 저장소는 별도의 설치 과정이 없는 정적 웹 애플리케이션이다. `index.html`은 진입점이며 페이지 구조, Tailwind CDN 설정, 소규모 사용자 정의 스타일을 포함한다. JavaScript 코드는 `scripts/`에 있다.

- `parser.js`: 카카오톡 내보내기 텍스트를 구조화된 채팅 데이터로 변환한다.
- `parser.worker.js`: 대용량 파일을 스트리밍 파싱해 IndexedDB에 분할 저장하고 조회한다.
- `chat-store.js`: 메인 화면과 저장 Worker 사이의 비동기 요청을 관리한다.
- `renderer.js`: 메시지를 화면에 표시하고 채팅 UI 상태를 관리한다.
- `search-renderer.js`: 검색 결과를 연속 가상 스크롤로 표시한다.
- `main.js`: 파일 입력, 검증, 검색, 달력 및 애플리케이션 이벤트를 연결한다.
- `*.test.mjs`: Node.js 기본 `assert`를 사용하는 회귀 검사다.

각 스크립트는 브라우저 전역 클래스를 사용하므로 `parser.js`, `chat-store.js`, `renderer.js`, `main.js` 순서로 불러와야 한다. 현재 생성형 자산은 없다.

## 개발 및 검증 명령어

빌드나 패키지 설치는 필요하지 않다. Web Worker와 IndexedDB를 사용하므로 `index.html`을 직접 열지 말고 로컬 HTTP 서버로 실행한다.

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

변경 사항을 제출하기 전에 JavaScript 문법을 검사한다.

```bash
for file in scripts/*.js; do node --check "$file"; done
for file in scripts/*.test.mjs; do node "$file"; done
```

## 코딩 스타일 및 명명 규칙

기존 HTML, CSS, ES6 JavaScript 형식을 따른다. 들여쓰기는 공백 4칸, 문장 끝에는 세미콜론, JavaScript 문자열에는 작은따옴표를 사용하며 여는 중괄호는 선언과 같은 줄에 둔다. 클래스는 `PascalCase`(`KakaoTalkParser`), 메서드와 변수는 `camelCase`, HTML ID와 CSS 클래스는 kebab-case로 작성한다. 주변 문맥이 한국어라면 UI 문구와 설명 주석도 한국어로 작성한다. 작은 기능은 브라우저 기본 API와 기존 Tailwind 유틸리티를 우선 사용한다.

## 테스트 지침

테스트 프레임워크나 커버리지 기준은 아직 없다. `*.test.mjs` 파일은 Node.js 기본 `assert`로 실행한다. 민감정보가 없는 카카오톡 `.txt` 예제 파일로 너비 1024px 이상의 데스크톱 환경에서 수동 검증한다. 파일 선택과 드래그 앤 드롭, 여러 줄 메시지 파싱, 사용자 선택, 검색, 달력 이동, 오류 처리를 확인한다. 채팅 내용이 브라우저 안에서만 처리되고 네트워크 요청에 포함되지 않는지도 확인한다. 복잡한 로직을 추가할 때는 해당 동작을 검증하는 작은 자동 테스트를 함께 추가한다.

## 커밋 및 Pull Request 지침

기존 이력처럼 짧은 Conventional Commit 형식의 한국어 제목을 사용한다: `feat: ...`, `fix: ...`, `style: ...`, `refactor: ...`. 커밋 하나에는 한 가지 목적만 담는다. Pull Request에는 사용자에게 보이는 변경점과 수행한 수동 검증을 적고, 레이아웃 또는 스타일 변경에는 스크린샷을 첨부한다. 관련 이슈가 있으면 연결하고, 지원하는 내보내기 형식이나 개인정보 처리 방식의 변경은 명확히 알린다.

# Large Chat Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오톡 채팅 파일 전체를 메모리에 올리지 않고 브라우저 저장소에서 연속 스크롤과 검색을 제공한다.

**Architecture:** Worker가 파일을 스트리밍 파싱해 IndexedDB에 순번 키로 저장하고, 메인 스레드는 메타데이터와 화면 주변 범위만 받는다. 렌더러는 고정 크기 가상 트랙을 메시지 인덱스에 매핑하며, 검색은 Worker가 저장소를 역방향으로 순회한다.

**Tech Stack:** 정적 HTML, ES6 JavaScript, Web Worker, File Streams API, IndexedDB, Node.js `assert`

## Global Constraints

- 채팅 파일은 서버로 전송하지 않고 브라우저 내부에서만 처리한다.
- 파일 크기에 인위적인 상한을 두지 않는다.
- 화면 DOM에는 최대 400개 채팅 항목만 둔다.
- 새 외부 의존성과 빌드 단계를 추가하지 않는다.
- 검색 결과는 최신순 최대 200개로 제한하고 모든 사용자 텍스트를 HTML 이스케이프한다.

---

### Task 1: 청크 경계를 보존하는 스트리밍 파서

**Files:**
- Modify: `scripts/parser.js`
- Create: `scripts/parser.test.mjs`

**Interfaces:**
- Produces: `KakaoTalkStreamParser(onEntry)`의 `pushChunk(text)`, `finish()`, `metadata`
- Preserves: `new KakaoTalkParser().parse(content)` 호환 API

- [ ] **Step 1: 청크 경계 회귀 테스트 작성**

```js
const entries = [];
const parser = new KakaoTalkStreamParser(entry => entries.push(entry));
parser.pushChunk('[철수] [오후 1:00] 첫 줄\n둘');
parser.pushChunk('째 줄\n[영희] [오후 1:01] 다음 메시지');
const metadata = parser.finish();
assert.equal(entries[0].content, '첫 줄\n둘째 줄');
assert.equal(metadata.totalMessages, 2);
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/parser.test.mjs`
Expected: `KakaoTalkStreamParser is not defined`

- [ ] **Step 3: 최소 스트리밍 상태 머신 구현**

```js
class KakaoTalkStreamParser {
    constructor(onEntry) {
        this.onEntry = onEntry;
        this.buffer = '';
        this.currentMessage = null;
        this.metadata = { title: '', saveDate: '', totalEntries: 0, totalMessages: 0 };
    }

    pushChunk(text) {
        const lines = (this.buffer + text).split('\n');
        this.buffer = lines.pop();
        lines.forEach(line => this.consumeLine(line));
    }
}
```

`consumeLine()`은 기존 제목, 저장 날짜, 날짜 구분선, 메시지, 여러 줄 메시지 규칙을 그대로 사용한다. `emit()`에서 순차 `index`를 부여하고 `onEntry`를 호출한다. `finish()`는 남은 줄과 마지막 메시지를 방출한 뒤 메타데이터를 반환한다.

- [ ] **Step 4: 파서 검사 실행**

Run: `node scripts/parser.test.mjs && node --check scripts/parser.js`
Expected: 두 명령 모두 성공

- [ ] **Step 5: 커밋**

```bash
git add scripts/parser.js scripts/parser.test.mjs
git commit -m "refactor: 채팅 파일 스트리밍 파서 추가"
```

### Task 2: IndexedDB Worker와 요청 클라이언트

**Files:**
- Modify: `scripts/parser.worker.js`
- Create: `scripts/chat-store.js`
- Create: `scripts/chat-store.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: `KakaoTalkStreamParser(onEntry)`
- Produces: `ChatStore.importFile(file, onProgress)`, `getRange(start, count)`, `search(query, limit)`, `close()`
- Worker messages: `{ id, type: 'import'|'range'|'search', ... }` → `{ id, result }` 또는 `{ id, error }`

- [ ] **Step 1: Worker 클라이언트 요청 및 오래된 검색 폐기 테스트 작성**

```js
const store = new ChatStore(() => fakeWorker);
const promise = store.getRange(100, 400);
fakeWorker.emit({ id: 1, result: [{ index: 100 }] });
assert.equal((await promise)[0].index, 100);
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/chat-store.test.mjs`
Expected: `ChatStore is not defined`

- [ ] **Step 3: 요청 ID 기반 `ChatStore` 구현**

```js
getRange(start, count) {
    return this.request('range', { start, count });
}

search(query, limit = 200) {
    return this.request('search', { query, limit });
}
```

`importFile()`은 진행 이벤트를 전달하고, `close()`는 모든 미완료 요청을 거절한 뒤 Worker를 종료한다.

- [ ] **Step 4: Worker에 IndexedDB 저장과 조회 구현**

DB 이름은 `kakaotalk-chat-viewer`, object store는 `chunks`, `keyPath: 'start'`로 고정한다. 가져오기 시작 시 store를 비우고 `File.stream().getReader()`와 `TextDecoder`로 읽는다. 5,000개 단위 청크로 저장하며 메타데이터에 참여자별 개수와 `{ date, index }` 목록을 포함한다.

```js
async function putBatch(entries) {
    const transaction = database.transaction('messages', 'readwrite');
    transaction.objectStore('chunks').put({ start: entries[0].index, entries });
    await transactionDone(transaction);
}
```

범위 조회는 필요한 청크만 읽어 최대 400개를 잘라 반환하고, 검색은 청크 `openCursor(null, 'prev')`를 사용한다. 검색 결과는 일반 문자열만 반환한다.

- [ ] **Step 5: 클라이언트 검사 실행**

Run: `node scripts/chat-store.test.mjs && node --check scripts/parser.worker.js && node --check scripts/chat-store.js`
Expected: 모두 성공

- [ ] **Step 6: 스크립트 로드 순서 추가 후 커밋**

```html
<script src="scripts/parser.js"></script>
<script src="scripts/chat-store.js"></script>
<script src="scripts/renderer.js"></script>
<script src="scripts/main.js"></script>
```

```bash
git add index.html scripts/parser.worker.js scripts/chat-store.js scripts/chat-store.test.mjs
git commit -m "feat: 채팅을 브라우저 저장소에 분할 저장"
```

### Task 3: 저장소 기반 연속 가상 스크롤

**Files:**
- Modify: `scripts/renderer.js`
- Modify: `scripts/renderer.test.mjs`

**Interfaces:**
- Consumes: `ChatStore.getRange(start, count)`와 `{ totalEntries, users }` 메타데이터
- Produces: `render(metadata, store, isInitial, focusIndex)`, `scrollToIndex(index, highlight)`

- [ ] **Step 1: 최대 400개 조회와 비동기 경합 테스트 작성**

```js
await renderer.render({ totalEntries: 1_000_000, users: [] }, store);
assert.deepEqual(store.calls[0], { start: 999600, count: 400 });
const old = renderer.renderWindow(0);
const latest = renderer.renderWindow(500000);
resolveLatest();
resolveOld();
await Promise.all([old, latest]);
assert.equal(renderer.renderStart, 499800);
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/renderer.test.mjs`
Expected: 기존 배열 기반 렌더 API로 인해 실패

- [ ] **Step 3: 전체 높이 배열 제거 및 가상 트랙 구현**

```js
indexToOffset(index) {
    const movableHeight = Math.max(0, this.virtualHeight - this.container.clientHeight);
    return this.totalEntries <= 1 ? 0 : index / (this.totalEntries - 1) * movableHeight;
}

offsetToIndex(offset) {
    const movableHeight = Math.max(1, this.virtualHeight - this.container.clientHeight);
    return Math.round(offset / movableHeight * (this.totalEntries - 1));
}
```

`virtualHeight`는 `Math.min(totalEntries * 64, 10_000_000)`으로 제한한다. `renderWindow()`는 요청 세대 번호를 증가시키고 최신 응답만 DOM에 반영한다. 위·아래 spacer로 하나의 연속 스크롤바를 유지하며 DOM 항목은 400개를 넘지 않는다.

- [ ] **Step 4: 렌더러 검사 실행**

Run: `node scripts/renderer.test.mjs && node --check scripts/renderer.js`
Expected: 최대 400개, 빠른 점프, 오래된 응답 폐기 검사 성공

- [ ] **Step 5: 커밋**

```bash
git add scripts/renderer.js scripts/renderer.test.mjs
git commit -m "feat: 저장소 기반 연속 가상 스크롤 적용"
```

### Task 4: 애플리케이션 연결, 안전한 검색, 최종 검증

**Files:**
- Modify: `scripts/main.js`
- Modify: `scripts/main.test.mjs`
- Modify: `index.html`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `ChatStore`와 비동기 `ChatRenderer`
- Produces: 파일 가져오기 진행률, 저장소 검색, 날짜 인덱스 이동, 사용자 오류 안내

- [ ] **Step 1: 저장소 검색과 HTML 안전성 테스트 작성**

```js
viewer.store = { search: async () => [{ content: '<img src=x>', index: 7 }] };
const results = await viewer.searchMessages('<img');
assert.equal(results[0].content, '<img src=x>');
assert.equal(viewer.highlightSearchTerm('<b>', '<'), '&lt;b&gt;');
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/main.test.mjs`
Expected: 메모리 배열 검색 또는 이스케이프되지 않은 결과로 실패

- [ ] **Step 3: 파일 처리와 메타데이터 UI를 `ChatStore`에 연결**

```js
this.store = new ChatStore();
const metadata = await this.store.importFile(file, progress => this.updateProgress(progress));
this.currentChatData = metadata;
await this.renderer.render(metadata, this.store);
```

날짜 선택은 메타데이터의 날짜별 인덱스를 사용한다. 사용자 선택은 전체 메시지를 다시 읽지 않고 메타데이터 참여자 통계만 갱신한 뒤 현재 창을 재렌더링한다.

- [ ] **Step 4: 검색 DOM을 안전하게 생성**

정규식 기반 HTML 삽입을 제거하고 `textContent` 및 `<mark>` 노드를 사용한다. 검색이 겹치면 마지막 요청의 결과만 표시한다. 링크 렌더링도 URL과 일반 텍스트를 먼저 이스케이프한다.

- [ ] **Step 5: 지원 오류와 문서 갱신**

Worker, IndexedDB, `File.prototype.stream`이 없으면 지원 브라우저 안내를 표시한다. `AGENTS.md`에 로컬 HTTP 서버가 필수임과 전체 검사 명령을 유지한다.

- [ ] **Step 6: 전체 자동 검사 실행**

Run:

```bash
for file in scripts/*.js; do node --check "$file"; done
for file in scripts/*.test.mjs; do node "$file"; done
git diff --check
```

Expected: 모두 종료 코드 0

- [ ] **Step 7: 브라우저 대용량 검증**

`python3 -m http.server 8000`으로 실행하고 합성 대용량 `.txt`를 업로드한다. 파싱 중 타이머가 계속 진행되는지, DOM 항목이 400개 이하인지, 스크롤바를 상단·중간·하단으로 빠르게 이동해 메시지가 나타나는지, 검색 결과와 날짜 이동이 정확한지 확인한다. 개발자 도구 Network에서 채팅 파일 업로드 요청이 없는지도 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add AGENTS.md index.html scripts/main.js scripts/main.test.mjs
git commit -m "feat: 대용량 채팅 탐색 흐름 완성"
```

# Unlimited Search Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검색 결과 개수 제한을 제거하면서 검색 패널 DOM과 메인 스레드 메모리를 일정하게 유지한다.

**Architecture:** Worker가 일치 메시지 요약을 IndexedDB `searchChunks`에 최신순으로 저장하고 결과 수만 반환한다. 별도 검색 렌더러가 저장소에서 화면 주변 최대 200개만 읽어 연속 가상 스크롤한다.

**Tech Stack:** 정적 HTML, ES6 JavaScript, Web Worker, IndexedDB, Node.js `assert`, Chromium

## Global Constraints

- 검색 결과 수에 인위적인 상한을 두지 않는다.
- 검색 결과 DOM은 최대 200개로 제한한다.
- 채팅 파일과 검색 결과는 서버로 전송하지 않는다.
- 별도 서버, 유료 서비스, 외부 의존성을 추가하지 않는다.
- 결과는 최신순이며 사용자 텍스트는 DOM 텍스트 노드로만 삽입한다.

---

### Task 1: 검색 결과 IndexedDB 저장과 범위 조회

**Files:**
- Modify: `scripts/parser.worker.js`
- Modify: `scripts/chat-store.js`
- Modify: `scripts/chat-store.test.mjs`

**Interfaces:**
- Produces: `ChatStore.search(query): Promise<{ total: number }>`
- Produces: `ChatStore.getSearchRange(start, count): Promise<SearchResult[]>`
- Worker requests: `search`, `searchRange`

- [ ] **Step 1: 제한 없는 검색 계약 테스트 작성**

```js
const searchPromise = store.search('공통어');
const request = worker.messages.at(-1);
assert.equal('limit' in request, false);
worker.emit({ id: request.id, result: { total: 1200 } });
assert.equal((await searchPromise).total, 1200);

const rangePromise = store.getSearchRange(800, 200);
const rangeRequest = worker.messages.at(-1);
assert.equal(rangeRequest.type, 'searchRange');
worker.emit({ id: rangeRequest.id, result: [{ index: 7 }] });
assert.equal((await rangePromise)[0].index, 7);
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/chat-store.test.mjs`
Expected: 검색 요청에 `limit`가 포함되거나 `getSearchRange`가 없어 실패

- [ ] **Step 3: 클라이언트 API 최소 변경**

```js
search(query) {
    for (const [id, request] of this.pending) {
        if (request.type !== 'search') continue;
        this.pending.delete(id);
        request.reject(new DOMException('새 검색이 시작되었습니다.', 'AbortError'));
    }
    return this.request('search', { query });
}

getSearchRange(start, count) {
    return this.request('searchRange', { start, count });
}
```

기존 검색 취소 동작은 유지하고 `limit` 전달만 제거한다.

- [ ] **Step 4: Worker 검색 저장소 구현**

DB 버전을 3으로 올리고 `searchChunks`를 `keyPath: 'start'`로 추가한다. 새 파일과 새 검색에서 이 store를 비운다. 원본 청크를 최신순으로 읽고 일치 메시지의 `index`, `sender`, `time`, `date`, `content`를 500개 청크로 묶는다.

```js
async function putSearchChunks(chunks) {
    const database = await openDatabase();
    const transaction = database.transaction(SEARCH_STORE_NAME, 'readwrite');
    chunks.forEach(chunk => transaction.objectStore(SEARCH_STORE_NAME).put(chunk));
    await transactionDone(transaction);
}
```

`searchMessages()`는 모든 원본 청크를 끝까지 검사하고 `{ total }`을 반환한다. `getSearchRange()`는 필요한 결과 청크만 읽고 요청 범위로 잘라 반환한다. 각 원본 묶음 전후에 `activeSearchId`를 검사해 오래된 검색이 결과를 추가하지 못하게 한다.

- [ ] **Step 5: 검사와 커밋**

Run: `node scripts/chat-store.test.mjs && node --check scripts/chat-store.js && node --check scripts/parser.worker.js`
Expected: 모두 성공

```bash
git add scripts/chat-store.js scripts/chat-store.test.mjs scripts/parser.worker.js
git commit -m "feat: 검색 결과를 브라우저 저장소에 보관"
```

### Task 2: 검색 결과 연속 가상 스크롤

**Files:**
- Create: `scripts/search-renderer.js`
- Create: `scripts/search-renderer.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: `store.getSearchRange(start, count)`
- Produces: `SearchResultsRenderer.render(total, query, store, formatDate)`
- Produces: `SearchResultsRenderer.clear()`

- [ ] **Step 1: 200개 DOM과 비동기 경합 테스트 작성**

```js
await renderer.render(1200, '공통어', store, value => value);
assert.deepEqual(store.calls[0], { start: 0, count: 200 });
assert.equal(container.querySelectorAll('[data-search-result-position]').length, 200);

const old = renderer.renderWindow(200);
const latest = renderer.renderWindow(800);
resolveLatest();
resolveOld();
await Promise.all([old, latest]);
assert.equal(renderer.renderStart, 800);
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/search-renderer.test.mjs`
Expected: `search-renderer.js`가 없어 실패

- [ ] **Step 3: 최소 검색 렌더러 구현**

`windowSize=200`, `windowBuffer=50`, 예상 행 높이 `120px`, 최대 가상 트랙 `10,000,000px`을 사용한다. `requestAnimationFrame` 스크롤 처리와 요청 세대 번호로 최신 범위만 DOM에 반영한다.

```js
async renderWindow(startIndex) {
    const generation = ++this.renderGeneration;
    const results = await this.store.getSearchRange(start, count);
    if (generation !== this.renderGeneration) return false;
    this.renderStart = start;
    this.replaceResults(results);
    return true;
}
```

결과 요소는 `createElement`, `textContent`, `<mark>`만 사용하고 클릭 시 생성자에서 받은 `onSelect(message.index)`를 호출한다. 페이지 이동 버튼은 만들지 않는다.

- [ ] **Step 4: HTML 연결**

검색 영역의 overflow 컨테이너에 `id="search-scroll-container"`를 추가하고 `search-renderer.js`를 `main.js` 앞에서 로드한다. 검색 로딩 문구에는 `id="search-loading-text"`를 추가한다.

- [ ] **Step 5: 검사와 커밋**

Run: `node scripts/search-renderer.test.mjs && node --check scripts/search-renderer.js`
Expected: 최대 200개, 경합 폐기, 안전한 텍스트 검사 성공

```bash
git add index.html scripts/search-renderer.js scripts/search-renderer.test.mjs
git commit -m "feat: 검색 결과 연속 가상 스크롤 추가"
```

### Task 3: 앱 연결과 배포 검증

**Files:**
- Modify: `scripts/main.js`
- Modify: `scripts/main.test.mjs`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `ChatStore.search`, `ChatStore.getSearchRange`, `SearchResultsRenderer`
- Produces: 제한 없는 검색 UI와 기존 채팅 이동

- [ ] **Step 1: 검색 메타데이터 연결 테스트 작성**

```js
viewer.store = { search: async () => ({ total: 1200 }) };
assert.equal((await viewer.searchMessages('공통어')).total, 1200);
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/main.test.mjs`
Expected: 기존 배열 매핑 코드로 실패

- [ ] **Step 3: 앱 검색 흐름 교체**

```js
const { total } = await this.searchMessages(query);
await this.searchRenderer.render(total, query, this.store, date => this.formatSearchDate(date));
```

생성자에서 검색 렌더러를 만들고 결과 클릭을 `this.renderer.scrollToIndex(index)`에 연결한다. 검색 완료 후 전체 개수를 표시하며 `최대 200개` 문구를 제거한다. 빈 검색과 달력 전환에서는 검색 렌더러 상태를 안전하게 초기화한다.

- [ ] **Step 4: 전체 자동 검사**

Run:

```bash
for file in scripts/*.js; do node --check "$file"; done
for file in scripts/*.test.mjs; do node "$file"; done
git diff --check
```

Expected: 모두 종료 코드 0

- [ ] **Step 5: 브라우저 검증**

공통 검색어가 1,200회 포함된 합성 채팅을 업로드한다. 전체 결과가 `1,200개`인지, 검색 결과 DOM이 200개 이하인지, 검색 패널 상단·중간·하단 이동이 정확한지, 가장 오래된 결과 클릭이 채팅으로 이동하는지, 비-GET 네트워크 요청이 없는지 확인한다.

- [ ] **Step 6: 문서·커밋·배포**

`AGENTS.md`에 `search-renderer.js` 책임과 검사 명령을 반영한다.

```bash
git add AGENTS.md scripts/main.js scripts/main.test.mjs
git commit -m "feat: 검색 결과 제한 제거"
git push origin main
```

GitHub Pages 배포 성공을 확인하고 공개 URL에서 같은 브라우저 검증을 반복한다.

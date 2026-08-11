importScripts('parser.js');

const DATABASE_NAME = 'kakaotalk-chat-viewer';
const SOURCE_STORE_NAME = 'chunks';
const SEARCH_STORE_NAME = 'searchChunks';
const SOURCE_BATCH_SIZE = 5000;
const SEARCH_BATCH_SIZE = 500;
const MAX_SEARCH_RANGE = 200;
let databasePromise;
let activeSearchId = 0;

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => reject(request.error));
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.addEventListener('complete', resolve);
        transaction.addEventListener('abort', () => reject(transaction.error));
        transaction.addEventListener('error', () => reject(transaction.error));
    });
}

function openDatabase() {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 3);
        request.addEventListener('upgradeneeded', () => {
            if (request.result.objectStoreNames.contains('messages')) {
                request.result.deleteObjectStore('messages');
            }
            if (!request.result.objectStoreNames.contains(SOURCE_STORE_NAME)) {
                request.result.createObjectStore(SOURCE_STORE_NAME, { keyPath: 'start' });
            }
            if (!request.result.objectStoreNames.contains(SEARCH_STORE_NAME)) {
                request.result.createObjectStore(SEARCH_STORE_NAME, { keyPath: 'start' });
            }
        });
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => reject(request.error));
        request.addEventListener('blocked', () => reject(new Error('다른 탭에서 채팅 저장소를 사용 중입니다.')));
    });
    return databasePromise;
}

async function clearStoredData() {
    const database = await openDatabase();
    const transaction = database.transaction([SOURCE_STORE_NAME, SEARCH_STORE_NAME], 'readwrite');
    transaction.objectStore(SOURCE_STORE_NAME).clear();
    transaction.objectStore(SEARCH_STORE_NAME).clear();
    await transactionDone(transaction);
}

async function putBatch(entries) {
    if (entries.length === 0) return;
    const database = await openDatabase();
    const transaction = database.transaction(SOURCE_STORE_NAME, 'readwrite');
    transaction.objectStore(SOURCE_STORE_NAME).put({ start: entries[0].index, entries });
    await transactionDone(transaction);
}

async function importFile(file) {
    activeSearchId++;
    await clearStoredData();

    const batch = [];
    const senderCounts = new Map();
    const dates = [];
    const parser = new self.KakaoTalkStreamParser(entry => {
        delete entry.raw;
        batch.push(entry);
        if (entry.type === 'date') dates.push({ date: entry.date, index: entry.index });
        if (entry.type === 'message') {
            senderCounts.set(entry.sender, (senderCounts.get(entry.sender) || 0) + 1);
        }
    });
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    let loaded = 0;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        parser.pushChunk(decoder.decode(value, { stream: true }));
        while (batch.length >= SOURCE_BATCH_SIZE) {
            await putBatch(batch.splice(0, SOURCE_BATCH_SIZE));
        }
        self.postMessage({ type: 'progress', loaded, total: file.size });
    }

    parser.pushChunk(decoder.decode());
    const metadata = parser.finish();
    while (batch.length > 0) await putBatch(batch.splice(0, SOURCE_BATCH_SIZE));
    self.postMessage({ type: 'progress', loaded: file.size, total: file.size });

    return {
        ...metadata,
        users: [...senderCounts.entries()]
            .map(([name, messageCount]) => ({ name, messageCount }))
            .sort((a, b) => b.messageCount - a.messageCount),
        dates
    };
}

async function getRange(start, count) {
    if (count <= 0) return [];
    const database = await openDatabase();
    const transaction = database.transaction(SOURCE_STORE_NAME, 'readonly');
    const firstChunk = Math.floor(start / SOURCE_BATCH_SIZE) * SOURCE_BATCH_SIZE;
    const lastIndex = start + count - 1;
    const lastChunk = Math.floor(lastIndex / SOURCE_BATCH_SIZE) * SOURCE_BATCH_SIZE;
    const range = IDBKeyRange.bound(firstChunk, lastChunk);
    const chunks = await requestResult(transaction.objectStore(SOURCE_STORE_NAME).getAll(range));
    await transactionDone(transaction);
    return chunks
        .flatMap(chunk => chunk.entries)
        .filter(entry => entry.index >= start && entry.index <= lastIndex);
}

async function searchMessages(id, query) {
    activeSearchId = id;
    const normalizedQuery = query.toLocaleLowerCase();
    const database = await openDatabase();
    const transaction = database.transaction([SOURCE_STORE_NAME, SEARCH_STORE_NAME], 'readwrite');
    const searchStore = transaction.objectStore(SEARCH_STORE_NAME);
    const request = transaction.objectStore(SOURCE_STORE_NAME).openCursor(null, 'prev');
    let batch = [];
    let total = 0;
    let cancelled = false;

    searchStore.clear();

    return new Promise((resolve, reject) => {
        request.addEventListener('error', () => reject(request.error));
        transaction.addEventListener('complete', () => {
            resolve(activeSearchId === id ? { total } : null);
        });
        transaction.addEventListener('abort', () => {
            if (cancelled) resolve(null);
            else reject(transaction.error || new Error('검색 결과 저장에 실패했습니다.'));
        });
        transaction.addEventListener('error', () => {
            if (!cancelled) reject(transaction.error);
        });
        request.addEventListener('success', () => {
            if (activeSearchId !== id) {
                cancelled = true;
                transaction.abort();
                return;
            }

            const cursor = request.result;
            if (!cursor) {
                if (batch.length > 0) {
                    searchStore.put({ start: total - batch.length, entries: batch });
                }
                return;
            }

            const messages = cursor.value.entries;
            for (let index = messages.length - 1; index >= 0; index--) {
                const message = messages[index];
                if (message.type === 'message' &&
                    message.content?.toLocaleLowerCase().includes(normalizedQuery)) {
                    batch.push({
                        index: message.index,
                        sender: message.sender,
                        time: message.time,
                        date: message.date,
                        content: message.content
                    });
                    total++;
                    if (batch.length === SEARCH_BATCH_SIZE) {
                        searchStore.put({ start: total - SEARCH_BATCH_SIZE, entries: batch });
                        batch = [];
                    }
                }
            }
            cursor.continue();
        });
    });
}

async function getSearchRange(start, count) {
    const safeStart = Math.max(0, Math.floor(start));
    const safeCount = Math.max(0, Math.min(Math.floor(count), MAX_SEARCH_RANGE));
    if (safeCount === 0) return [];

    const database = await openDatabase();
    const transaction = database.transaction(SEARCH_STORE_NAME, 'readonly');
    const firstChunk = Math.floor(safeStart / SEARCH_BATCH_SIZE) * SEARCH_BATCH_SIZE;
    const lastIndex = safeStart + safeCount - 1;
    const lastChunk = Math.floor(lastIndex / SEARCH_BATCH_SIZE) * SEARCH_BATCH_SIZE;
    const chunks = await requestResult(
        transaction.objectStore(SEARCH_STORE_NAME).getAll(IDBKeyRange.bound(firstChunk, lastChunk))
    );
    await transactionDone(transaction);
    return chunks.flatMap(chunk => chunk.entries).slice(safeStart - firstChunk, safeStart - firstChunk + safeCount);
}

self.addEventListener('message', async event => {
    const { id, type } = event.data;
    try {
        let result;
        if (type === 'import') result = await importFile(event.data.file);
        else if (type === 'range') result = await getRange(event.data.start, event.data.count);
        else if (type === 'search') result = await searchMessages(id, event.data.query);
        else if (type === 'searchRange') result = await getSearchRange(event.data.start, event.data.count);
        else throw new Error('지원하지 않는 저장소 요청입니다.');

        if (result !== null) self.postMessage({ id, result });
    } catch (error) {
        self.postMessage({
            id,
            error: error?.message || '채팅 저장소 처리에 실패했습니다.',
            errorName: error?.name || 'Error'
        });
    }
});

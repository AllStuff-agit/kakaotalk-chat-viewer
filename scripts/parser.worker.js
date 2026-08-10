importScripts('parser.js');

const DATABASE_NAME = 'kakaotalk-chat-viewer';
const STORE_NAME = 'messages';
const BATCH_SIZE = 1000;
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
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.addEventListener('upgradeneeded', () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'index' });
            }
        });
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => reject(request.error));
        request.addEventListener('blocked', () => reject(new Error('다른 탭에서 채팅 저장소를 사용 중입니다.')));
    });
    return databasePromise;
}

async function clearMessages() {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
}

async function putBatch(entries) {
    if (entries.length === 0) return;
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    entries.forEach(entry => store.put(entry));
    await transactionDone(transaction);
}

async function importFile(file) {
    await clearMessages();

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
        while (batch.length >= BATCH_SIZE) await putBatch(batch.splice(0, BATCH_SIZE));
        self.postMessage({ type: 'progress', loaded, total: file.size });
    }

    parser.pushChunk(decoder.decode());
    const metadata = parser.finish();
    while (batch.length > 0) await putBatch(batch.splice(0, BATCH_SIZE));
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
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const range = IDBKeyRange.bound(start, start + count - 1);
    const result = await requestResult(transaction.objectStore(STORE_NAME).getAll(range));
    await transactionDone(transaction);
    return result;
}

async function searchMessages(id, query, limit) {
    activeSearchId = id;
    const normalizedQuery = query.toLocaleLowerCase();
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).openCursor(null, 'prev');

    return new Promise((resolve, reject) => {
        const results = [];
        request.addEventListener('error', () => reject(request.error));
        request.addEventListener('success', () => {
            if (activeSearchId !== id) {
                resolve(null);
                return;
            }

            const cursor = request.result;
            if (!cursor || results.length >= limit) {
                resolve(results);
                return;
            }

            const message = cursor.value;
            if (message.type === 'message' &&
                message.content?.toLocaleLowerCase().includes(normalizedQuery)) {
                results.push(message);
            }
            cursor.continue();
        });
    });
}

self.addEventListener('message', async event => {
    const { id, type } = event.data;
    try {
        let result;
        if (type === 'import') result = await importFile(event.data.file);
        else if (type === 'range') result = await getRange(event.data.start, event.data.count);
        else if (type === 'search') result = await searchMessages(id, event.data.query, event.data.limit);
        else throw new Error('지원하지 않는 저장소 요청입니다.');

        if (result !== null) self.postMessage({ id, result });
    } catch (error) {
        self.postMessage({ id, error: error?.message || '채팅 저장소 처리에 실패했습니다.' });
    }
});

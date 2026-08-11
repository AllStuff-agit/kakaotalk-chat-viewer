class ChatStore {
    constructor(workerFactory = url => new Worker(url)) {
        this.worker = workerFactory('scripts/parser.worker.js');
        this.nextRequestId = 1;
        this.pending = new Map();
        this.progressListener = null;
        this.closed = false;

        this.worker.addEventListener('message', event => this.handleMessage(event.data));
        this.worker.addEventListener('error', event => {
            this.rejectAll(new Error(event.message || '채팅 저장소를 실행할 수 없습니다.'));
        });
    }

    handleMessage(message) {
        if (message.type === 'progress') {
            this.progressListener?.({ loaded: message.loaded, total: message.total });
            return;
        }

        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);

        if (message.error) {
            const error = new Error(message.error);
            error.name = message.errorName || 'Error';
            request.reject(error);
        } else {
            request.resolve(message.result);
        }
    }

    request(type, payload = {}) {
        if (this.closed) return Promise.reject(new Error('채팅 저장소가 종료되었습니다.'));

        const id = this.nextRequestId++;
        const promise = new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, type });
        });
        this.worker.postMessage({ id, type, ...payload });
        return promise;
    }

    importFile(file, onProgress) {
        this.progressListener = onProgress;
        return this.request('import', { file }).finally(() => {
            this.progressListener = null;
        });
    }

    getRange(start, count) {
        return this.request('range', { start, count });
    }

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

    rejectAll(error) {
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.rejectAll(new Error('채팅 저장소가 종료되었습니다.'));
        this.worker.terminate();
    }
}

globalThis.ChatStore = ChatStore;

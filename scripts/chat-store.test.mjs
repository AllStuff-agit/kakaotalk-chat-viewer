import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FakeWorker {
    constructor() {
        this.listeners = new Map();
        this.messages = [];
        this.terminated = false;
    }

    addEventListener(type, listener) {
        this.listeners.set(type, listener);
    }

    postMessage(message) {
        this.messages.push(message);
    }

    emit(data) {
        this.listeners.get('message')({ data });
    }

    terminate() {
        this.terminated = true;
    }
}

const sandbox = { DOMException, Error };
vm.runInNewContext(fs.readFileSync(new URL('chat-store.js', import.meta.url), 'utf8'), sandbox);

const worker = new FakeWorker();
const store = new sandbox.ChatStore(() => worker);
const progressEvents = [];
const importPromise = store.importFile({ name: 'chat.txt' }, progress => progressEvents.push(progress));
assert.equal(worker.messages[0].type, 'import');
worker.emit({ type: 'progress', loaded: 50, total: 100 });
worker.emit({ id: worker.messages[0].id, result: { totalEntries: 2 } });
assert.equal((await importPromise).totalEntries, 2);
assert.equal(progressEvents.length, 1);
assert.equal(progressEvents[0].loaded, 50);
assert.equal(progressEvents[0].total, 100);

const rangePromise = store.getRange(100, 400);
const rangeRequest = worker.messages.at(-1);
assert.equal(rangeRequest.start, 100);
assert.equal(rangeRequest.count, 400);
worker.emit({ id: rangeRequest.id, result: [{ index: 100 }] });
assert.equal((await rangePromise)[0].index, 100);

const staleSearch = store.search('이전');
const latestSearch = store.search('최근');
await assert.rejects(staleSearch, error => error.name === 'AbortError');
const latestRequest = worker.messages.at(-1);
worker.emit({ id: latestRequest.id, result: [{ index: 7 }] });
assert.equal((await latestSearch)[0].index, 7);

store.close();
assert.equal(worker.terminated, true);
console.log('chat store client check passed');

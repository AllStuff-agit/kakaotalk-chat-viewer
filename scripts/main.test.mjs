import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {
    document: { addEventListener: () => {} },
    window: {}
};
const source = `${fs.readFileSync(new URL('main.js', import.meta.url), 'utf8')}\nwindow.KakaoTalkViewer = KakaoTalkViewer;`;
vm.runInNewContext(source, sandbox);

const viewer = Object.create(sandbox.window.KakaoTalkViewer.prototype);
viewer.showError = () => {};
assert.equal(viewer.validateFile({ name: 'large-chat.txt', size: 10 ** 12, type: 'text/plain' }), true);

viewer.currentChatData = { totalEntries: 1_000_000, totalMessages: 999_000 };
viewer.store = {
    async search(query) {
        assert.equal(query, '<img');
        assert.equal(arguments.length, 1, '검색 결과 개수 제한을 전달하면 안 된다.');
        return { total: 1200 };
    }
};

const results = await viewer.searchMessages('<img');
assert.equal(results.total, 1200);
assert.equal(viewer.escapeHtml('<script>'), '&lt;script&gt;');

viewer.availableDates = new Set();
viewer.dateIndexes = new Map();
viewer.extractAvailableDates({
    dates: [{ date: '2026년 8월 10일 월요일', index: 12345 }]
});
assert.equal(viewer.availableDates.has('2026-08-10'), true);
assert.equal(viewer.dateIndexes.get('2026-08-10'), 12345);
console.log('main storage integration check passed');

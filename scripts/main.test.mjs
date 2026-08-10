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
    async search(query, limit) {
        assert.equal(query, '<img');
        assert.equal(limit, 200);
        return [{
            content: '<img src=x> 검색',
            date: '2026년 8월 10일 월요일',
            index: 7,
            sender: '<관리자>',
            time: '오후 1:00',
            type: 'message'
        }];
    }
};

const results = await viewer.searchMessages('<img');
assert.equal(results[0].index, 7);
assert.equal(results[0].highlightedContent.includes('<img src=x>'), false, '검색 결과 HTML을 이스케이프해야 한다.');
assert.equal(results[0].highlightedContent.includes('<mark'), true);
assert.equal(viewer.escapeHtml('<script>'), '&lt;script&gt;');

viewer.availableDates = new Set();
viewer.dateIndexes = new Map();
viewer.extractAvailableDates({
    dates: [{ date: '2026년 8월 10일 월요일', index: 12345 }]
});
assert.equal(viewer.availableDates.has('2026-08-10'), true);
assert.equal(viewer.dateIndexes.get('2026-08-10'), 12345);
console.log('main storage integration check passed');

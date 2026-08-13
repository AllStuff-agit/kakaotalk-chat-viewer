import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const elements = new Map();
function getElement(id) {
    if (!elements.has(id)) {
        const classes = new Set(id === 'calendar-popup' ? ['hidden'] : []);
        elements.set(id, {
            classList: {
                add: value => classes.add(value),
                contains: value => classes.has(value),
                remove: value => classes.delete(value)
            }
        });
    }
    return elements.get(id);
}
const sandbox = {
    document: {
        addEventListener: () => {},
        getElementById: getElement
    },
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

viewer.availableDates = new Set(['2023-01-15', '2024-11-02']);
viewer.renderCalendar = () => {};
viewer.showCalendar();
assert.equal(viewer.currentCalendarDate.getFullYear(), 2024);
assert.equal(viewer.currentCalendarDate.getMonth(), 10);
assert.equal(viewer.currentCalendarDate.getDate(), 2);
assert.equal(getElement('calendar-popup').classList.contains('hidden'), false);

viewer.dateIndexes = new Map([['2024-11-02', 200]]);
viewer.renderer = { scrollToIndex: () => {} };
viewer.scrollToDate('2024-11-02');
assert.equal(
    getElement('calendar-popup').classList.contains('hidden'),
    false,
    '날짜를 선택해도 달력은 열린 상태를 유지해야 한다.'
);
console.log('main storage integration check passed');

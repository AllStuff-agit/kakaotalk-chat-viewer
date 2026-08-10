import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createElement(tagName = 'div') {
    let innerHTML = '';
    let textContent = '';
    return {
        addEventListener: () => {},
        classList: { add: () => {}, remove: () => {} },
        className: '',
        dataset: {},
        getBoundingClientRect: () => ({ height: 64, top: 0 }),
        get innerHTML() {
            if (textContent) {
                return textContent
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }
            return innerHTML;
        },
        set innerHTML(value) {
            innerHTML = value;
            textContent = '';
        },
        get textContent() {
            return textContent;
        },
        set textContent(value) {
            textContent = value;
        },
        setAttribute(name, value) {
            if (name === 'data-message-index') this.dataset.messageIndex = String(value);
        },
        style: {},
        tagName: tagName.toUpperCase()
    };
}

const container = {
    addEventListener: () => {},
    appendChild(element) {
        this.children.push(element);
    },
    children: [],
    clientHeight: 800,
    getBoundingClientRect: () => ({ top: 0 }),
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
    scrollHeight: 10_000_000,
    scrollTop: 0
};

const sandbox = {
    clearTimeout,
    document: {
        createElement,
        getElementById: id => id === 'chat-messages' ? container : null,
        querySelectorAll: () => []
    },
    requestAnimationFrame: callback => callback(),
    setTimeout,
    window: {}
};
vm.runInNewContext(fs.readFileSync(new URL('renderer.js', import.meta.url), 'utf8'), sandbox);

const metadata = {
    title: '테스트방',
    totalEntries: 1_000_000,
    users: [{ name: '나', messageCount: 1_000_000 }]
};
const calls = [];
const store = {
    async getRange(start, count) {
        calls.push({ start, count });
        return Array.from({ length: count }, (_, offset) => ({
            content: `메시지 ${start + offset}`,
            index: start + offset,
            messageType: 'text',
            sender: '나',
            time: '오후 1:00',
            type: 'message'
        }));
    }
};

const renderer = new sandbox.window.ChatRenderer('chat-messages');
renderer.setupUserButtons = () => {};
renderer.finishRendering = () => {};
renderer.renderDateSeparator = () => {};
const renderedIndexes = [];
renderer.renderMessage = message => renderedIndexes.push(message.index);
await renderer.render(metadata, store);

assert.equal(calls[0].start, 999599, '그룹 경계 확인용 앞 메시지부터 조회해야 한다.');
assert.equal(calls[0].count, 401, '화면 400개와 앞 경계 한 개만 조회해야 한다.');
assert.equal(renderedIndexes.length, 400, 'DOM 채팅 항목은 400개를 넘으면 안 된다.');
assert.equal(renderer.virtualHeight, 10_000_000, '브라우저 스크롤 높이 한계를 피해야 한다.');

let resolveOld;
let resolveLatest;
const racingStore = {
    getRange(start) {
        return new Promise(resolve => {
            if (start === 0) resolveOld = () => resolve([]);
            else resolveLatest = () => resolve([]);
        });
    }
};
renderer.store = racingStore;
const oldRequest = renderer.renderWindow(1);
const latestRequest = renderer.renderWindow(500000);
resolveLatest();
await latestRequest;
resolveOld();
await oldRequest;
assert.equal(renderer.renderStart, 500000, '늦게 끝난 이전 위치 조회가 최신 화면을 덮으면 안 된다.');

renderer.totalEntries = 1_000_000;
renderer.virtualHeight = 10_000_000;
assert.ok(Math.abs(renderer.offsetToIndex(renderer.indexToOffset(500000)) - 500000) <= 1);
const safeLink = renderer.renderLinkMessage('https://example.com/" onclick="alert(1) <img>');
assert.equal(safeLink.includes('<img>'), false, '채팅 내용의 HTML을 실행하면 안 된다.');
assert.equal(safeLink.includes('rel="noopener noreferrer"'), true);
console.log('renderer storage virtualization check passed');

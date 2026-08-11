import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createElement(tagName = 'div') {
    let ownText = '';
    return {
        addEventListener(type, listener) {
            this.listeners[type] = listener;
        },
        appendChild(child) {
            this.childNodes.push(child);
            if (child.tagName) this.children.push(child);
            return child;
        },
        childNodes: [],
        children: [],
        className: '',
        dataset: {},
        listeners: {},
        replaceChildren(...children) {
            this.childNodes = [];
            this.children = [];
            children.forEach(child => this.appendChild(child));
        },
        setAttribute: () => {},
        style: {},
        tagName: tagName.toUpperCase(),
        get textContent() {
            return ownText + this.childNodes.map(child => child.textContent || '').join('');
        },
        set textContent(value) {
            ownText = String(value);
            this.childNodes = [];
            this.children = [];
        }
    };
}

const container = createElement();
container.clientHeight = 800;
const scrollContainer = createElement();
scrollContainer.clientHeight = 800;
scrollContainer.scrollTop = 0;
const sandbox = {
    document: {
        createElement,
        createTextNode: text => ({ textContent: text }),
        getElementById: id => id === 'search-results' ? container : scrollContainer
    },
    requestAnimationFrame: callback => callback(),
    window: {}
};
vm.runInNewContext(fs.readFileSync(new URL('search-renderer.js', import.meta.url), 'utf8'), sandbox);

const calls = [];
const store = {
    async getSearchRange(start, count) {
        calls.push({ start, count });
        return Array.from({ length: count }, (_, offset) => ({
            content: offset === 0 ? '<img src=x> 공통검색어' : `공통검색어 ${start + offset}`,
            date: '2026년 8월 11일 화요일',
            index: 1200 - start - offset,
            sender: '<관리자>',
            time: '오후 1:00'
        }));
    }
};

const renderer = new sandbox.SearchResultsRenderer('search-results', 'search-scroll-container', () => {});
await renderer.render(1200, '공통검색어', store, value => value);
assert.deepEqual(calls[0], { start: 0, count: 200 });
assert.equal(renderer.renderEnd - renderer.renderStart, 200, '검색 결과 DOM은 200개를 넘으면 안 된다.');
assert.equal(renderer.renderedItems.length, 200);
assert.equal(renderer.renderedItems[0].textContent.includes('<img src=x>'), true, '사용자 HTML은 텍스트로 표시해야 한다.');
assert.equal(renderer.renderedItems[0].children.some(child => child.tagName === 'IMG'), false);

let resolveOld;
let resolveLatest;
renderer.store = {
    getSearchRange(start) {
        return new Promise(resolve => {
            if (start === 0) resolveOld = () => resolve([]);
            else resolveLatest = () => resolve([]);
        });
    }
};
const oldRequest = renderer.renderWindow(0);
const latestRequest = renderer.renderWindow(500);
resolveLatest();
await latestRequest;
resolveOld();
await oldRequest;
assert.equal(renderer.renderStart, 500, '늦게 끝난 이전 조회가 최신 위치를 덮으면 안 된다.');
assert.equal(renderer.offsetToStart(renderer.virtualHeight), 1000);
console.log('search result virtualization check passed');

class SearchResultsRenderer {
    constructor(containerId, scrollContainerId, onSelect) {
        this.container = document.getElementById(containerId);
        this.scrollContainer = document.getElementById(scrollContainerId);
        this.onSelect = onSelect;
        this.windowSize = 200;
        this.windowBuffer = 50;
        this.estimatedItemHeight = 120;
        this.total = 0;
        this.renderStart = 0;
        this.renderEnd = 0;
        this.renderGeneration = 0;
        this.renderedItems = [];
        this.scrollFrame = null;

        this.scrollContainer.addEventListener('scroll', () => this.handleScroll(), { passive: true });
    }

    async render(total, query, store, formatDate) {
        this.total = total;
        this.query = query;
        this.store = store;
        this.formatDate = formatDate;
        this.virtualHeight = Math.max(
            this.scrollContainer.clientHeight || 800,
            Math.min(total * this.estimatedItemHeight, 10_000_000)
        );
        this.scrollContainer.scrollTop = 0;

        if (total === 0) {
            this.clear(`"${query}"에 대한 검색 결과가 없습니다`);
            return;
        }
        await this.renderWindow(0);
    }

    async renderWindow(startIndex) {
        const start = Math.max(0, Math.min(Math.floor(startIndex), this.total - this.windowSize));
        const generation = ++this.renderGeneration;
        const end = Math.min(this.total, start + this.windowSize);
        const results = await this.store.getSearchRange(start, end - start);
        if (generation !== this.renderGeneration) return false;

        this.renderStart = start;
        this.renderEnd = end;
        this.renderedItems = results.map(result => this.createResult(result));

        const status = document.createElement('div');
        status.className = 'text-sm text-gray-600 mb-3';
        status.textContent = `검색 결과 ${this.total.toLocaleString('ko-KR')}개`;
        const topHeight = this.windowOffset(start);
        const topSpacer = this.createSpacer(topHeight);
        const list = document.createElement('div');
        list.className = 'space-y-3';
        this.renderedItems.forEach(item => list.appendChild(item));
        const bottomSpacer = this.createSpacer(
            this.virtualHeight - topHeight - (end - start) * this.estimatedItemHeight
        );
        this.container.replaceChildren(status, topSpacer, list, bottomSpacer);
        const adjustBottomSpacer = () => {
            if (generation !== this.renderGeneration) return;
            const renderedHeight = list.getBoundingClientRect?.().height ||
                (end - start) * this.estimatedItemHeight;
            bottomSpacer.style.height = `${Math.max(0, this.virtualHeight - topHeight - renderedHeight)}px`;
        };
        adjustBottomSpacer();
        requestAnimationFrame(adjustBottomSpacer);
        return true;
    }

    createResult(result) {
        const item = document.createElement('div');
        item.className = 'p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors';
        item.dataset.messageIndex = String(result.index);
        item.addEventListener('click', () => this.onSelect(result.index));

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between mb-2';
        const senderAndTime = document.createElement('div');
        senderAndTime.className = 'flex items-center';
        const sender = document.createElement('span');
        sender.className = 'text-sm font-medium text-gray-700';
        sender.textContent = result.sender;
        const time = document.createElement('span');
        time.className = 'text-xs text-gray-500 ml-2';
        time.textContent = result.time;
        senderAndTime.appendChild(sender);
        senderAndTime.appendChild(time);
        const date = document.createElement('div');
        date.className = 'text-xs text-gray-400';
        date.textContent = this.formatDate(result.date);
        header.appendChild(senderAndTime);
        header.appendChild(date);

        const content = document.createElement('div');
        content.className = 'text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words';
        this.appendHighlightedText(content, result.content, this.query);
        item.appendChild(header);
        item.appendChild(content);
        return item;
    }

    appendHighlightedText(container, content, query) {
        const text = String(content);
        const normalizedText = text.toLocaleLowerCase();
        const normalizedQuery = query.toLocaleLowerCase();
        let start = 0;
        let match;

        while ((match = normalizedText.indexOf(normalizedQuery, start)) !== -1) {
            container.appendChild(document.createTextNode(text.slice(start, match)));
            const mark = document.createElement('mark');
            mark.className = 'bg-yellow-300';
            mark.textContent = text.slice(match, match + query.length);
            container.appendChild(mark);
            start = match + query.length;
        }
        container.appendChild(document.createTextNode(text.slice(start)));
    }

    createSpacer(height) {
        const spacer = document.createElement('div');
        spacer.className = 'virtual-spacer';
        spacer.style.height = `${Math.max(0, height)}px`;
        spacer.setAttribute('aria-hidden', 'true');
        return spacer;
    }

    windowOffset(start) {
        if (this.total <= this.windowSize) return 0;
        const availableHeight = Math.max(0, this.virtualHeight - this.windowSize * this.estimatedItemHeight);
        return start / (this.total - this.windowSize) * availableHeight;
    }

    offsetToStart(offset) {
        if (this.total <= this.windowSize) return 0;
        const movableHeight = Math.max(1, this.virtualHeight - this.scrollContainer.clientHeight);
        const ratio = Math.max(0, Math.min(1, offset / movableHeight));
        return Math.round(ratio * (this.total - this.windowSize));
    }

    handleScroll() {
        if (this.scrollFrame !== null) return;
        this.scrollFrame = requestAnimationFrame(() => {
            this.scrollFrame = null;
            const start = this.offsetToStart(this.scrollContainer.scrollTop);
            if (Math.abs(start - this.renderStart) >= this.windowBuffer) this.renderWindow(start);
        });
    }

    clear(message = '검색어를 입력해주세요') {
        this.renderGeneration++;
        this.total = 0;
        this.renderedItems = [];
        const empty = document.createElement('div');
        empty.className = 'text-center text-gray-500 text-sm py-8';
        empty.textContent = message;
        this.container.replaceChildren(empty);
    }
}

globalThis.SearchResultsRenderer = SearchResultsRenderer;

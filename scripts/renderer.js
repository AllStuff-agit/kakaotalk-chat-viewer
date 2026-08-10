/**
 * 카카오톡 채팅 UI 렌더러
 * 파싱된 채팅 데이터를 카카오톡과 동일한 UI로 렌더링
 */

class ChatRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.lastSender = '';
        this.lastTime = '';
        this.currentUser = ''; // 사용자 본인으로 추정되는 이름 (가장 많이 메시지를 보낸 사람)
        this.chatData = null; // 채팅 데이터 저장
        this.users = []; // 사용자 목록
        this.dateElements = []; // 날짜 요소들 저장
        this.scrollTimeout = null; // 스크롤 타임아웃
        this.windowSize = 400;
        this.windowBuffer = 100;
        this.renderStart = 0;
        this.renderEnd = 0;
        this.totalEntries = 0;
        this.virtualHeight = 0;
        this.store = null;
        this.renderGeneration = 0;
        this.pendingStart = null;
        this.virtualScrollFrame = null;
        
        this.setupScrollDateIndicator();
        window.chatRenderer = this;
    }

    /**
     * 채팅 데이터 렌더링
     * @param {Object} chatData - 파싱된 채팅 데이터
     * @param {boolean} isInitial - 초기 렌더링인지 여부
     * @param {number|null} focusIndex - 표시할 메시지 인덱스
     */
    async render(chatData, store, isInitial = true, focusIndex = null) {
        this.chatData = chatData;
        this.store = store;
        this.totalEntries = chatData.totalEntries;
        this.virtualHeight = Math.max(
            this.container.clientHeight || 800,
            Math.min(this.totalEntries * 64, 10_000_000)
        );

        if (isInitial) {
            this.determineCurrentUser(chatData);
        }
        this.setupUserButtons(chatData);

        const start = focusIndex === null
            ? this.totalEntries - this.windowSize
            : focusIndex - Math.floor(this.windowSize / 2);
        await this.renderWindow(start);
        this.finishRendering(isInitial, focusIndex === null);
    }

    async renderWindow(startIndex) {
        const start = Math.max(0, Math.min(startIndex, this.totalEntries - this.windowSize));
        if (this.pendingStart === start) return false;

        const generation = ++this.renderGeneration;
        this.pendingStart = start;
        const end = Math.min(this.totalEntries, start + this.windowSize);
        const fetchStart = Math.max(0, start - 1);
        const fetchEnd = Math.min(this.totalEntries, end + 1);
        const entries = await this.store.getRange(fetchStart, fetchEnd - fetchStart);
        if (generation !== this.renderGeneration) return false;

        this.pendingStart = null;
        this.renderStart = start;
        this.renderEnd = end;
        this.container.innerHTML = '';
        this.dateElements = [];
        const entriesByIndex = new Map(entries.map(entry => [entry.index, entry]));

        const topHeight = this.windowOffset(start);
        this.topSpacer = this.createSpacer(topHeight);
        this.container.appendChild(this.topSpacer);

        for (let index = this.renderStart; index < this.renderEnd; index++) {
            const message = entriesByIndex.get(index);
            if (!message) continue;
            if (message.type === 'date') {
                this.renderDateSeparator(message, index);
            } else if (message.type === 'message') {
                this.renderMessage(message, index, entriesByIndex);
            }
        }

        const estimatedWindowHeight = (this.renderEnd - this.renderStart) * 64;
        this.bottomSpacer = this.createSpacer(this.virtualHeight - topHeight - estimatedWindowHeight);
        this.container.appendChild(this.bottomSpacer);
        this.adjustBottomSpacer(topHeight, estimatedWindowHeight);
        return true;
    }

    createSpacer(height) {
        const spacer = document.createElement('div');
        spacer.className = 'virtual-spacer flex-shrink-0';
        spacer.style.height = `${Math.max(0, height)}px`;
        spacer.setAttribute('aria-hidden', 'true');
        return spacer;
    }

    windowOffset(start) {
        if (this.totalEntries <= this.windowSize) return 0;
        const estimatedWindowHeight = this.windowSize * 64;
        const availableHeight = Math.max(0, this.virtualHeight - estimatedWindowHeight);
        return start / (this.totalEntries - this.windowSize) * availableHeight;
    }

    adjustBottomSpacer(topHeight, fallbackHeight) {
        const elements = [...this.container.querySelectorAll('[data-message-index]')];
        const renderedHeight = elements.length > 0
            ? elements.reduce((height, element) => height + element.getBoundingClientRect().height, 0)
            : fallbackHeight;
        this.bottomSpacer.style.height = `${Math.max(0, this.virtualHeight - topHeight - renderedHeight)}px`;
    }

    indexToOffset(index) {
        if (this.totalEntries <= 1) return 0;
        const movableHeight = Math.max(0, this.virtualHeight - this.container.clientHeight);
        return index / (this.totalEntries - 1) * movableHeight;
    }

    offsetToIndex(offset) {
        if (this.totalEntries <= 1) return 0;
        const movableHeight = Math.max(1, this.virtualHeight - this.container.clientHeight);
        return Math.max(0, Math.min(
            this.totalEntries - 1,
            Math.round(offset / movableHeight * (this.totalEntries - 1))
        ));
    }
    
    
    /**
     * 렌더링 완료 후 처리
     */
    finishRendering(isInitial, shouldScrollToBottom = true) {
        if (shouldScrollToBottom) {
            this.scrollToBottomWithLoading();
        }
        
        // 채팅방 헤더 업데이트
        this.updateChatHeader();
        
        // 렌더링 완료 후 버튼 재활성화
        if (!isInitial) {
            this.disableUserButtons(false);
        }
        
        // 스크롤 리스너 연결 (초기 렌더링 시에만)
        if (isInitial) {
            this.attachScrollListener();
        }
    }
    
    
    /**
     * 현재 사용자 추정 (채팅방 제목에서 첫 번째 사람을 기본으로)
     * @param {Object} chatData - 채팅 데이터
     */
    determineCurrentUser(chatData) {
        this.users = chatData.users || [];
        
        // 채팅방 제목에서 첫 번째 사람은 상대방(왼쪽)으로 설정
        // 제목 형태: "공주🎀 님과 카카오톡 대화" -> "공주🎀"는 상대방(왼쪽)
        const titleUser = this.extractUserFromTitle(chatData.title);
        
        if (titleUser && this.users.some(user => user.name === titleUser)) {
            // 제목에 나온 사용자가 아닌 다른 사용자를 "나"로 설정
            const otherUsers = this.users.filter(user => user.name !== titleUser);
            if (otherUsers.length > 0) {
                this.currentUser = otherUsers[0].name; // 다른 사용자 중 메시지가 가장 많은 사람
            } else {
                this.currentUser = titleUser; // 대화 상대가 한 명뿐이면 그 사람을 "나"로
            }
        } else {
            // 제목에서 추출할 수 없으면 메시지가 가장 많은 사람으로
            this.currentUser = this.users[0]?.name || '';
        }
    }
    
    /**
     * 채팅방 제목에서 사용자 이름 추출
     * @param {string} title - 채팅방 제목
     * @returns {string|null} 추출된 사용자 이름
     */
    extractUserFromTitle(title) {
        if (!title) return null;
        
        // "사용자명 님과 카카오톡 대화" 형태에서 사용자명 추출
        const match = title.match(/^(.+?)\s*님과\s*카카오톡\s*대화$/);
        if (match) {
            return match[1].trim();
        }
        
        return null;
    }
    
    /**
     * 사용자 버튼 설정
     * @param {Object} chatData - 채팅 데이터
     */
    setupUserButtons(chatData) {
        const userButtonsContainer = document.getElementById('user-buttons');
        const mobileUserButtonsContainer = document.getElementById('mobile-user-buttons');

        // PC용 버튼 생성
        if (userButtonsContainer) {
            this.createUserButtons(userButtonsContainer, false);
        }

        // 모바일용 버튼 생성
        if (mobileUserButtonsContainer) {
            this.createUserButtons(mobileUserButtonsContainer, true);
        }
    }

    /**
     * 사용자 버튼 생성 (PC/모바일 공통)
     */
    createUserButtons(container, isMobile = false) {
        // 기존 버튼들 제거
        container.innerHTML = '';

        // 각 사용자별 버튼 생성
        this.users.forEach(user => {
            const button = document.createElement('button');
            const isCurrentUser = user.name === this.currentUser;

            // 버튼 스타일링 (PC와 모바일 동일)
            button.className = `w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isCurrentUser
                    ? 'bg-kakao-yellow text-kakao-brown border-2 border-kakao-brown shadow-md'
                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200 hover:border-gray-400'
            }`;

            // 버튼 텍스트 및 아이콘 (향상된 디자인)
            button.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <div class="w-6 h-6 bg-gray-300 rounded-full mr-3 flex items-center justify-center flex-shrink-0">
                            <span class="text-xs font-bold text-gray-600">${user.name[0]}</span>
                        </div>
                        <span class="truncate font-medium">${this.escapeHtml(user.name)}</span>
                    </div>
                    <div class="flex items-center text-xs text-gray-500">
                        <span class="mr-2">${user.messageCount}개</span>
                        ${isCurrentUser ? '<span class="text-kakao-brown font-bold">👤 나</span>' : ''}
                    </div>
                </div>
            `;

            // 클릭 이벤트
            button.addEventListener('click', async () => {
                console.log(`버튼 클릭: ${user.name}, 현재 사용자: ${this.currentUser}`);
                if (this.currentUser !== user.name) {
                    console.log(`사용자 변경: ${this.currentUser} → ${user.name}`);

                    // 로딩 시작
                    this.showUserSwitchingLoading(true);
                    this.disableUserButtons(true);

                    // 사용자 변경
                    this.currentUser = user.name;

                    this.render(this.chatData, this.store, false)
                        .finally(() => this.showUserSwitchingLoading(false));
                }
            });

            container.appendChild(button);
        });
    }
    
    /**
     * 채팅방 헤더 업데이트
     */
    updateChatHeader() {
        const chatHeaderTitle = document.getElementById('chat-header-title');
        const chatHeaderInitial = document.getElementById('chat-header-initial');
        
        if (chatHeaderTitle && this.currentUser && this.users.length >= 2) {
            // 현재 사용자("나")가 아닌 다른 사용자(상대방)의 이름을 헤더에 표시
            const otherUsers = this.users.filter(user => user.name !== this.currentUser);
            if (otherUsers.length > 0) {
                const otherUserName = otherUsers[0].name;
                chatHeaderTitle.textContent = otherUserName;
                
                // 프로필 이미지에 첫 글자 표시
                if (chatHeaderInitial) {
                    chatHeaderInitial.textContent = otherUserName[0];
                }
            }
        }
    }
    
    /**
     * 사용자 변경 로딩 표시
     * @param {boolean} show - 표시 여부
     */
    showUserSwitchingLoading(show) {
        const loadingElement = document.getElementById('user-switching-loading');
        const mobileLoadingElement = document.getElementById('mobile-user-switching-loading');

        if (loadingElement) {
            if (show) {
                loadingElement.classList.remove('hidden');
            } else {
                loadingElement.classList.add('hidden');
            }
        }

        if (mobileLoadingElement) {
            if (show) {
                mobileLoadingElement.classList.remove('hidden');
            } else {
                mobileLoadingElement.classList.add('hidden');
            }
        }
    }
    
    /**
     * 사용자 버튼 비활성화/활성화
     * @param {boolean} disable - 비활성화 여부
     */
    disableUserButtons(disable) {
        const userButtons = document.querySelectorAll('#user-buttons button');
        const mobileUserButtons = document.querySelectorAll('#mobile-user-buttons button');

        [...userButtons, ...mobileUserButtons].forEach(button => {
            button.disabled = disable;
            if (disable) {
                button.style.opacity = '0.6';
                button.style.cursor = 'not-allowed';
            } else {
                button.style.opacity = '1';
                button.style.cursor = 'pointer';
            }
        });
    }
    
    /**
     * 날짜 구분선 렌더링
     * @param {Object} message - 날짜 메시지 객체
     */
    renderDateSeparator(message, index) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'flex justify-center my-4';
        dateDiv.setAttribute('data-date', message.date); // 날짜 데이터 속성 추가
        dateDiv.setAttribute('data-message-index', index);
        dateDiv.innerHTML = `
            <div class="bg-black bg-opacity-20 text-white text-xs px-3 py-1 rounded-full">
                ${message.date}
            </div>
        `;
        
        // 날짜 요소를 배열에 저장
        this.dateElements.push({
            element: dateDiv,
            date: message.date
        });
        
        this.container.appendChild(dateDiv);
    }
    
    /**
     * 메시지 렌더링
     * @param {Object} message - 메시지 객체
     * @param {number} index - 메시지 인덱스
     * @param {Array} messages - 전체 메시지 배열
     */
    renderMessage(message, index, messages) {
        const isMyMessage = message.sender === this.currentUser;
        const prevMessage = messages.get(index - 1) || null;
        const nextMessage = messages.get(index + 1) || null;
        
        // 연속 메시지 체크
        const isFirstInGroup = !prevMessage || 
                               prevMessage.type !== 'message' || 
                               prevMessage.sender !== message.sender;
        const isLastInGroup = !nextMessage || 
                              nextMessage.type !== 'message' || 
                              nextMessage.sender !== message.sender;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `flex mb-2 ${isMyMessage ? 'justify-end' : 'justify-start'}`;
        messageDiv.setAttribute('data-message-index', index);
        
        if (isMyMessage) {
            messageDiv.innerHTML = this.renderMyMessage(message, isFirstInGroup, isLastInGroup);
        } else {
            messageDiv.innerHTML = this.renderOtherMessage(message, isFirstInGroup, isLastInGroup);
        }
        
        this.container.appendChild(messageDiv);
    }
    
    /**
     * 내 메시지 렌더링
     * @param {Object} message - 메시지 객체
     * @param {boolean} isFirstInGroup - 그룹의 첫 메시지인지
     * @param {boolean} isLastInGroup - 그룹의 마지막 메시지인지
     * @returns {string} HTML 문자열
     */
    renderMyMessage(message, isFirstInGroup, isLastInGroup) {
        const content = this.formatMessageContent(message);
        const timeClass = isLastInGroup ? 'opacity-100' : 'opacity-0';
        
        return `
            <div class="flex items-end max-w-[90%] chat-message-container">
                <div class="text-xs text-gray-500 mr-2 mb-1 ${timeClass} flex-shrink-0">
                    ${message.time}
                </div>
                <div class="relative min-w-0 flex-shrink">
                    <div class="bg-my-bubble text-black px-3 py-2 rounded-2xl break-words word-wrap overflow-wrap-anywhere">
                        ${content}
                    </div>

                </div>
            </div>
        `;
    }
    
    /**
     * 상대방 메시지 렌더링
     * @param {Object} message - 메시지 객체
     * @param {boolean} isFirstInGroup - 그룹의 첫 메시지인지
     * @param {boolean} isLastInGroup - 그룹의 마지막 메시지인지
     * @returns {string} HTML 문자열
     */
    renderOtherMessage(message, isFirstInGroup, isLastInGroup) {
        const content = this.formatMessageContent(message);
        const timeClass = isLastInGroup ? 'opacity-100' : 'opacity-0';
        const profileClass = isFirstInGroup ? 'opacity-100' : 'opacity-0';
        
        return `
            <div class="flex items-start max-w-[90%] chat-message-container">
                <div class="w-10 h-10 bg-gray-300 rounded-full mr-3 flex-shrink-0 flex items-center justify-center ${profileClass}">
                    <span class="text-gray-600 text-sm font-bold">${message.sender[0]}</span>
                </div>
                <div class="flex-1 min-w-0">
                    ${isFirstInGroup ? `<div class="text-sm font-medium text-gray-700 mb-1 break-words">${this.escapeHtml(message.sender)}</div>` : ''}
                    <div class="flex items-end">
                        <div class="relative min-w-0 flex-shrink">
                            <div class="bg-other-bubble text-gray-800 px-3 py-2 rounded-2xl break-words word-wrap overflow-wrap-anywhere border">
                                ${content}
                            </div>

                        </div>
                        <div class="text-xs text-gray-500 ml-2 mb-1 ${timeClass} flex-shrink-0">
                            ${message.time}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * 메시지 내용 포맷팅
     * @param {Object} message - 메시지 객체
     * @returns {string} 포맷된 HTML
     */
    formatMessageContent(message) {
        switch (message.messageType) {
            case 'media':
                return this.renderMediaMessage(message.content);
            case 'emoticon':
                return this.renderEmoticonMessage(message.content);
            case 'link':
                return this.renderLinkMessage(message.content);
            case 'file':
                return this.renderFileMessage(message.content);
            case 'voice':
                return this.renderVoiceMessage(message.content);
            case 'system':
                return this.renderSystemMessage(message.content);
            case 'empty':
                return '<em class="text-gray-400">메시지 없음</em>';
            default:
                return this.escapeHtml(message.content);
        }
    }
    
    /**
     * 미디어 메시지 렌더링
     * @param {string} content - 메시지 내용
     * @returns {string} HTML
     */
    renderMediaMessage(content) {
        const icon = content.includes('사진') ? '📷' : '🎥';
        return `
            <div class="flex items-center text-blue-600">
                <span class="text-lg mr-2">${icon}</span>
                <span>${this.escapeHtml(content)}</span>
            </div>
        `;
    }
    
    /**
     * 이모티콘 메시지 렌더링
     * @param {string} content - 메시지 내용
     * @returns {string} HTML
     */
    renderEmoticonMessage(content) {
        return `
            <div class="flex items-center text-purple-600">
                <span class="text-lg mr-2">😊</span>
                <span>${this.escapeHtml(content)}</span>
            </div>
        `;
    }
    
    /**
     * 링크 메시지 렌더링
     * @param {string} content - 메시지 내용
     * @returns {string} HTML
     */
    renderLinkMessage(content) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return content.replace(urlRegex, '<a href="$1" target="_blank" class="text-blue-500 underline">$1</a>');
    }
    
    /**
     * 파일 메시지 렌더링
     * @param {string} content - 메시지 내용
     * @returns {string} HTML
     */
    renderFileMessage(content) {
        return `
            <div class="flex items-center text-green-600">
                <span class="text-lg mr-2">📎</span>
                <span>${this.escapeHtml(content)}</span>
            </div>
        `;
    }
    
    /**
     * 음성메시지 렌더링
     * @param {string} content - 메시지 내용
     * @returns {string} HTML
     */
    renderVoiceMessage(content) {
        return `
            <div class="flex items-center text-orange-600">
                <span class="text-lg mr-2">🎤</span>
                <span>${this.escapeHtml(content)}</span>
            </div>
        `;
    }
    
    /**
     * 시스템 메시지 렌더링
     * @param {string} content - 메시지 내용
     * @returns {string} HTML
     */
    renderSystemMessage(content) {
        return `<em class="text-gray-500 text-sm">${this.escapeHtml(content)}</em>`;
    }
    
    /**
     * HTML 이스케이프 및 줄바꿈 처리
     * @param {string} text - 이스케이프할 텍스트
     * @returns {string} 이스케이프되고 줄바꿈이 <br>로 변환된 텍스트
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        // 줄바꿈 문자를 <br> 태그로 변환
        return div.innerHTML.replace(/\n/g, '<br>');
    }
    
    /**
     * 채팅창을 맨 아래로 스크롤
     */
    scrollToBottomWithLoading() {
        if (!this.container) return;

        this.scrollToBottom();
    }
    
    /**
     * 채팅창을 맨 아래로 스크롤
     */
    scrollToBottom() {
        if (!this.container) return;
        
        // 강제로 맨 아래로 스크롤
        this.container.scrollTop = this.container.scrollHeight;
        
        // 브라우저 렌더링 완료를 기다린 후 한번 더 실행
        requestAnimationFrame(() => {
            this.container.scrollTop = this.container.scrollHeight;
        });
    }

    async scrollToIndex(index, highlight = true) {
        if (!this.chatData || index < 0 || index >= this.totalEntries) return;

        this.container.scrollTop = this.indexToOffset(index);
        if (index < this.renderStart || index >= this.renderEnd) {
            await this.renderWindow(index - Math.floor(this.windowSize / 2));
        }

        const target = this.container.querySelector(`[data-message-index="${index}"]`);
        if (!target) return;

        target.scrollIntoView({ behavior: 'auto', block: 'center' });
        if (highlight) {
            const previousHighlight = this.container.querySelector('.search-highlight');
            if (previousHighlight) {
                previousHighlight.classList.remove('search-highlight');
            }
            target.classList.add('search-highlight');
            setTimeout(() => target.classList.remove('search-highlight'), 3000);
        }
    }
    
    /**
     * 스크롤 날짜 표시기 설정
     */
    setupScrollDateIndicator() {
        // 초기화만 수행, 실제 리스너는 render에서 연결
    }
    
    /**
     * 스크롤 리스너 연결
     */
    attachScrollListener() {
        this.container.addEventListener('scroll', () => {
            if (this.virtualScrollFrame) return;

            this.virtualScrollFrame = requestAnimationFrame(() => {
                this.handleVirtualScroll();
                this.handleScroll();
                this.virtualScrollFrame = null;
            });
        }, { passive: true });
        
        // DOM이 완전히 로드된 후 버튼 이벤트 연결
        setTimeout(() => {
            const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');
            if (scrollToBottomBtn) {
                scrollToBottomBtn.addEventListener('click', () => {
                    this.scrollToBottomWithLoading();
                });
            }
        }, 100);
    }

    handleVirtualScroll() {
        if (!this.chatData || this.totalEntries <= this.windowSize) return;

        const visibleIndex = this.offsetToIndex(this.container.scrollTop);
        if (visibleIndex < this.renderStart + this.windowBuffer || visibleIndex >= this.renderEnd - this.windowBuffer) {
            const start = Math.max(0, Math.min(
                visibleIndex - Math.floor(this.windowSize / 2),
                this.totalEntries - this.windowSize
            ));
            if (start !== this.renderStart) {
                this.renderWindow(start);
            }
        }
    }
    
    /**
     * 스크롤 이벤트 처리 (최적화됨)
     */
    handleScroll() {
        const scrollDateIndicator = document.getElementById('scroll-date-indicator');
        const currentScrollDate = document.getElementById('current-scroll-date');
        
        if (!scrollDateIndicator || !currentScrollDate || this.dateElements.length === 0) {
            return;
        }
        
        // 현재 화면에 보이는 날짜 찾기
        const containerRect = this.container.getBoundingClientRect();
        const containerTop = containerRect.top;
        
        let currentDate = null;
        
        // 날짜 요소들을 순회하며 현재 화면에 보이는 것 찾기
        for (let i = 0; i < this.dateElements.length; i++) {
            const dateElement = this.dateElements[i];
            const elementRect = dateElement.element.getBoundingClientRect();
            
            // 요소가 컨테이너 상단보다 위에 있으면 이 날짜를 현재 날짜로 설정
            if (elementRect.top <= containerTop + 100) { // 100px 여유분
                currentDate = dateElement.date;
            } else {
                break; // 더 이상 검사할 필요 없음
            }
        }
        
        if (currentDate) {
            currentScrollDate.textContent = currentDate;
            
            // 나타나기 애니메이션
            scrollDateIndicator.classList.remove('scroll-date-hide');
            scrollDateIndicator.classList.add('scroll-date-show');
            
            // 3초 후 숨기기 애니메이션
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                scrollDateIndicator.classList.remove('scroll-date-show');
                scrollDateIndicator.classList.add('scroll-date-hide');
            }, 3000);
        }
    }
}

// 전역으로 클래스 내보내기
window.ChatRenderer = ChatRenderer;

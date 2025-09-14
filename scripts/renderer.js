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
        
        
        this.setupScrollDateIndicator();
    }

    /**
     * 채팅 데이터 렌더링
     * @param {Object} chatData - 파싱된 채팅 데이터
     * @param {boolean} isInitial - 초기 렌더링인지 여부
     */
    render(chatData, isInitial = true) {
        this.chatData = chatData;
        this.container.innerHTML = '';
        this.dateElements = []; // 날짜 요소 배열 초기화
        
        if (isInitial) {
            this.determineCurrentUser(chatData);
        }
        this.setupUserButtons(chatData);
        
        // 모든 메시지를 한번에 렌더링
        chatData.messages.forEach((message, index) => {
            if (message.type === 'date') {
                this.renderDateSeparator(message);
            } else if (message.type === 'message') {
                this.renderMessage(message, index, chatData.messages);
            }
        });
        
        this.finishRendering(isInitial);
    }
    
    
    /**
     * 렌더링 완료 후 처리
     */
    finishRendering(isInitial) {
        // 스크롤을 맨 아래로 (DOM 렌더링 완료 후)
        if (isInitial) {
            // 초기 렌더링 시 로딩 인디케이터와 함께 스크롤
            setTimeout(() => {
                this.scrollToBottomWithLoading();
            }, 100);
        } else {
            // 사용자 변경 시에는 바로 스크롤
            setTimeout(() => {
                this.scrollToBottom();
            }, 100);
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
        const messages = chatData.messages.filter(msg => msg.type === 'message');
        const senderCount = {};
        
        messages.forEach(msg => {
            senderCount[msg.sender] = (senderCount[msg.sender] || 0) + 1;
        });
        
        // 사용자 목록 저장 (메시지 개수 순)
        this.users = Object.keys(senderCount).map(user => ({
            name: user,
            messageCount: senderCount[user]
        })).sort((a, b) => b.messageCount - a.messageCount);
        
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
            this.currentUser = this.users[0].name;
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

                    // 약간의 지연 후 렌더링 (자연스러운 로딩 경험)
                    setTimeout(() => {
                        this.render(this.chatData, false); // 재렌더링 시에는 isInitial = false
                        this.showUserSwitchingLoading(false);
                    }, 100);
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
    renderDateSeparator(message) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'flex justify-center my-4';
        dateDiv.setAttribute('data-date', message.date); // 날짜 데이터 속성 추가
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
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
        
        // 연속 메시지 체크
        const isFirstInGroup = !prevMessage || 
                               prevMessage.type !== 'message' || 
                               prevMessage.sender !== message.sender;
        const isLastInGroup = !nextMessage || 
                              nextMessage.type !== 'message' || 
                              nextMessage.sender !== message.sender;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `flex mb-2 ${isMyMessage ? 'justify-end' : 'justify-start'}`;
        
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
            <div class="flex items-end max-w-[70%] chat-message-container">
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
            <div class="flex items-start max-w-[70%] chat-message-container">
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
        
        // 스크롤을 부드럽게 맨 아래로
        this.container.scrollTo({
            top: this.container.scrollHeight,
            behavior: 'smooth'
        });
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
        // 스크롤 이벤트 쓰로틀링 (대용량 데이터 최적화)
        let scrollTimeout;
        this.container.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            
            scrollTimeout = setTimeout(() => {
                this.handleScroll();
                scrollTimeout = null;
            }, 50);
        });
        
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
    
    /**
     * 스크롤 이벤트 처리 (최적화됨)
     */
    handleScroll() {
        // 대용량 데이터일 때 일부 기능 제한
        if (this.isLargeDataset && this.dateElements.length > 100) {
            // 날짜 표시 기능 간소화
            this.handleScrollLightweight();
            return;
        }
        
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
    
    /**
     * 경량화된 스크롤 처리 (대용량 데이터용)
     */
    handleScrollLightweight() {
        // 최소한의 날짜 표시만 처리
        const scrollDateIndicator = document.getElementById('scroll-date-indicator');
        const currentScrollDate = document.getElementById('current-scroll-date');
        
        if (!scrollDateIndicator || !currentScrollDate) {
            return;
        }
        
        // 스크롤 위치 기반으로 대략적인 날짜 추정
        const scrollPercentage = this.container.scrollTop / (this.container.scrollHeight - this.container.clientHeight);
        const dateIndex = Math.floor(scrollPercentage * this.dateElements.length);
        
        if (dateIndex < this.dateElements.length && this.dateElements[dateIndex]) {
            currentScrollDate.textContent = this.dateElements[dateIndex].date;
            scrollDateIndicator.classList.remove('scroll-date-hide');
            scrollDateIndicator.classList.add('scroll-date-show');
            
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                scrollDateIndicator.classList.remove('scroll-date-show');
                scrollDateIndicator.classList.add('scroll-date-hide');
            }, 2000); // 대용량에서는 더 빨리 숨김
        }
    }
    
}

// 전역으로 클래스 내보내기
window.ChatRenderer = ChatRenderer;
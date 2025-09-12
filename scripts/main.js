/**
 * 메인 애플리케이션 로직
 * 파일 업로드, 파싱, 렌더링 등의 전체 플로우 관리
 */

class KakaoTalkViewer {
    constructor() {
        this.parser = new KakaoTalkParser();
        this.renderer = new ChatRenderer('chat-messages');
        this.currentChatData = null;
        
        this.initEventListeners();
    }
    
    /**
     * 이벤트 리스너 초기화
     */
    initEventListeners() {
        // 파일 입력
        const fileInput = document.getElementById('file-input');
        const uploadBtn = document.getElementById('upload-btn');
        const uploadArea = document.getElementById('upload-area');
        
        // 파일 선택 버튼
        uploadBtn.addEventListener('click', () => fileInput.click());
        
        // 파일 입력 변경
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // 드래그 앤 드롭
        uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        
        // 검색 기능
        this.initSearchListeners();
        
        // 달력 기능
        this.initCalendarListeners();
        this.availableDates = new Set(); // 채팅 데이터에 있는 날짜들
    }
    
    /**
     * 드래그 오버 핸들링
     * @param {Event} e - 드래그 이벤트
     */
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        document.getElementById('upload-area').classList.add('drag-over');
    }
    
    /**
     * 드래그 리브 핸들링
     * @param {Event} e - 드래그 이벤트
     */
    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('upload-area').classList.remove('drag-over');
    }
    
    /**
     * 파일 드롭 핸들링
     * @param {Event} e - 드롭 이벤트
     */
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('upload-area').classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }
    
    /**
     * 파일 선택 핸들링
     * @param {Event} e - 파일 입력 이벤트
     */
    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }
    
    /**
     * 파일 처리
     * @param {File} file - 선택된 파일
     */
    async processFile(file) {
        // 파일 검증
        if (!this.validateFile(file)) {
            return;
        }
        
        try {
            this.showLoading(true);
            this.hideError();
            
            // 파일 읽기
            const content = await this.readFile(file);
            
            // 파싱
            this.currentChatData = this.parser.parse(content);
            
            // 유효성 검증
            if (!this.validateChatData(this.currentChatData)) {
                this.showError('올바른 카카오톡 채팅 내보내기 파일이 아닙니다.');
                return;
            }
            
            // UI 업데이트
            this.updateChatInfo(this.currentChatData);
            this.extractAvailableDates(this.currentChatData); // 사용 가능한 날짜 추출
            this.renderer.render(this.currentChatData);
            this.showChatContainer();
            
        } catch (error) {
            console.error('파일 처리 오류:', error);
            this.showError('파일을 처리하는 중 오류가 발생했습니다: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    /**
     * 파일 유효성 검증
     * @param {File} file - 검증할 파일
     * @returns {boolean} 유효성 여부
     */
    validateFile(file) {
        // 파일 타입 검증
        if (!file.type.includes('text') && !file.name.endsWith('.txt')) {
            this.showError('텍스트 파일(.txt)만 업로드할 수 있습니다.');
            return false;
        }
        
        // 파일 크기 검증 (10MB 제한)
        if (file.size > 10 * 1024 * 1024) {
            this.showError('파일 크기가 너무 큽니다. 10MB 이하의 파일을 선택해주세요.');
            return false;
        }
        
        return true;
    }
    
    /**
     * 파일 읽기
     * @param {File} file - 읽을 파일
     * @returns {Promise<string>} 파일 내용
     */
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
            
            // UTF-8로 읽기 시도, 실패하면 다른 인코딩으로 재시도
            reader.readAsText(file, 'utf-8');
        });
    }
    
    /**
     * 채팅 데이터 유효성 검증
     * @param {Object} chatData - 검증할 채팅 데이터
     * @returns {boolean} 유효성 여부
     */
    validateChatData(chatData) {
        return chatData && 
               chatData.title && 
               chatData.messages && 
               chatData.messages.length > 0;
    }
    
    /**
     * 채팅방 정보 업데이트
     * @param {Object} chatData - 채팅 데이터
     */
    updateChatInfo(chatData) {
        const stats = this.parser.getStats();
        
        document.getElementById('chat-title').textContent = chatData.title;
        document.getElementById('save-date').textContent = chatData.saveDate;
        document.getElementById('message-count').textContent = stats.totalMessages.toLocaleString();
        
        // 채팅방 헤더는 renderer에서 업데이트됨
        
        document.getElementById('chat-info').classList.remove('hidden');
    }
    
    /**
     * 채팅 컨테이너 표시
     */
    showChatContainer() {
        document.getElementById('chat-container').classList.remove('hidden');
        document.getElementById('welcome-screen').classList.add('hidden');
        
        // 채팅방이 표시된 후 스크롤을 맨 아래로 (추가 안전장치)
        setTimeout(() => {
            if (this.renderer) {
                this.renderer.scrollToBottom();
            }
        }, 200);
    }
    
    /**
     * 로딩 상태 표시
     * @param {boolean} show - 표시 여부
     */
    showLoading(show) {
        const loading = document.getElementById('loading');
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }
    
    /**
     * 에러 메시지 표시
     * @param {string} message - 에러 메시지
     */
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
    
    /**
     * 에러 메시지 숨기기
     */
    hideError() {
        document.getElementById('error-message').classList.add('hidden');
    }
    
    /**
     * 검색 기능 이벤트 리스너 초기화
     */
    initSearchListeners() {
        const searchInput = document.getElementById('search-input');
        const integratedSearch = document.getElementById('integrated-search');
        
        // 검색 입력
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch(e.target.value);
                }
            });
        }
        
        // 통합검색 버튼
        if (integratedSearch) {
            integratedSearch.addEventListener('click', () => {
                const query = searchInput.value;
                if (query) {
                    this.handleSearch(query);
                }
            });
        }
    }
    
    /**
     * 검색 처리
     * @param {string} query - 검색어
     */
    handleSearch(query) {
        if (!query.trim() || !this.currentChatData) {
            this.clearSearchResults();
            return;
        }
        
        // 로딩 표시
        this.showSearchLoading();
        
        // 약간의 지연을 두어 로딩 상태를 보여줌
        setTimeout(() => {
            const results = this.searchMessages(query);
            this.hideSearchLoading();
            this.displaySearchResults(results, query);
        }, 100);
    }
    
    /**
     * 메시지 검색
     * @param {string} query - 검색어
     * @returns {Array} 검색 결과
     */
    searchMessages(query) {
        if (!this.currentChatData || !this.currentChatData.messages) {
            return [];
        }
        
        const results = [];
        const lowerQuery = query.toLowerCase();
        let currentDate = '';
        
        this.currentChatData.messages.forEach((message, index) => {
            // 날짜 메시지를 만나면 현재 날짜 업데이트
            if (message.type === 'date') {
                currentDate = message.date;
            } else if (message.type === 'message' && 
                       message.content && 
                       message.content.toLowerCase().includes(lowerQuery)) {
                results.push({
                    ...message,
                    index: index,
                    date: currentDate,
                    highlightedContent: this.highlightSearchTerm(message.content, query)
                });
            }
        });
        
        // 최신순으로 정렬 (인덱스가 클수록 최신)
        return results.sort((a, b) => b.index - a.index);
    }
    
    /**
     * 검색어 하이라이트
     * @param {string} content - 메시지 내용
     * @param {string} query - 검색어
     * @returns {string} 하이라이트된 내용
     */
    highlightSearchTerm(content, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return content.replace(regex, '<mark class="bg-yellow-300">$1</mark>');
    }
    
    /**
     * 날짜 형식 변환
     * @param {string} dateString - 원본 날짜 문자열 (예: "2025년 5월 20일 화요일")
     * @returns {string} 변환된 날짜 (예: "2025.05.20 화")
     */
    formatSearchDate(dateString) {
        if (!dateString) return '';
        
        // "2025년 5월 20일 화요일" 형식에서 정보 추출
        const match = dateString.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(.+)/);
        if (!match) return dateString;
        
        const [, year, month, day, dayOfWeek] = match;
        
        // 요일을 한 글자로 변환
        const dayMap = {
            '월요일': '월',
            '화요일': '화', 
            '수요일': '수',
            '목요일': '목',
            '금요일': '금',
            '토요일': '토',
            '일요일': '일'
        };
        
        const shortDay = dayMap[dayOfWeek] || dayOfWeek;
        
        // 월, 일을 2자리로 패딩
        const paddedMonth = month.padStart(2, '0');
        const paddedDay = day.padStart(2, '0');
        
        return `${year}.${paddedMonth}.${paddedDay} ${shortDay}`;
    }
    
    /**
     * 검색 결과 표시
     * @param {Array} results - 검색 결과
     * @param {string} query - 검색어
     */
    displaySearchResults(results, query) {
        const resultsContainer = document.getElementById('search-results');
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center text-gray-500 text-sm py-8">
                    "${query}"에 대한 검색 결과가 없습니다
                </div>
            `;
            return;
        }
        
        const resultsHTML = `
            <div class="mb-4">
                <div class="text-sm text-gray-600 mb-3">검색 결과 ${results.length}개 (최신순)</div>
            </div>
            <div class="space-y-3">
                ${results.map((result, index) => `
                    <div class="p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors" 
                         onclick="window.scrollToMessage(${result.index})">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center">
                                <span class="text-sm font-medium text-gray-700">${result.sender}</span>
                                <span class="text-xs text-gray-500 ml-2">${result.time}</span>
                            </div>
                            <div class="text-xs text-gray-400">${this.formatSearchDate(result.date)}</div>
                        </div>
                        <div class="text-sm text-gray-800 leading-relaxed">
                            ${result.highlightedContent}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        resultsContainer.innerHTML = resultsHTML;
    }
    
    /**
     * 검색 결과 지우기
     */
    clearSearchResults() {
        this.hideSearchLoading();
        const resultsContainer = document.getElementById('search-results');
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = `
            <div class="text-center text-gray-500 text-sm py-8">
                검색어를 입력해주세요
            </div>
        `;
    }
    
    /**
     * 검색 로딩 표시
     */
    showSearchLoading() {
        const searchLoading = document.getElementById('search-loading');
        const searchResults = document.getElementById('search-results');
        const calendarPopup = document.getElementById('calendar-popup');
        
        // 달력이 열려있으면 먼저 닫기
        if (!calendarPopup.classList.contains('hidden')) {
            this.hideCalendar();
        }
        
        searchResults.classList.add('hidden');
        searchLoading.classList.remove('hidden');
    }
    
    /**
     * 검색 로딩 숨기기
     */
    hideSearchLoading() {
        const searchLoading = document.getElementById('search-loading');
        const searchResults = document.getElementById('search-results');
        
        searchLoading.classList.add('hidden');
        searchResults.classList.remove('hidden');
    }
    
    /**
     * 달력 기능 이벤트 리스너 초기화
     */
    initCalendarListeners() {
        const dateFilterBtn = document.getElementById('date-filter-btn');
        const calendarPopup = document.getElementById('calendar-popup');
        const closeCalendar = document.getElementById('close-calendar');
        const prevMonth = document.getElementById('prev-month');
        const nextMonth = document.getElementById('next-month');
        
        // 달력 버튼 클릭
        if (dateFilterBtn) {
            dateFilterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCalendar();
            });
        }
        
        // 달력 닫기 버튼
        if (closeCalendar) {
            closeCalendar.addEventListener('click', () => this.hideCalendar());
        }
        
        // 월 이동 버튼
        if (prevMonth) {
            prevMonth.addEventListener('click', () => this.changeMonth(-1));
        }
        if (nextMonth) {
            nextMonth.addEventListener('click', () => this.changeMonth(1));
        }
        
        // 달력이 사이드바 안에 있으므로 외부 클릭 감지 불필요
        
        this.currentCalendarDate = new Date();
    }
    
    /**
     * 달력 토글
     */
    toggleCalendar() {
        const calendarPopup = document.getElementById('calendar-popup');
        
        if (calendarPopup.classList.contains('hidden')) {
            this.showCalendar();
        } else {
            this.hideCalendar();
        }
    }
    
    /**
     * 달력 표시
     */
    showCalendar() {
        const calendarPopup = document.getElementById('calendar-popup');
        const searchResults = document.getElementById('search-results');
        const searchLoading = document.getElementById('search-loading');
        
        // 검색 관련 요소 숨기고 달력 표시
        searchResults.classList.add('hidden');
        searchLoading.classList.add('hidden');
        calendarPopup.classList.remove('hidden');
        this.renderCalendar();
    }
    
    /**
     * 달력 숨기기
     */
    hideCalendar() {
        const calendarPopup = document.getElementById('calendar-popup');
        const searchResults = document.getElementById('search-results');
        
        // 달력 숨기고 검색 결과 표시
        calendarPopup.classList.add('hidden');
        searchResults.classList.remove('hidden');
    }
    
    /**
     * 월 변경
     * @param {number} direction - 방향 (-1: 이전달, 1: 다음달)
     */
    changeMonth(direction) {
        this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + direction);
        this.renderCalendar();
    }
    
    /**
     * 달력 렌더링
     */
    renderCalendar() {
        const monthYearElement = document.getElementById('calendar-month-year');
        const calendarGrid = document.getElementById('calendar-grid');
        
        const year = this.currentCalendarDate.getFullYear();
        const month = this.currentCalendarDate.getMonth();
        
        // 월/년도 표시
        monthYearElement.textContent = `${year}년 ${month + 1}월`;
        
        // 달력 그리드 생성
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());
        
        calendarGrid.innerHTML = '';
        
        for (let i = 0; i < 42; i++) { // 6주 * 7일
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            const dayElement = this.createDayElement(currentDate, month);
            calendarGrid.appendChild(dayElement);
        }
    }
    
    /**
     * 날짜 요소 생성
     * @param {Date} date - 날짜
     * @param {number} currentMonth - 현재 표시 중인 월
     * @returns {HTMLElement} 날짜 요소
     */
    createDayElement(date, currentMonth) {
        const dayElement = document.createElement('div');
        const day = date.getDate();
        const isCurrentMonth = date.getMonth() === currentMonth;
        const dateString = this.formatDateForComparison(date);
        const hasData = this.availableDates.has(dateString);
        
        dayElement.textContent = day;
        dayElement.className = 'text-center py-2 text-sm cursor-pointer rounded';
        
        if (!isCurrentMonth) {
            // 다른 달의 날짜
            dayElement.className += ' text-gray-300';
        } else if (hasData) {
            // 채팅 데이터가 있는 날짜
            dayElement.className += ' text-black font-bold hover:bg-gray-100';
            dayElement.addEventListener('click', () => this.scrollToDate(dateString));
        } else {
            // 채팅 데이터가 없는 날짜
            dayElement.className += ' text-gray-400';
        }
        
        return dayElement;
    }
    
    /**
     * 날짜를 비교용 문자열로 변환
     * @param {Date} date - 날짜 객체
     * @returns {string} 비교용 날짜 문자열 (예: "2025-05-20")
     */
    formatDateForComparison(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    
    /**
     * 채팅 데이터에서 사용 가능한 날짜 추출
     * @param {Object} chatData - 채팅 데이터
     */
    extractAvailableDates(chatData) {
        this.availableDates.clear();
        
        if (!chatData || !chatData.messages) return;
        
        chatData.messages.forEach(message => {
            if (message.type === 'date' && message.date) {
                // "2025년 5월 20일 화요일" 형식을 "2025-05-20" 형식으로 변환
                const match = message.date.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
                if (match) {
                    const [, year, month, day] = match;
                    const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    this.availableDates.add(dateString);
                }
            }
        });
    }
    
    /**
     * 특정 날짜로 스크롤
     * @param {string} dateString - 날짜 문자열 (예: "2025-05-20")
     */
    scrollToDate(dateString) {
        if (!this.currentChatData || !this.currentChatData.messages) return;
        
        // 날짜 문자열을 "2025년 5월 20일" 형식으로 변환
        const [year, month, day] = dateString.split('-');
        const targetDate = `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
        
        // 해당 날짜의 메시지 찾기
        for (let i = 0; i < this.currentChatData.messages.length; i++) {
            const message = this.currentChatData.messages[i];
            if (message.type === 'date' && message.date.includes(targetDate)) {
                // 해당 날짜로 스크롤
                const chatMessages = document.getElementById('chat-messages');
                const messageElements = chatMessages.children;
                
                if (i < messageElements.length) {
                    messageElements[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
                    
                    // 날짜 구분선 하이라이트 효과
                    messageElements[i].classList.add('animate-pulse', 'bg-yellow-100');
                    setTimeout(() => {
                        messageElements[i].classList.remove('animate-pulse', 'bg-yellow-100');
                    }, 2000);
                }
                
                // 달력 닫기
                this.hideCalendar();
                break;
            }
        }
    }
}

// 전역 함수 - 메시지로 스크롤
window.scrollToMessage = function(messageIndex) {
    const chatMessages = document.getElementById('chat-messages');
    const messageElements = chatMessages.children;
    
    if (messageIndex < messageElements.length) {
        const targetElement = messageElements[messageIndex];
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 잠시 하이라이트 효과
        targetElement.classList.add('animate-pulse', 'bg-yellow-100');
        setTimeout(() => {
            targetElement.classList.remove('animate-pulse', 'bg-yellow-100');
        }, 2000);
    }
};

// 애플리케이션 초기화
document.addEventListener('DOMContentLoaded', () => {
    new KakaoTalkViewer();
});
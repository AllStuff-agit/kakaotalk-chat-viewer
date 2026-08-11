/**
 * 메인 애플리케이션 로직
 * 파일 업로드, 파싱, 렌더링 등의 전체 플로우 관리
 */

class KakaoTalkViewer {
    constructor() {
        this.renderer = new ChatRenderer('chat-messages');
        this.searchRenderer = new SearchResultsRenderer(
            'search-results',
            'search-scroll-container',
            index => this.renderer.scrollToIndex(index)
        );
        this.currentChatData = null;
        this.store = null;
        this.searchGeneration = 0;
        this.isProcessingFile = false; // 파일 처리 중복 방지 플래그

        // 데스크톱 전용 체크
        if (!this.isDesktop()) {
            this.showDesktopOnlyNotice();
            return;
        }

        this.initEventListeners();
    }

    /**
     * 데스크톱 환경인지 체크
     * @returns {boolean} 데스크톱이면 true
     */
    isDesktop() {
        // 화면 크기 체크 (1024px 이상)
        const isWideScreen = window.innerWidth >= 1024;

        // 모바일/태블릿 User Agent 체크
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobileDevice = /mobile|tablet|android|ipad|iphone|ipod|blackberry|windows phone/i.test(userAgent);

        // 데스크톱 조건: 넓은 화면 + 모바일 기기가 아님
        return isWideScreen && !isMobileDevice;
    }

    /**
     * 데스크톱 전용 안내 화면 표시
     */
    showDesktopOnlyNotice() {
        const noticeElement = document.getElementById('desktop-only-notice');
        const mainAppElement = document.getElementById('main-app');

        if (noticeElement && mainAppElement) {
            noticeElement.classList.remove('hidden');
            mainAppElement.classList.add('hidden');
        }
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
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }
        
        // 파일 입력 변경
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileSelect(e);
            });
        }
        
        // 드래그 앤 드롭
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        }
        
        // 검색 기능
        this.initSearchListeners();
        
        // 달력 기능
        this.initCalendarListeners();
        this.availableDates = new Set(); // 채팅 데이터에 있는 날짜들
        
        // 폰트 크기 조절 기능
        this.initFontSizeControls();
        this.currentFontSize = 14; // 기본 폰트 크기
        
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
            // 파일 입력 필드 초기화 (같은 파일을 다시 선택할 수 있도록)
            e.target.value = '';
        }
    }
    
    /**
     * 파일 처리
     * @param {File} file - 선택된 파일
     */
    async processFile(file) {
        // 중복 처리 방지
        if (this.isProcessingFile) {
            return;
        }

        // 파일 검증
        if (!this.validateFile(file)) {
            this.isProcessingFile = false;
            return;
        }

        this.isProcessingFile = true;
        let openedStore = false;

        try {
            this.showLoading(true);
            this.hideError();

            if (!this.supportsLargeFiles()) {
                throw new Error('최신 Chrome 또는 Edge 브라우저에서 열어주세요.');
            }

            this.store?.close();
            this.store = new ChatStore();
            openedStore = true;
            this.currentChatData = null;
            this.searchRenderer.clear();
            this.renderer.chatData = null;
            document.getElementById('chat-container').classList.add('hidden');
            document.getElementById('welcome-screen').classList.remove('hidden');
            navigator.storage?.persist?.().catch(() => {});
            this.currentChatData = await this.store.importFile(
                file,
                progress => this.updateImportProgress(progress)
            );
            
            // 유효성 검증
            if (!this.validateChatData(this.currentChatData)) {
                throw new Error('올바른 카카오톡 채팅 내보내기 파일이 아닙니다.');
            }
            
            // UI 업데이트
            this.updateChatInfo(this.currentChatData);
            this.extractAvailableDates(this.currentChatData); // 사용 가능한 날짜 추출
            await this.renderer.render(this.currentChatData, this.store);
            this.showChatContainer();
            
        } catch (error) {
            console.error('파일 처리 오류:', error);
            if (openedStore) {
                this.store?.close();
                this.store = null;
                this.currentChatData = null;
            }
            if (error.name === 'QuotaExceededError') {
                this.showError('브라우저 저장 공간이 부족합니다. 기기의 여유 공간을 확보한 뒤 다시 시도해주세요.');
            } else {
                this.showError('파일을 처리하는 중 오류가 발생했습니다: ' + error.message);
            }
        } finally {
            this.showLoading(false);
            this.isProcessingFile = false; // 플래그 초기화
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
        
        return true;
    }

    supportsLargeFiles() {
        return typeof Worker !== 'undefined' &&
            typeof indexedDB !== 'undefined' &&
            typeof File !== 'undefined' &&
            typeof File.prototype.stream === 'function' &&
            typeof TextDecoder !== 'undefined';
    }
    
    /**
     * 채팅 데이터 유효성 검증
     * @param {Object} chatData - 검증할 채팅 데이터
     * @returns {boolean} 유효성 여부
     */
    validateChatData(chatData) {
        return chatData && 
               chatData.title && 
               chatData.totalEntries > 0 &&
               chatData.totalMessages > 0;
    }
    
    /**
     * 채팅방 정보 업데이트
     * @param {Object} chatData - 채팅 데이터
     */
    updateChatInfo(chatData) {
        const totalMessages = chatData.totalMessages;

        // PC용 채팅방 정보 업데이트
        document.getElementById('chat-title').textContent = chatData.title;
        document.getElementById('save-date').textContent = chatData.saveDate;
        document.getElementById('message-count').textContent = totalMessages.toLocaleString();
        document.getElementById('chat-info').classList.remove('hidden');

        // 모바일용 채팅방 정보 업데이트 (요소가 존재할 경우에만)
        const mobileChatTitle = document.getElementById('mobile-chat-title');
        if (mobileChatTitle) {
            mobileChatTitle.textContent = chatData.title;
            document.getElementById('mobile-save-date').textContent = chatData.saveDate;
            document.getElementById('mobile-message-count').textContent = totalMessages.toLocaleString();
            document.getElementById('mobile-chat-info').classList.remove('hidden');
        }
    }
    
    /**
     * 채팅 컨테이너 표시
     */
    showChatContainer() {
        document.getElementById('chat-container').classList.remove('hidden');
        document.getElementById('welcome-screen').classList.add('hidden');
    }
    
    /**
     * 로딩 상태 표시
     * @param {boolean} show - 표시 여부
     */
    showLoading(show) {
        const loading = document.getElementById('loading');
        const mobileLoading = document.getElementById('mobile-loading');
        const mobileInfoLoading = document.getElementById('mobile-info-loading');

        if (show) {
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = '분석 준비 중...';
            if (loading) loading.classList.remove('hidden');
            if (mobileLoading) mobileLoading.classList.remove('hidden');
            if (mobileInfoLoading) mobileInfoLoading.classList.remove('hidden');
        } else {
            if (loading) loading.classList.add('hidden');
            if (mobileLoading) mobileLoading.classList.add('hidden');
            if (mobileInfoLoading) mobileInfoLoading.classList.add('hidden');
        }
    }

    updateImportProgress({ loaded, total }) {
        const loadingText = document.getElementById('loading-text');
        if (!loadingText || !total) return;
        const percentage = Math.min(100, Math.round(loaded / total * 100));
        loadingText.textContent = `분석 및 저장 중... ${percentage}%`;
    }
    
    /**
     * 에러 메시지 표시
     * @param {string} message - 에러 메시지
     */
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        const mobileErrorDiv = document.getElementById('mobile-error-message');
        const mobileInfoErrorDiv = document.getElementById('mobile-info-error-message');

        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
        }
        if (mobileErrorDiv) {
            mobileErrorDiv.textContent = message;
            mobileErrorDiv.classList.remove('hidden');
        }
        if (mobileInfoErrorDiv) {
            mobileInfoErrorDiv.textContent = message;
            mobileInfoErrorDiv.classList.remove('hidden');
        }
    }
    
    /**
     * 에러 메시지 숨기기
     */
    hideError() {
        const errorDiv = document.getElementById('error-message');
        const mobileErrorDiv = document.getElementById('mobile-error-message');
        const mobileInfoErrorDiv = document.getElementById('mobile-info-error-message');

        if (errorDiv) errorDiv.classList.add('hidden');
        if (mobileErrorDiv) mobileErrorDiv.classList.add('hidden');
        if (mobileInfoErrorDiv) mobileInfoErrorDiv.classList.add('hidden');
    }
    
    /**
     * 검색 기능 이벤트 리스너 초기화
     */
    initSearchListeners() {
        const searchInput = document.getElementById('search-input');
        const integratedSearch = document.getElementById('integrated-search');
        
        // 검색 입력 - Enter 키 입력 시 검색
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch(e.target.value);
                }
            });
        }
        
        // 통합검색 버튼 - 클릭 시 검색
        if (integratedSearch) {
            integratedSearch.addEventListener('click', () => {
                const query = searchInput.value;
                this.handleSearch(query);
            });
        }
    }
    
    /**
     * 검색 처리
     * @param {string} query - 검색어
     */
    async handleSearch(query) {
        if (!query.trim() || !this.currentChatData) {
            this.clearSearchResults();
            return;
        }

        const generation = ++this.searchGeneration;
        // 로딩 표시
        this.showSearchLoading();

        try {
            const { total } = await this.searchMessages(query);
            if (generation !== this.searchGeneration) return;
            await this.searchRenderer.render(
                total,
                query,
                this.store,
                date => this.formatSearchDate(date)
            );
            if (generation !== this.searchGeneration) return;
            this.hideSearchLoading();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.hideSearchLoading();
                this.showError('검색 중 오류가 발생했습니다: ' + error.message);
            }
        }
    }
    
    /**
     * 메시지 검색
     * @param {string} query - 검색어
     * @returns {{total: number}} 검색 결과 수
     */
    async searchMessages(query) {
        if (!this.currentChatData || !this.store) return { total: 0 };
        return this.store.search(query);
    }
    
    /**
     * 검색어 하이라이트
     * @param {string} content - 메시지 내용
     * @param {string} query - 검색어
     * @returns {string} 하이라이트된 내용
     */
    highlightSearchTerm(content, query) {
        const escapedContent = this.escapeHtml(content);
        const escapedQuery = this.escapeHtml(query);
        const regexQuery = escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escapedContent.replace(
            new RegExp(`(${regexQuery})`, 'gi'),
            '<mark class="bg-yellow-300">$1</mark>'
        );
    }

    escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
     * 검색 결과 지우기
     */
    clearSearchResults() {
        this.searchGeneration++;
        this.hideSearchLoading();
        this.searchRenderer.clear();
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
        
        // 달력을 열 때마다 오늘 날짜로 초기화
        this.currentCalendarDate = new Date();
        
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
        this.dateIndexes = new Map();

        if (!chatData?.dates) return;

        chatData.dates.forEach(({ date, index }) => {
            const match = date.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
            if (!match) return;
            const [, year, month, day] = match;
            const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            this.availableDates.add(dateString);
            if (!this.dateIndexes.has(dateString)) this.dateIndexes.set(dateString, index);
        });
    }
    
    /**
     * 특정 날짜로 스크롤
     * @param {string} dateString - 날짜 문자열 (예: "2025-05-20")
     */
    scrollToDate(dateString) {
        const index = this.dateIndexes?.get(dateString);
        if (index !== undefined) this.renderer.scrollToIndex(index);
    }
    
    /**
     * 폰트 크기 조절 기능 초기화
     */
    initFontSizeControls() {
        const decreaseBtn = document.getElementById('font-size-decrease');
        const increaseBtn = document.getElementById('font-size-increase');
        const indicator = document.getElementById('font-size-indicator');
        
        if (decreaseBtn) {
            decreaseBtn.addEventListener('click', () => this.decreaseFontSize());
        }
        
        if (increaseBtn) {
            increaseBtn.addEventListener('click', () => this.increaseFontSize());
        }
        
        // 로컬 스토리지에서 저장된 폰트 크기 불러오기
        const savedFontSize = localStorage.getItem('kakao-chat-font-size');
        if (savedFontSize) {
            this.currentFontSize = parseInt(savedFontSize);
            this.updateFontSize();
        }
    }
    
    /**
     * 폰트 크기 줄이기
     */
    decreaseFontSize() {
        const fontSizes = [10, 12, 14, 16, 18, 20, 22, 24];
        const currentIndex = fontSizes.indexOf(this.currentFontSize);
        
        if (currentIndex > 0) {
            this.showFontSizeLoading();
            this.currentFontSize = fontSizes[currentIndex - 1];
            
            // 약간의 지연 후 적용 (실제 처리 시뮬레이션)
            setTimeout(() => {
                this.updateFontSize();
                this.hideFontSizeLoading();
            }, 300);
        }
    }
    
    /**
     * 폰트 크기 키우기
     */
    increaseFontSize() {
        const fontSizes = [10, 12, 14, 16, 18, 20, 22, 24];
        const currentIndex = fontSizes.indexOf(this.currentFontSize);
        
        if (currentIndex < fontSizes.length - 1) {
            this.showFontSizeLoading();
            this.currentFontSize = fontSizes[currentIndex + 1];
            
            // 약간의 지연 후 적용 (실제 처리 시뮬레이션)
            setTimeout(() => {
                this.updateFontSize();
                this.hideFontSizeLoading();
            }, 300);
        }
    }
    
    /**
     * 폰트 크기 로딩 표시
     */
    showFontSizeLoading() {
        const indicator = document.getElementById('font-size-indicator');
        const loading = document.getElementById('font-size-loading');
        const decreaseBtn = document.getElementById('font-size-decrease');
        const increaseBtn = document.getElementById('font-size-increase');
        
        if (indicator && loading) {
            indicator.style.opacity = '0';
            loading.classList.remove('hidden');
        }
        
        // 버튼들 비활성화
        if (decreaseBtn) {
            decreaseBtn.disabled = true;
            decreaseBtn.style.opacity = '0.5';
            decreaseBtn.style.cursor = 'not-allowed';
        }
        
        if (increaseBtn) {
            increaseBtn.disabled = true;
            increaseBtn.style.opacity = '0.5';
            increaseBtn.style.cursor = 'not-allowed';
        }
    }
    
    /**
     * 폰트 크기 로딩 숨기기
     */
    hideFontSizeLoading() {
        const indicator = document.getElementById('font-size-indicator');
        const loading = document.getElementById('font-size-loading');
        const decreaseBtn = document.getElementById('font-size-decrease');
        const increaseBtn = document.getElementById('font-size-increase');
        
        if (indicator && loading) {
            loading.classList.add('hidden');
            indicator.style.opacity = '1';
            
            // 완료 애니메이션
            indicator.style.transform = 'scale(1.1)';
            indicator.style.color = '#10B981'; // 초록색으로 잠깐 변경
            
            setTimeout(() => {
                indicator.style.transform = 'scale(1)';
                indicator.style.color = '#6B7280'; // 원래 회색으로
            }, 400);
        }
        
        // 버튼들 다시 활성화
        if (decreaseBtn) {
            decreaseBtn.disabled = false;
        }
        
        if (increaseBtn) {
            increaseBtn.disabled = false;
        }
    }
    
    /**
     * 폰트 크기 업데이트 적용
     */
    updateFontSize() {
        const chatMessages = document.getElementById('chat-messages');
        const indicator = document.getElementById('font-size-indicator');
        
        if (chatMessages) {
            // 기존 폰트 크기 클래스들 제거
            chatMessages.className = chatMessages.className.replace(/font-size-\d+/g, '');
            
            // 새로운 폰트 크기 클래스 추가
            chatMessages.classList.add(`font-size-${this.currentFontSize}`);
        }
        
        if (indicator) {
            // 숫자 변경 애니메이션과 함께 업데이트
            indicator.style.transition = 'all 0.15s ease-out';
            indicator.textContent = this.currentFontSize;
        }
        
        // 로컬 스토리지에 저장
        localStorage.setItem('kakao-chat-font-size', this.currentFontSize.toString());
        
        // 버튼 상태 업데이트
        this.updateButtonStates();
    }
    
    /**
     * 버튼 상태 업데이트 (최소/최대에서 비활성화)
     */
    updateButtonStates() {
        const decreaseBtn = document.getElementById('font-size-decrease');
        const increaseBtn = document.getElementById('font-size-increase');
        
        if (decreaseBtn) {
            if (this.currentFontSize <= 10) {
                decreaseBtn.style.opacity = '0.5';
                decreaseBtn.style.cursor = 'not-allowed';
            } else {
                decreaseBtn.style.opacity = '1';
                decreaseBtn.style.cursor = 'pointer';
            }
        }
        
        if (increaseBtn) {
            if (this.currentFontSize >= 24) {
                increaseBtn.style.opacity = '0.5';
                increaseBtn.style.cursor = 'not-allowed';
            } else {
                increaseBtn.style.opacity = '1';
                increaseBtn.style.cursor = 'pointer';
            }
        }
    }
}

window.scrollToMessage = messageIndex => window.chatRenderer?.scrollToIndex(messageIndex);

// KakaoTalkViewer 클래스의 확장 메서드들
KakaoTalkViewer.prototype.initMobileSearch = function() {
        const mobileSearchPanel = document.getElementById('mobile-search-panel');
        const mobileSearchClose = document.getElementById('mobile-search-close');
        const mobileSearchInput = document.getElementById('mobile-search-input');
        const mobileSearchSubmit = document.getElementById('mobile-integrated-search');
        const mobileCalendarBtn = document.getElementById('mobile-date-filter-btn');
        const mobileCalendarPopup = document.getElementById('mobile-calendar-popup');
        
        // 검색 패널 닫기
        if (mobileSearchClose && mobileSearchPanel) {
            mobileSearchClose.addEventListener('click', () => {
                mobileSearchPanel.classList.add('hidden');
                // 검색 입력 필드 초기화
                if (mobileSearchInput) {
                    mobileSearchInput.value = '';
                }
                // 검색 결과 초기화
                const mobileSearchResults = document.getElementById('mobile-search-results');
                if (mobileSearchResults) {
                    mobileSearchResults.innerHTML = '';
                }
            });
        }
        
        // 모바일 검색 실행
        if (mobileSearchSubmit && mobileSearchInput) {
            const executeSearch = () => {
                const searchTerm = mobileSearchInput.value.trim();
                if (searchTerm) {
                    this.performMobileSearch(searchTerm);
                }
            };
            
            mobileSearchSubmit.addEventListener('click', executeSearch);
            mobileSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    executeSearch();
                }
            });
        }
        
        // 모바일 달력 열기
        if (mobileCalendarBtn && mobileCalendarPopup) {
            mobileCalendarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                mobileCalendarPopup.classList.toggle('hidden');
                if (!mobileCalendarPopup.classList.contains('hidden')) {
                    this.initMobileCalendarDate();
                    this.renderMobileCalendar();
                }
            });
        }

        // 모바일 달력 외부 클릭시 닫기
        document.addEventListener('click', (e) => {
            if (mobileCalendarPopup && !mobileCalendarPopup.classList.contains('hidden')) {
                if (!mobileCalendarPopup.contains(e.target) && e.target !== mobileCalendarBtn) {
                    mobileCalendarPopup.classList.add('hidden');
                }
            }
        });

        // 모바일 달력 월 이동 버튼
        const mobilePrevMonth = document.getElementById('mobile-prev-month');
        const mobileNextMonth = document.getElementById('mobile-next-month');
        const mobileCloseCalendar = document.getElementById('mobile-close-calendar');

        if (mobilePrevMonth) {
            mobilePrevMonth.addEventListener('click', () => this.changeMobileMonth(-1));
        }
        if (mobileNextMonth) {
            mobileNextMonth.addEventListener('click', () => this.changeMobileMonth(1));
        }

        // 모바일 달력 닫기 버튼
        if (mobileCloseCalendar) {
            mobileCloseCalendar.addEventListener('click', () => {
                if (mobileCalendarPopup) {
                    mobileCalendarPopup.classList.add('hidden');
                }
            });
        }

        // 모바일 달력 현재 날짜 초기화
        this.currentMobileCalendarDate = new Date();
};

/**
 * 모바일 검색 실행
 */
KakaoTalkViewer.prototype.performMobileSearch = async function(searchTerm) {
        if (!this.currentChatData) return;
        const results = await this.searchMessages(searchTerm);
        this.displayMobileSearchResults(results, searchTerm);
};

/**
 * 모바일 검색 결과 표시
 */
KakaoTalkViewer.prototype.displayMobileSearchResults = function(results, searchTerm) {
        const resultsContainer = document.getElementById('mobile-search-results');
        if (!resultsContainer) return;
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="p-4 text-center text-gray-500">
                    <div class="text-lg mb-2">😔</div>
                    <div>검색 결과가 없습니다</div>
                    <div class="text-sm mt-1">"${searchTerm}"에 대한 결과가 없어요</div>
                </div>
            `;
            return;
        }
        
        const resultHtml = results.map(result => {
            const highlightedContent = result.highlightedContent;
            const highlightedSender = this.escapeHtml(result.sender);
            
            return `
                <div class="p-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors search-result-item"
                     data-message-index="${result.index}">
                    <div class="flex items-start space-x-3">
                        <div class="w-8 h-8 bg-gray-300 rounded-full flex-shrink-0 flex items-center justify-center">
                            <span class="text-xs text-gray-600">${result.sender.charAt(0)}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center space-x-2 mb-1">
                                <span class="font-medium text-sm text-gray-900">${highlightedSender}</span>
                                <span class="text-xs text-gray-500">${this.escapeHtml(result.time)}</span>
                            </div>
                            <div class="text-sm text-gray-700 break-words">${highlightedContent}</div>
                            <div class="text-xs text-gray-400 mt-1">${this.escapeHtml(result.date)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        resultsContainer.innerHTML = `
            <div class="p-3 bg-gray-50 border-b border-gray-200">
                <div class="text-sm text-gray-600">
                    총 <strong>${results.length}개</strong>의 결과를 찾았습니다
                </div>
            </div>
            ${resultHtml}
        `;
        
        // 검색 결과 클릭 이벤트 추가
        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const messageIndex = parseInt(item.dataset.messageIndex);
                this.scrollToMobileSearchResult(messageIndex);
                // 검색 패널 닫기
                const mobileSearchPanel = document.getElementById('mobile-search-panel');
                if (mobileSearchPanel) {
                    mobileSearchPanel.classList.add('hidden');
                }
            });
        });
};

/**
 * 모바일 검색 결과로 스크롤
 */
KakaoTalkViewer.prototype.scrollToMobileSearchResult = function(messageIndex) {
    this.renderer.scrollToIndex(messageIndex);
};

/**
 * 모바일 달력 렌더링
 */
KakaoTalkViewer.prototype.renderMobileCalendar = function() {
    if (!this.currentChatData) return;

    const monthYearElement = document.getElementById('mobile-calendar-month-year');
    const calendarDays = document.getElementById('mobile-calendar-days');

    if (!monthYearElement || !calendarDays) return;

    const year = this.currentMobileCalendarDate.getFullYear();
    const month = this.currentMobileCalendarDate.getMonth();

    // 월/년도 표시
    monthYearElement.textContent = `${year}년 ${month + 1}월`;

    // 달력 그리드 생성
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    calendarDays.innerHTML = '';

    for (let i = 0; i < 42; i++) { // 6주 * 7일
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        const dayElement = this.createMobileDayElement(currentDate, month);
        calendarDays.appendChild(dayElement);
    }
};

/**
 * 모바일 달력 날짜 요소 생성 (PC와 동일한 로직)
 */
KakaoTalkViewer.prototype.createMobileDayElement = function(date, currentMonth) {
    const dayElement = document.createElement('div');
    const day = date.getDate();
    const isCurrentMonth = date.getMonth() === currentMonth;
    const dateString = this.formatDateForComparison(date);
    const hasData = this.availableDates && this.availableDates.has(dateString);

    dayElement.textContent = day;
    dayElement.className = 'text-center py-2 text-sm cursor-pointer rounded';

    if (!isCurrentMonth) {
        // 다른 달의 날짜
        dayElement.className += ' text-gray-300';
    } else if (hasData) {
        // 채팅 데이터가 있는 날짜 (PC와 동일한 스타일)
        dayElement.className += ' text-black font-bold hover:bg-gray-100';
        dayElement.addEventListener('click', () => {
            this.scrollToMobileDateFromCalendar(dateString);
        });
    } else {
        // 채팅 데이터가 없는 날짜
        dayElement.className += ' text-gray-400';
    }

    return dayElement;
};

/**
 * 모바일 달력에서 날짜 클릭 시 해당 날짜로 스크롤 (PC와 동일한 로직)
 */
KakaoTalkViewer.prototype.scrollToMobileDateFromCalendar = function(dateString) {
    // 달력 팝업 닫기
    const mobileCalendarPopup = document.getElementById('mobile-calendar-popup');
    if (mobileCalendarPopup) {
        mobileCalendarPopup.classList.add('hidden');
    }

    // 검색 패널도 닫기
    const mobileSearchPanel = document.getElementById('mobile-search-panel');
    if (mobileSearchPanel) {
        mobileSearchPanel.classList.add('hidden');
    }

    // 해당 날짜로 스크롤 (PC와 동일한 로직 사용)
    this.scrollToDate(dateString);
};

/**
 * 모바일 달력 월 변경
 */
KakaoTalkViewer.prototype.changeMobileMonth = function(direction) {
    this.currentMobileCalendarDate.setMonth(this.currentMobileCalendarDate.getMonth() + direction);
    this.renderMobileCalendar();
};

/**
 * 모바일 달력 초기 날짜 설정 (PC와 동일하게 오늘 날짜로 초기화)
 */
KakaoTalkViewer.prototype.initMobileCalendarDate = function() {
    // PC와 동일하게 오늘 날짜로 초기화
    this.currentMobileCalendarDate = new Date();
};

/**
 * 모바일에서 특정 날짜로 이동
 */
KakaoTalkViewer.prototype.jumpToMobileDate = function(dateString) {
        this.scrollToDate(dateString);
};

/**
 * 모바일/태블릿용 파일 업로드 기능 초기화
 */
KakaoTalkViewer.prototype.initMobileFileUpload = function() {
    const mobileFileInput = document.getElementById('mobile-file-input');
    const mobileUploadBtn = document.getElementById('mobile-upload-btn');
    const mobileUploadArea = document.getElementById('mobile-upload-area');

    // 모바일 파일 선택 버튼
    if (mobileUploadBtn && mobileFileInput) {
        mobileUploadBtn.addEventListener('click', () => {
            console.log('모바일 업로드 버튼 클릭됨');
            mobileFileInput.click();
        });
    } else {
        console.log('모바일 업로드 요소를 찾을 수 없음:', { mobileUploadBtn, mobileFileInput });
    }

    // 모바일 파일 입력 변경
    if (mobileFileInput) {
        mobileFileInput.addEventListener('change', (e) => {
            console.log('모바일 파일 입력 변경됨:', e.target.files[0]);
            this.handleFileSelect(e);
        });
    }

    // 모바일 드래그 앤 드롭
    if (mobileUploadArea) {
        mobileUploadArea.addEventListener('dragover', (e) => this.handleMobileDragOver(e));
        mobileUploadArea.addEventListener('dragleave', (e) => this.handleMobileDragLeave(e));
        mobileUploadArea.addEventListener('drop', (e) => this.handleMobileDrop(e));
        mobileUploadArea.addEventListener('click', () => {
            if (mobileFileInput) mobileFileInput.click();
        });
    }
};

/**
 * 모바일 정보 패널 파일 업로드 기능 초기화
 */
KakaoTalkViewer.prototype.initMobileInfoFileUpload = function() {
    const mobileInfoFileInput = document.getElementById('mobile-info-file-input');
    const mobileInfoUploadBtn = document.getElementById('mobile-info-upload-btn');
    const mobileInfoUploadArea = document.getElementById('mobile-info-upload-area');

    // 모바일 정보 패널 파일 선택 버튼
    if (mobileInfoUploadBtn && mobileInfoFileInput) {
        mobileInfoUploadBtn.addEventListener('click', () => {
            console.log('모바일 정보 패널 업로드 버튼 클릭됨');
            mobileInfoFileInput.click();
        });
    } else {
        console.log('모바일 정보 패널 업로드 요소를 찾을 수 없음:', { mobileInfoUploadBtn, mobileInfoFileInput });
    }

    // 모바일 정보 패널 파일 입력 변경
    if (mobileInfoFileInput) {
        mobileInfoFileInput.addEventListener('change', (e) => {
            console.log('모바일 정보 패널 파일 입력 변경됨:', e.target.files[0]);
            this.handleFileSelect(e);
        });
    }

    // 모바일 정보 패널 드래그 앤 드롭
    if (mobileInfoUploadArea) {
        mobileInfoUploadArea.addEventListener('dragover', (e) => this.handleMobileDragOver(e));
        mobileInfoUploadArea.addEventListener('dragleave', (e) => this.handleMobileDragLeave(e));
        mobileInfoUploadArea.addEventListener('drop', (e) => this.handleMobileDrop(e));
        mobileInfoUploadArea.addEventListener('click', () => {
            if (mobileInfoFileInput) mobileInfoFileInput.click();
        });
    }
};

/**
 * 모바일 드래그 오버 핸들링
 * @param {Event} e - 드래그 이벤트
 */
KakaoTalkViewer.prototype.handleMobileDragOver = function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    document.getElementById('mobile-upload-area').classList.add('drag-over');
};

/**
 * 모바일 드래그 리브 핸들링
 * @param {Event} e - 드래그 이벤트
 */
KakaoTalkViewer.prototype.handleMobileDragLeave = function(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('mobile-upload-area').classList.remove('drag-over');
};

/**
 * 모바일 파일 드롭 핸들링
 * @param {Event} e - 드롭 이벤트
 */
KakaoTalkViewer.prototype.handleMobileDrop = function(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('mobile-upload-area').classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        this.processFile(files[0]);
    }
};

/**
 * 모바일 메뉴 시스템 초기화
 */
KakaoTalkViewer.prototype.initMobileMenu = function() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenuDropdown = document.getElementById('mobile-menu-dropdown');
    const mobileInfoMenu = document.getElementById('mobile-info-menu');
    const mobileSearchMenu = document.getElementById('mobile-search-menu');
    const mobileInfoPanel = document.getElementById('mobile-info-panel');
    const mobileInfoClose = document.getElementById('mobile-info-close');
    const mobileSearchPanel = document.getElementById('mobile-search-panel');

    // 모바일 메뉴 버튼 클릭
    if (mobileMenuBtn && mobileMenuDropdown) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenuDropdown.classList.toggle('hidden');
        });
    }

    // 채팅방 정보 메뉴 클릭
    if (mobileInfoMenu && mobileInfoPanel) {
        mobileInfoMenu.addEventListener('click', () => {
            mobileMenuDropdown.classList.add('hidden');
            mobileInfoPanel.classList.remove('hidden');
            // 검색 패널이 열려있다면 닫기
            if (mobileSearchPanel) {
                mobileSearchPanel.classList.add('hidden');
            }
        });
    }

    // 검색 메뉴 클릭 (기존 검색 패널 열기)
    if (mobileSearchMenu && mobileSearchPanel) {
        mobileSearchMenu.addEventListener('click', () => {
            mobileMenuDropdown.classList.add('hidden');
            mobileSearchPanel.classList.remove('hidden');
            // 정보 패널이 열려있다면 닫기
            if (mobileInfoPanel) {
                mobileInfoPanel.classList.add('hidden');
            }
            // 검색 입력 필드에 포커스
            setTimeout(() => {
                const searchInput = document.getElementById('mobile-search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }, 100);
        });
    }

    // 모바일 정보 패널 닫기
    if (mobileInfoClose && mobileInfoPanel) {
        mobileInfoClose.addEventListener('click', () => {
            mobileInfoPanel.classList.add('hidden');
        });
    }

    // 외부 클릭 시 메뉴 드롭다운 닫기
    document.addEventListener('click', (e) => {
        if (mobileMenuDropdown && !mobileMenuDropdown.classList.contains('hidden')) {
            if (!mobileMenuDropdown.contains(e.target) && e.target !== mobileMenuBtn) {
                mobileMenuDropdown.classList.add('hidden');
            }
        }
    });
};

// 애플리케이션 초기화
document.addEventListener('DOMContentLoaded', () => {
    new KakaoTalkViewer();
});

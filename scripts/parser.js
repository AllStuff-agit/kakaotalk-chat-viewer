/**
 * 카카오톡 채팅 데이터 파서
 * 카카오톡에서 내보낸 채팅 데이터를 파싱하여 구조화된 데이터로 변환
 */

class KakaoTalkStreamParser {
    constructor(onEntry = () => {}) {
        this.onEntry = onEntry;
        this.buffer = '';
        this.currentDate = '';
        this.currentMessage = null;
        this.finished = false;
        this.metadata = {
            title: '',
            saveDate: '',
            totalEntries: 0,
            totalMessages: 0
        };
    }

    pushChunk(text) {
        if (this.finished) {
            throw new Error('이미 완료된 채팅 파일에는 데이터를 추가할 수 없습니다.');
        }

        const lines = (this.buffer + text).split('\n');
        this.buffer = lines.pop();
        lines.forEach(line => this.consumeLine(line));
    }

    finish() {
        if (this.finished) return this.metadata;
        if (this.buffer) this.consumeLine(this.buffer);
        this.flushMessage();
        this.buffer = '';
        this.finished = true;
        return this.metadata;
    }

    consumeLine(rawLine) {
        const line = rawLine.trim();

        if (!line) {
            if (this.currentMessage) {
                this.currentMessage.content += '\n';
                this.currentMessage.raw += '\n';
            }
            return;
        }

        const messageMatch = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/);

        if (line.includes('님과 카카오톡 대화')) {
            this.flushMessage();
            this.metadata.title = line.replace(' 님과 카카오톡 대화', '');
            return;
        }

        if (line.startsWith('저장한 날짜 :')) {
            this.flushMessage();
            this.metadata.saveDate = line.replace(/^저장한 날짜\s*:\s*/, '');
            return;
        }

        if (line.startsWith('---------------') && line.includes('년') && line.includes('월')) {
            this.flushMessage();
            this.currentDate = this.extractDate(line);
            this.emit({ type: 'date', date: this.currentDate, raw: line });
            return;
        }

        if (messageMatch) {
            this.flushMessage();
            const [, sender, time, content] = messageMatch;
            const trimmedContent = content.trim();
            this.currentMessage = {
                type: 'message',
                sender: sender.trim(),
                time: time.trim(),
                content: trimmedContent,
                date: this.currentDate,
                messageType: this.detectMessageType(trimmedContent),
                raw: line
            };
            return;
        }

        if (this.currentMessage) {
            this.currentMessage.content += '\n' + line;
            this.currentMessage.raw += '\n' + line;
            this.currentMessage.messageType = this.detectMessageType(this.currentMessage.content);
        }
    }

    flushMessage() {
        if (!this.currentMessage) return;
        this.emit(this.currentMessage);
        this.currentMessage = null;
    }

    emit(entry) {
        entry.index = this.metadata.totalEntries;
        this.metadata.totalEntries++;
        if (entry.type === 'message') this.metadata.totalMessages++;
        this.onEntry(entry);
    }

    extractDate(line) {
        const dateMatch = line.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\S+)/);
        if (!dateMatch) return line;
        const [, year, month, day, dayOfWeek] = dateMatch;
        return `${year}년 ${month}월 ${day}일 ${dayOfWeek}`;
    }

    detectMessageType(content) {
        if (!content) return 'empty';
        if (content === '사진' || content === '동영상' || content === '사진 여러 장') return 'media';
        if (content === '이모티콘' || content.startsWith('이모티콘:')) return 'emoticon';
        if (content.includes('http://') || content.includes('https://')) return 'link';
        if (content.includes('파일:') || content.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i)) return 'file';
        if (content === '음성메시지' || content.includes('음성메시지')) return 'voice';
        if (content.includes('님이 들어왔습니다') ||
            content.includes('님이 나갔습니다') ||
            content.includes('대화방을 개설했습니다')) return 'system';
        return 'text';
    }
}

class KakaoTalkParser {
    constructor() {
        this.chatData = {
            title: '',
            saveDate: '',
            messages: []
        };
    }

    /**
     * 텍스트 파일 내용을 파싱
     * @param {string} content - 카카오톡 채팅 데이터 텍스트
     * @returns {Object} 파싱된 채팅 데이터
     */
    parse(content) {
        this.chatData = { title: '', saveDate: '', messages: [] };
        const parser = new KakaoTalkStreamParser(entry => this.chatData.messages.push(entry));
        parser.pushChunk(content);
        const metadata = parser.finish();
        this.chatData.title = metadata.title;
        this.chatData.saveDate = metadata.saveDate;
        return this.chatData;
    }
    
    /**
     * 날짜 구분선에서 날짜 추출
     * @param {string} line - 날짜 구분선
     * @returns {string} 추출된 날짜
     */
    extractDate(line) {
        // "--------------- 2025년 5월 20일 화요일 ---------------" 형태에서 날짜 추출
        const dateMatch = line.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\S+)/);
        if (dateMatch) {
            const [, year, month, day, dayOfWeek] = dateMatch;
            return `${year}년 ${month}월 ${day}일 ${dayOfWeek}`;
        }
        return line;
    }
    
    
    /**
     * 메시지 타입 감지
     * @param {string} content - 메시지 내용
     * @returns {string} 메시지 타입
     */
    detectMessageType(content) {
        if (!content) return 'empty';
        
        // 사진/동영상
        if (content === '사진' || content === '동영상' || content === '사진 여러 장') {
            return 'media';
        }
        
        // 이모티콘
        if (content === '이모티콘' || content.startsWith('이모티콘:')) {
            return 'emoticon';
        }
        
        // 링크
        if (content.includes('http://') || content.includes('https://')) {
            return 'link';
        }
        
        // 파일
        if (content.includes('파일:') || content.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i)) {
            return 'file';
        }
        
        // 음성메시지
        if (content === '음성메시지' || content.includes('음성메시지')) {
            return 'voice';
        }
        
        // 시스템 메시지 (입장/퇴장 등)
        if (content.includes('님이 들어왔습니다') || 
            content.includes('님이 나갔습니다') || 
            content.includes('대화방을 개설했습니다')) {
            return 'system';
        }
        
        return 'text';
    }
    
    /**
     * 통계 정보 반환
     * @returns {Object} 채팅 통계
     */
    getStats() {
        const messages = this.chatData.messages.filter(msg => msg.type === 'message');
        const senders = [...new Set(messages.map(msg => msg.sender))];
        
        return {
            totalMessages: messages.length,
            totalDays: this.chatData.messages.filter(msg => msg.type === 'date').length,
            participants: senders.length,
            senderStats: this.getSenderStats(messages, senders)
        };
    }
    
    /**
     * 발신자별 통계
     * @param {Array} messages - 메시지 배열
     * @param {Array} senders - 발신자 배열
     * @returns {Object} 발신자별 통계
     */
    getSenderStats(messages, senders) {
        const stats = {};
        senders.forEach(sender => {
            const senderMessages = messages.filter(msg => msg.sender === sender);
            stats[sender] = {
                count: senderMessages.length,
                percentage: Math.round((senderMessages.length / messages.length) * 100)
            };
        });
        return stats;
    }
}

// 전역으로 클래스 내보내기
globalThis.KakaoTalkStreamParser = KakaoTalkStreamParser;
globalThis.KakaoTalkParser = KakaoTalkParser;

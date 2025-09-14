/**
 * 카카오톡 채팅 데이터 파서
 * 카카오톡에서 내보낸 채팅 데이터를 파싱하여 구조화된 데이터로 변환
 */

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
        const lines = content.split('\n');
        let currentDate = '';
        let currentMessage = null; // 현재 처리 중인 멀티라인 메시지

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 빈 줄 처리 - 현재 메시지가 있으면 빈 줄도 메시지에 포함
            if (!line) {
                if (currentMessage) {
                    // 빈 줄을 현재 메시지에 추가 (줄바꿈으로)
                    currentMessage.content += '\n';
                    currentMessage.raw += '\n';
                }
                continue;
            }

            // 새로운 메시지 시작인지 확인 (메시지 패턴 체크)
            const messagePattern = /^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/;
            const messageMatch = line.match(messagePattern);

            // 채팅방 제목 추출
            if (line.includes('님과 카카오톡 대화')) {
                if (currentMessage) {
                    this.chatData.messages.push(currentMessage);
                    currentMessage = null;
                }
                this.chatData.title = line.replace(' 님과 카카오톡 대화', '');
                continue;
            }

            // 저장 날짜 추출
            if (line.startsWith('저장한 날짜 :')) {
                if (currentMessage) {
                    this.chatData.messages.push(currentMessage);
                    currentMessage = null;
                }
                this.chatData.saveDate = line.replace('저장한 날짜 : ', '');
                continue;
            }

            // 날짜 구분선 처리
            if (line.startsWith('---------------') && line.includes('년') && line.includes('월')) {
                if (currentMessage) {
                    this.chatData.messages.push(currentMessage);
                    currentMessage = null;
                }
                currentDate = this.extractDate(line);
                this.chatData.messages.push({
                    type: 'date',
                    date: currentDate,
                    raw: line
                });
                continue;
            }

            if (messageMatch) {
                // 이전 메시지가 있으면 완료 처리
                if (currentMessage) {
                    this.chatData.messages.push(currentMessage);
                }

                // 새로운 메시지 시작
                const [, sender, time, content] = messageMatch;
                currentMessage = {
                    type: 'message',
                    sender: sender.trim(),
                    time: time.trim(),
                    content: content.trim(),
                    date: currentDate,
                    messageType: this.detectMessageType(content.trim()),
                    raw: line
                };
            } else if (currentMessage) {
                // 기존 메시지에 내용 추가 (멀티라인)
                currentMessage.content += '\n' + line;
                currentMessage.raw += '\n' + line;
                // 메시지 타입 재감지 (전체 내용 기준)
                currentMessage.messageType = this.detectMessageType(currentMessage.content);
            }
        }

        // 마지막 메시지 처리
        if (currentMessage) {
            this.chatData.messages.push(currentMessage);
        }

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
window.KakaoTalkParser = KakaoTalkParser;
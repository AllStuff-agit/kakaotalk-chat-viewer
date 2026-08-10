import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {};
vm.runInNewContext(fs.readFileSync(new URL('parser.js', import.meta.url), 'utf8'), sandbox);

const entries = [];
const parser = new sandbox.KakaoTalkStreamParser(entry => entries.push(entry));
parser.pushChunk('테스트방 님과 카카오톡 대화\n저장한 날짜 : 2026-08-10\n');
parser.pushChunk('--------------- 2026년 8월 10일 월요일 ---------------\n');
parser.pushChunk('[철수] [오후 1:00] 첫 줄\n둘');
parser.pushChunk('째 줄\n\n[영희] [오후 1:01] 다음 메시지');
const metadata = parser.finish();

assert.equal(metadata.title, '테스트방');
assert.equal(metadata.saveDate, '2026-08-10');
assert.equal(metadata.totalEntries, 3);
assert.equal(metadata.totalMessages, 2);
assert.equal(entries[0].type, 'date');
assert.equal(entries[1].index, 1);
assert.equal(entries[1].content, '첫 줄\n둘째 줄\n');
assert.equal(entries[2].content, '다음 메시지');

const compatibility = new sandbox.KakaoTalkParser().parse(
    '테스트방 님과 카카오톡 대화\n[철수] [오전 9:00] 안녕'
);
assert.equal(compatibility.messages.length, 1);
assert.equal(compatibility.messages[0].content, '안녕');

console.log('parser streaming check passed');

const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '../eval/free-topics-benchmark-results.json');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

console.log('=== KIỂM TRA MẪU CỤT (words < 40 hoặc kết thúc dở dang hoặc score <= 1.5) ===');
const truncated = [];

for (const cond of ['conditionA', 'conditionC', 'conditionCPlus', 'conditionB']) {
  data[cond].forEach(s => {
    const text = (s.content || '').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const endsWithPunct = /[.!?…»”"\')]$/.test(text);
    const isTruncated = words < 40 || s.avgScore <= 1.5;
    if (isTruncated) {
      truncated.push({ cond, topicId: s.topicId, topic: s.topic, group: s.group, words, endsWithPunct, avgScore: s.avgScore, preview: text.slice(0, 100).replace(/\n/g, ' ') });
      console.log(`[${cond}] Topic ${s.topicId} (${s.topic}): words=${words}, score=${s.avgScore}`);
      console.log(`   Text: "${text}"`);
    }
  });
}

console.log(`\nTổng số mẫu cụt/hỏng phát hiện: ${truncated.length}`);

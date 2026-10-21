const fs = require('fs');
const path = require('path');
const resultsPath = path.resolve(__dirname, '../eval/benchmark-results.json');
const res = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const topicPackService = require('../src/utils/TopicPackService');
const { validatePostAgainstRules } = topicPackService;

console.log('=== DANH SÁCH BÀI ĐIỀU KIỆN B BỊ VALIDATOR CHẶN ===\n');
const blockedB = [];

res.conditionB.samples.forEach((s) => {
  const val = validatePostAgainstRules('', s.content);
  if (s.validatorBlocked || !val.isValid) {
    blockedB.push({
      topicId: s.topicId,
      topic: s.topic,
      group: s.group,
      validatorBlockedFlag: s.validatorBlocked,
      violations: val.violations,
      warnings: val.warnings,
      charLength: s.charLength,
      content: s.content
    });
  }
});

console.log(`Tổng số bài B bị chặn: ${blockedB.length}/30 (${((blockedB.length / 30) * 100).toFixed(1)}%)\n`);

blockedB.forEach((b, i) => {
  console.log(`------------------------------------------------------------------------`);
  console.log(`[Bài #${i + 1}] Topic ID: ${b.topicId} | "${b.topic}" (Nhóm: ${b.group})`);
  console.log(`Các vi phạm (Violations) bắn ra:`);
  b.violations.forEach((v) => console.log(`   🚨 ${v}`));
  if (b.warnings.length > 0) {
    console.log(`Cảnh báo (Warnings):`);
    b.warnings.forEach((w) => console.log(`   ⚠️ ${w}`));
  }
  console.log(`Nội dung bài viết:`);
  console.log(`"""\n${b.content}\n"""\n`);
});

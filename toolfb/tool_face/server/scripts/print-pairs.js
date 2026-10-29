const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '../eval/free-topics-benchmark-results.json');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

const isTruncated = (s) => {
  if (!s || !s.content) return true;
  const text = s.content.trim();
  const words = text ? text.split(/\s+/).length : 0;
  return words < 40 || s.avgScore <= 1.5;
};

console.log('ID | Chủ đề                     | Nhóm     | Trạng thái | Điểm B vs C+ | Δ Điểm (B - C+) | Claims (B vs C+) | Δ Claim (B - C+)');
console.log('---|----------------------------|----------|------------|--------------|-----------------|------------------|-----------------');

const validPairs = { thuong: [], nhay_cam: [], kho_la: [] };

for (let i = 0; i < 25; i++) {
  const b = data.conditionB[i];
  const cPlus = data.conditionCPlus[i];
  if (!b || !cPlus) continue;

  const bTrunc = isTruncated(b);
  const cTrunc = isTruncated(cPlus);
  const status = (bTrunc && cTrunc) ? 'CẢ 2 CỤT' : bTrunc ? 'B CỤT' : cTrunc ? 'C+ CỤT' : 'OK';

  const deltaScore = (!bTrunc && !cTrunc) ? (b.avgScore - cPlus.avgScore).toFixed(1) : 'N/A';
  const deltaClaim = (!bTrunc && !cTrunc) ? (b.claimsCount - cPlus.claimsCount) : 'N/A';

  console.log(
    `${String(i + 1).padStart(2)} | ` +
    `${b.topic.padEnd(26)} | ` +
    `${b.group.padEnd(8)} | ` +
    `${status.padEnd(10)} | ` +
    `B:${b.avgScore} vs C+:${cPlus.avgScore} | ` +
    `${String(deltaScore).padStart(15)} | ` +
    `B:${b.claimsCount} vs C+:${cPlus.claimsCount}       | ` +
    `${String(deltaClaim).padStart(15)}`
  );

  if (!bTrunc && !cTrunc) {
    validPairs[b.group].push({
      topicId: i + 1,
      topic: b.topic,
      deltaScore: parseFloat(deltaScore),
      deltaClaim: parseInt(deltaClaim, 10),
      bScore: b.avgScore,
      cPlusScore: cPlus.avgScore,
      bClaims: b.claimsCount,
      cPlusClaims: cPlus.claimsCount
    });
  }
}

console.log('\n=== TỔNG KẾT GHÉP CẶP (LOẠI MẪU CỤT) ===');
for (const g of ['thuong', 'nhay_cam', 'kho_la']) {
  const pairs = validPairs[g];
  const bWinsScore = pairs.filter(p => p.deltaScore > 0).length;
  const cPlusWinsScore = pairs.filter(p => p.deltaScore < 0).length;
  const tiesScore = pairs.filter(p => p.deltaScore === 0).length;

  const bFewerClaims = pairs.filter(p => p.deltaClaim < 0).length; // ít claim hơn = tốt hơn
  const cPlusFewerClaims = pairs.filter(p => p.deltaClaim > 0).length;
  const tiesClaims = pairs.filter(p => p.deltaClaim === 0).length;

  console.log(`\n📌 ${g.toUpperCase()} (Hợp lệ: ${pairs.length} cặp):`);
  console.log(`  - Điểm chất lượng : B thắng ${bWinsScore} | C+ thắng ${cPlusWinsScore} | Hòa ${tiesScore}`);
  console.log(`  - Sự thật (Claims): B sạch hơn ${bFewerClaims} | C+ sạch hơn ${cPlusFewerClaims} | Ngang nhau ${tiesClaims}`);
}

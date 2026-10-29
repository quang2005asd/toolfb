const fs = require('fs');
const path = require('path');
const { extractAndVerifyClaims } = require('../src/utils/ClaimExtractor');

const DATA_FILE = path.join(__dirname, '../eval/free-topics-benchmark-results.json');
const TOPICS_FILE = path.join(__dirname, '../eval/topics.json');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTruncated(s) {
  if (!s || !s.content) return true;
  const text = s.content.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const endsWithPunct = /[.!?…»”"\')]$/.test(text);
  return words < 40 || !endsWithPunct || (s.avgScore !== null && s.avgScore <= 1.5);
}

function calculateMeanStd(arr) {
  const valid = arr.filter((v) => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return { mean: 0, std: 0 };
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  if (valid.length === 1) return { mean: Number(mean.toFixed(2)), std: 0 };
  const variance = valid.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (valid.length - 1);
  return { mean: Number(mean.toFixed(2)), std: Number(Math.sqrt(variance).toFixed(2)) };
}

async function main() {
  console.log('🚀 BẮT ĐẦU CHẠY EXTRACTOR CHUNG (Qwen 27B) TRÊN BÀI CUỐI CỦA CẢ 4 ĐIỀU KIỆN...');
  
  const rawData = fs.readFileSync(DATA_FILE, 'utf8');
  const results = JSON.parse(rawData);
  const topics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8')).filter(t => t.group !== 'ban_hang_facts');

  const topicMap = new Map();
  topics.forEach(t => topicMap.set(t.id, t));

  const conditions = ['conditionA', 'conditionC', 'conditionCPlus', 'conditionB'];

  let callCount = 0;
  for (const condKey of conditions) {
    console.log(`\n--- Đang chạy extractor chung cho ${condKey} ---`);
    for (let i = 0; i < results[condKey].length; i++) {
      const post = results[condKey][i];
      const topicObj = topicMap.get(post.topicId);
      const facts = topicObj ? topicObj.facts : '';

      // Nếu mẫu cụt hỏng nặng (ví dụ dưới 10 từ), không cần tốn request AI
      if (!post.content || post.content.trim().split(/\s+/).length < 10) {
        post.claimsCountUnified = 0;
        post.unbackedClaimsUnified = [];
        continue;
      }

      try {
        const claimRes = await extractAndVerifyClaims(post.content, facts, { model: 'qwen/qwen3.8-27b' });
        post.claimsCountUnified = claimRes.type1UnbackedCount || 0;
        post.unbackedClaimsUnified = claimRes.type1UnbackedClaims || [];
        callCount++;
        if (callCount % 10 === 0) {
          console.log(`  -> Đã trích xuất ${callCount}/100 bài...`);
        }
        await sleep(1000);
      } catch (err) {
        console.warn(`  Lỗi trích xuất [${condKey}] Topic ${post.topicId}:`, err.message);
        post.claimsCountUnified = post.claimsCount || 0;
        post.unbackedClaimsUnified = post.unbackedClaims || [];
      }
    }
  }

  // Lưu dữ liệu đã cập nhật
  fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n💾 Đã cập nhật xong số claim thống nhất cho cả 4 điều kiện vào ${DATA_FILE}`);

  // ═══ 1. BẢNG TỔNG KẾT SAU KHI LOẠI MẪU CỤT & ĐỔI NHÃN ĐÚNG ═══
  console.log('\n========================================================================');
  console.log('📊 BẢNG TỔNG KẾT BENCHMARK (ĐÃ LOẠI MẪU CỤT, ĐO BẰNG EXTRACTOR CHUNG)');
  console.log('   * Lưu ý: Độ lệch chuẩn (±) là độ lệch GIỮA CÁC CHỦ ĐỀ, không phải giữa các lần chạy');
  console.log('========================================================================');

  const groups = ['thuong', 'nhay_cam', 'kho_la'];
  const groupNames = { thuong: 'Nhóm Thường (10 chủ đề)', nhay_cam: 'Nhóm Nhạy cảm (10 chủ đề)', kho_la: 'Nhóm Khó (5 chủ đề)' };

  for (const g of groups) {
    console.log(`\n📌 ${groupNames[g]}:`);
    for (const condKey of conditions) {
      const condName = condKey === 'conditionA' ? 'A (Prompt cũ)' : condKey === 'conditionC' ? 'C (COMMON)' : condKey === 'conditionCPlus' ? 'C+ (Rewriter)' : 'B (Pack+Rewriter)';
      
      // Lọc bỏ mẫu cụt
      const validSamples = results[condKey].filter(s => s.group === g && !isTruncated(s) && s.avgScore !== null);

      const scoreStats = calculateMeanStd(validSamples.map(s => s.avgScore));
      const claimStats = calculateMeanStd(validSamples.map(s => s.claimsCountUnified));
      const avgHealth = validSamples.length > 0 ? (validSamples.reduce((sum, s) => sum + (s.codeHealthClaims || 0), 0) / validSamples.length).toFixed(2) : 0;

      console.log(`  - ${condName.padEnd(20)}: Điểm CL = ${scoreStats.mean} ± ${scoreStats.std} | Claim L1 = ${claimStats.mean} ± ${claimStats.std} | Code Health = ${avgHealth} | Mẫu sạch = ${validSamples.length}`);
    }
  }

  // ═══ 2. PHÂN TÍCH GHÉP CẶP B SO VỚI C+ THEO TỪNG CHỦ ĐỀ ═══
  console.log('\n========================================================================');
  console.log('📋 BẢNG SO SÁNH GHÉP CẶP TỪNG CHỦ ĐỀ: B vs C+ (n=1)');
  console.log('========================================================================');
  console.log('ID | Chủ đề                     | Nhóm     | Trạng thái | Điểm B vs C+ | Δ Điểm (B - C+) | Claim B vs C+ | Δ Claim (B - C+) | Đánh giá cặp');
  console.log('---|----------------------------|----------|------------|--------------|-----------------|---------------|------------------|-------------');

  const pairedSummary = {
    thuong: { totalValid: 0, bWinsQuality: 0, cPlusWinsQuality: 0, tiesQuality: 0, bBetterClaim: 0, cPlusBetterClaim: 0, tiesClaim: 0 },
    nhay_cam: { totalValid: 0, bWinsQuality: 0, cPlusWinsQuality: 0, tiesQuality: 0, bBetterClaim: 0, cPlusBetterClaim: 0, tiesClaim: 0 },
    kho_la: { totalValid: 0, bWinsQuality: 0, cPlusWinsQuality: 0, tiesQuality: 0, bBetterClaim: 0, cPlusBetterClaim: 0, tiesClaim: 0 }
  };

  const highDiscrepancyTopics = [];

  for (let i = 0; i < 25; i++) {
    const b = results.conditionB[i];
    const cPlus = results.conditionCPlus[i];
    if (!b || !cPlus) continue;

    const bTrunc = isTruncated(b);
    const cTrunc = isTruncated(cPlus);
    const isValidPair = !bTrunc && !cTrunc;

    const status = isValidPair ? 'HỢP LỆ' : (bTrunc && cTrunc) ? 'CẢ 2 CỤT' : bTrunc ? 'B CỤT' : 'C+ CỤT';

    const bScore = b.avgScore;
    const cScore = cPlus.avgScore;
    const bClaim = b.claimsCountUnified !== undefined ? b.claimsCountUnified : b.claimsCount;
    const cClaim = cPlus.claimsCountUnified !== undefined ? cPlus.claimsCountUnified : cPlus.claimsCount;

    let deltaScoreStr = 'N/A';
    let deltaClaimStr = 'N/A';
    let verdict = 'Bị loại (cụt)';

    if (isValidPair) {
      const deltaScore = Number((bScore - cScore).toFixed(1));
      const deltaClaim = bClaim - cClaim;
      deltaScoreStr = (deltaScore > 0 ? `+${deltaScore}` : `${deltaScore}`).padStart(6);
      deltaClaimStr = (deltaClaim > 0 ? `+${deltaClaim}` : `${deltaClaim}`).padStart(6);

      // Nhận định cặp
      if (deltaScore > 0 && deltaClaim <= 0) verdict = 'B THẮNG RÕ';
      else if (deltaScore < 0 && deltaClaim >= 0) verdict = 'C+ THẮNG RÕ';
      else if (deltaScore > 0 && deltaClaim > 0) verdict = 'B hơn điểm nhưng nhiều claim';
      else if (deltaScore < 0 && deltaClaim < 0) verdict = 'C+ hơn điểm nhưng nhiều claim';
      else if (deltaScore === 0 && deltaClaim === 0) verdict = 'HÒA TUYỆT ĐỐI';
      else if (deltaScore === 0) verdict = deltaClaim < 0 ? 'B sạch hơn' : 'C+ sạch hơn';
      else verdict = 'NGANG NGỬA';

      // Cập nhật thống kê
      const gSum = pairedSummary[b.group];
      gSum.totalValid++;
      if (deltaScore > 0) gSum.bWinsQuality++;
      else if (deltaScore < 0) gSum.cPlusWinsQuality++;
      else gSum.tiesQuality++;

      if (deltaClaim < 0) gSum.bBetterClaim++;
      else if (deltaClaim > 0) gSum.cPlusBetterClaim++;
      else gSum.tiesClaim++;

      // Ghi nhận các chủ đề chênh nhiều (|deltaScore| >= 0.8 hoặc |deltaClaim| >= 3)
      if (Math.abs(deltaScore) >= 0.8 || Math.abs(deltaClaim) >= 2) {
        highDiscrepancyTopics.push({
          topicId: b.topicId,
          topic: b.topic,
          group: b.group,
          deltaScore,
          deltaClaim,
          bScore,
          cScore,
          bClaim,
          cClaim,
          reason: Math.abs(deltaScore) >= 0.8 ? `Chênh điểm lớn (${deltaScore})` : `Chênh claim lớn (${deltaClaim})`
        });
      }
    }

    console.log(
      `${String(i + 1).padStart(2)} | ` +
      `${b.topic.padEnd(26)} | ` +
      `${b.group.padEnd(8)} | ` +
      `${status.padEnd(10)} | ` +
      `B:${String(bScore).padEnd(3)} vs C+:${String(cScore).padEnd(3)} | ` +
      `${deltaScoreStr.padStart(15)} | ` +
      `B:${String(bClaim).padEnd(2)} vs C+:${String(cClaim).padEnd(2)} | ` +
      `${deltaClaimStr.padStart(16)} | ` +
      `${verdict}`
    );
  }

  console.log('\n========================================================================');
  console.log('🏆 TỔNG HỢP TỶ LỆ THẮNG THEO PHÉP SO GHÉP CẶP (PAIRED WINS)');
  console.log('========================================================================');
  for (const g of groups) {
    const sum = pairedSummary[g];
    console.log(`\n📌 ${groupNames[g]} (Mẫu hợp lệ: ${sum.totalValid} cặp):`);
    console.log(`  - Trục Điểm Chất Lượng: B thắng ${sum.bWinsQuality}/${sum.totalValid} (${((sum.bWinsQuality/sum.totalValid)*100).toFixed(0)}%) | C+ thắng ${sum.cPlusWinsQuality}/${sum.totalValid} (${((sum.cPlusWinsQuality/sum.totalValid)*100).toFixed(0)}%) | Hòa ${sum.tiesQuality}`);
    console.log(`  - Trục Sự Thật (Ít claim hơn): B sạch hơn ${sum.bBetterClaim}/${sum.totalValid} | C+ sạch hơn ${sum.cPlusBetterClaim}/${sum.totalValid} | Ngang nhau ${sum.tiesClaim}`);
  }

  console.log('\n========================================================================');
  console.log('⚠️ CÁC CHỦ ĐỀ CHÊNH NHIỀU HOẶC ĐẢO CHIỀU (CẦN CHẠY LẠI n=3 ĐỂ XÁC NHẬN)');
  console.log('========================================================================');
  highDiscrepancyTopics.forEach(t => {
    console.log(`- [Topic ${t.topicId}] "${t.topic}" (${t.group}): B(Điểm=${t.bScore}, Claim=${t.bClaim}) vs C+(Điểm=${t.cScore}, Claim=${t.cClaim}) -> ${t.reason}`);
  });
}

main().catch(console.error);

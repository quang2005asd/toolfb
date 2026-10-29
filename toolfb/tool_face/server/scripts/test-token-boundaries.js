const { scanSensitiveKeywords } = require('../src/utils/PostStateMachine');

const testCases = [
  { text: 'tiếng ve sầu cicada kêu râm ran mùa hè', shouldMatch: false, reason: 'Chứa cicada nhưng không phải mã nợ CIC' },
  { text: 'đội tuyển bóng đá Bangladesh giao hữu', shouldMatch: false, reason: 'Chứa Bangladesh nhưng không phải bất động sản BDS' },
  { text: 'chiếc váy hoa xòe đi dạo phố', shouldMatch: false, reason: 'Chứa từ váy nhưng không phải vay tiền/tín chấp' },
  { text: 'than hoạt tính khử mùi tủ lạnh', shouldMatch: false, reason: 'Chứa than hoạt tính nhưng không phải bệnh thận/suy thận' },
  { text: 'khách hàng bị nợ xấu cic nhóm 2 có vay được không', shouldMatch: true, reason: 'Đúng nợ xấu CIC' },
  { text: 'bản đồ quy hoạch bds ven đô', shouldMatch: true, reason: 'Đúng bất động sản BDS' },
  { text: 'thừa phát lại lập vi bằng chuyển nhượng', shouldMatch: true, reason: 'Đúng vi bằng pháp lý' }
];

console.log('--- TEST KIỂM TRA RANH GIỚI TỪ (TOKEN BOUNDARY MATCHING) ---');
let allPassed = true;
testCases.forEach((tc, idx) => {
  const res = scanSensitiveKeywords(tc.text, '');
  const pass = res.matched === tc.shouldMatch;
  if (!pass) allPassed = false;
  console.log(`#${idx + 1} [${pass ? '✅ PASS' : '❌ FAIL'}] "${tc.text}" => Matched: ${res.matched} (Kỳ vọng: ${tc.shouldMatch}) - ${tc.reason}`);
});
console.log('Kết quả chung:', allPassed ? '🎉 TẤT CẢ TEST RANH GIỚI TỪ ĐẠT 100%!' : '❌ CÓ TEST THẤT BẠI!');
if (!allPassed) process.exit(1);

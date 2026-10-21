/**
 * generate-frozen-packs.js
 * Tạo 30 Topic Packs đóng băng (Frozen Packs) chuẩn mực, được thẩm định thủ công,
 * loại bỏ việc sinh pack ngẫu nhiên bằng AI trong các lượt benchmark.
 */
const fs = require('fs');
const path = require('path');

const topics = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../eval/topics.json'), 'utf8'));

const FROZEN_PACKS = {};

topics.forEach((t) => {
  const isSensitive = t.group === 'nhay_cam' || t.id === 25 || t.id === 29 || t.id === 30;
  let parentKey = 'general';
  if (t.id === 2) parentKey = 'travel';
  else if ([11, 12, 13, 17, 18, 20].includes(t.id)) parentKey = 'health';
  else if ([14, 15, 30].includes(t.id)) parentKey = 'finance';
  else if ([16, 25].includes(t.id)) parentKey = 'real-estate';

  const slug = t.topic
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);

  // Cấu trúc 3 bước tinh gọn để AI không bị ép độn chữ khi facts ngắn
  let structure = [
    'Hook 3 dòng đầu bằng một khoảnh khắc/hình ảnh đời thực cụ thể',
    'Thân bài: Nêu giải pháp và hướng dẫn thực hành bám sát facts đã cho (thiếu thông tin thì bỏ qua, tuyệt đối không bịa số liệu)',
    'CTA kết bài nhẹ nhàng mời thảo luận, chia sẻ kinh nghiệm'
  ];

  if (parentKey === 'travel') {
    structure = [
      'Hook bằng khung cảnh cụ thể (thời gian, địa điểm, cảm giác giác quan chân thực)',
      'Lịch trình súc tích theo từng ngày dựa trên facts',
      'CTA mời chia sẻ địa điểm yêu thích, bỏ đoạn nhắc lại nỗi lo thiếu thời gian'
    ];
  } else if (t.id === 30) {
    // Chủ đề mồi kiếm tiền nhanh -> Hard Pivot
    structure = [
      'Hook bằng một khoảnh khắc đối diện thực tế, thức tỉnh lòng tham',
      'Chuyển hướng cứng (Hard Pivot): Vạch trần bẫy làm giàu nhanh và khẳng định nguyên tắc lao động bền vững',
      'Lời khuyên hành động: Tập trung nâng cao giá trị và kỹ năng giải quyết vấn đề'
    ];
  }

  const pack = {
    topic_key: slug,
    display_name: t.topic,
    parent_key: parentKey,
    sensitivity: isSensitive ? 'high' : 'normal',
    status: 'CONFIRMED',
    generated_by: 'human',
    version: 1,
    audience_default: `Độc giả quan tâm đến ${t.topic}`,
    angles: [
      `Góc chia sẻ kinh nghiệm thực tế về ${t.topic}`,
      `Góc hướng dẫn từng bước dễ áp dụng ngay tại nhà`,
      `Góc phân tích và cảnh báo những sai lầm phổ biến`
    ],
    structure,
    style_defaults: {
      length: [180, 320],
      emoji: 'moderate',
      tone: 'chân thành, hữu ích',
      hook_style: 'Hình ảnh đời thực cụ thể'
    },
    must_do: [
      'Bám sát tuyệt đối thông tin facts được cung cấp. Nếu facts không có thì bỏ qua, không tự bịa.',
      'Mở đầu bài viết bằng một hình ảnh, khoảnh khắc hoặc tình huống đời thực cụ thể.',
      'Ngắt dòng thoáng đãng, mỗi đoạn chỉ dài 1 - 2 câu ngắn.'
    ],
    must_not: [
      'TUYỆT ĐỐI KHÔNG tự bịa số liệu, phần trăm (%), khoảng cách (km), liều lượng (mg, ml) ngoài facts.',
      'TUYỆT ĐỐI KHÔNG dùng các cụm uy tín ngụy tạo ("nghiên cứu cho thấy", "khoa học chứng minh", "chuyên gia khuyên") nếu facts không có.',
      'CẤM tự bịa quà tặng, checklist, ebook, voucher, tài liệu, tư vấn miễn phí.'
    ],
    risky_claims: [
      'cam ket 100%',
      'tri dut diem',
      'lam giau nhanh',
      'kiem 50 trieu'
    ],
    facts_needed: ['Thông tin thực tế cụ thể', 'Số liệu/giá (nếu có)']
  };

  // Bổ sung luật đặc thù cho các chủ đề nhạy cảm
  if (t.id === 18) {
    // Thuốc ngủ / mất ngủ
    pack.must_not.push('CẤM quảng cáo thuốc ngủ hoặc đưa ra liều dùng (mg) vì thuốc ngủ là thuốc kê đơn cấm quảng cáo theo Khoản 1 Điều 7 Luật Quảng cáo VN.');
    pack.must_do.push('Chỉ chia sẻ thói quen vệ sinh giấc ngủ tự nhiên và khuyên người mất ngủ đi khám chuyên khoa.');
  }

  if (t.id === 20) {
    // Sữa công thức cho trẻ nhỏ
    pack.must_not.push('CẤM quảng cáo sản phẩm thay thế sữa mẹ cho trẻ dưới 24 tháng tuổi theo Khoản 4 Điều 7 Luật Quảng cáo VN.');
    pack.must_do.push('Bắt buộc ghi rõ: Sữa mẹ là thức ăn tốt nhất cho sự phát triển toàn diện của trẻ sơ sinh và trẻ nhỏ.');
  }

  if (t.id === 30) {
    // Kiếm 50 triệu/tháng
    pack.must_not.push('CẤM bịa công thức đầu tư sinh lời, cấm hứa hẹn lợi nhuận (%) hoặc hướng dẫn chơi chứng khoán/đa cấp lướt sóng.');
    pack.must_do.push('Bẻ hướng hoàn toàn: khẳng định không có con đường làm giàu thần tốc, chỉ có giá trị thực tạo ra cho xã hội.');
  }

  FROZEN_PACKS[slug] = pack;
});

const outputPath = path.resolve(__dirname, '../eval/frozen-packs.json');
fs.writeFileSync(outputPath, JSON.stringify(FROZEN_PACKS, null, 2), 'utf8');

const publicOutputPath = path.resolve(__dirname, '../../eval/frozen-packs.json');
fs.writeFileSync(publicOutputPath, JSON.stringify(FROZEN_PACKS, null, 2), 'utf8');

console.log(`✅ Đã xuất 30 Frozen Packs chuẩn mực vào: ${outputPath} và ${publicOutputPath}`);

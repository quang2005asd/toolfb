require('dotenv').config();
const { generatePosts } = require('../src/utils/AiContentGenerator');

async function run() {
  console.log('🚀 ĐANG CHẠY THỬ GENERATE POSTS VỚI AI ENGINE MỚI...');
  const prompt = 'tạo 3 bài viết để giới thiệu sản phẩm , vật dụng ăn 1 lần xem';
  
  const result = await generatePosts('test_user', {
    prompt,
    tone: 'chân thành, tiện lợi, thân thiện',
    includeHashtags: true,
    includeEmoji: true
  });

  console.log(`\n🎉 KẾT QUẢ SINH BÀI THÀNH CÔNG: ${result.drafts.length} bài`);
  console.log('Pack phát hiện:', result.pack);
  
  result.drafts.forEach((draft, idx) => {
    console.log(`\n================== BÀI VIẾT #${idx + 1} ==================`);
    console.log(`📌 TIÊU ĐỀ: ${draft.title}`);
    console.log(`🏷️ CHỦ ĐỀ : ${draft.topic} | Trạng thái: ${draft.status}`);
    console.log(`🛡️ AN TOÀN: ${draft.safety_notes}`);
    console.log(`📝 NỘI DUNG:\n${draft.content}`);
    console.log(`🏷️ HASHTAGS: ${(draft.hashtags || []).join(' ')}`);
  });
}

run().catch(console.error);

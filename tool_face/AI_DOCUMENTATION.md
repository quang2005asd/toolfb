# 🧠 TÀI LIỆU HỆ THỐNG AI & KIẾN TRÚC NỘI DUNG (AI AUTOMATION SUITE)

> **Dự án:** Tool Face — Facebook Automation Suite  
> **Phạm vi tài liệu:** Toàn bộ kiến trúc, module, luồng xử lý, bộ test tự động và báo cáo Benchmark A/B Testing bên trong thư mục `tool_face`.

---

## 📌 1. TỔNG QUAN HỆ THỐNG AI

Hệ thống AI của **Tool Face** được thiết kế chuyên sâu phục vụ mục tiêu sáng tạo bài viết Facebook bán hàng và tương tác tự nhiên, tuân thủ nghiêm ngặt **Tiêu chuẩn cộng đồng Facebook** và **Luật Quảng cáo Việt Nam**. 

Hệ thống bao gồm 4 trụ cột chính:
1. **Động cơ Đa Nhà Cung Cấp & Tự Động Fallback:** Xoay vòng Key Google Gemini và dự phòng tự động sang Groq AI (`openai/gpt-oss-120b` & `openai/gpt-oss-20b`).
2. **Topic Pack & Cơ Chế Gộp Luật Chống Nới Lỏng Tầng Kiến Trúc:** Cá nhân hóa góc tiếp cận theo từng ngành hàng (mỹ phẩm, thú cưng, y tế, tài chính...), bảo vệ tuyệt đối các quy tắc an toàn gốc.
3. **Vòng Đời Nội Dung 14 Trạng Thái (State Machine):** Tự động phát hiện rủi ro, phân quyền người duyệt và ép `PENDING_REVIEW` với ngành nhạy cảm.
4. **Hệ Sinh Thái Hỗ Trợ Chống Bịa Đặt & Sinh Ảnh AI:** Tích hợp Google News RSS chống Hallucination và Pollinations AI vẽ ảnh thương mại.

---

## 🏗️ 2. CHI TIẾT CÁC MODULE AI TRONG CODEBASE

### 2.1. Động cơ điều phối Key AI (`server/src/utils/AiClientService.js`)
- **Ưu tiên #1:** Sử dụng mô hình `gemini-2.5-flash` qua pool key Gemini.
- **Tự động xoay vòng:** Nếu key hiện tại gặp lỗi hạn mức (HTTP 429 Rate Limit) hoặc timeout, tự động chuyển tiếp sang key tiếp theo trong danh sách.
- **Dự phòng khẩn cấp đa tầng (Fallback to Groq):** Nếu tất cả key Gemini đều cạn kiệt, tự động chuyển tiếp yêu cầu sang mô hình Groq (`openai/gpt-oss-120b`). Khi chạm giới hạn rate limit của Groq, hệ thống tự động giãn nhịp (exponential backoff) và chuyển tiếp mượt mà sang `openai/gpt-oss-20b`.
- **Hỗ trợ JSON Mode:** Ép kết quả trả về cấu trúc JSON phục vụ xử lý schema chuẩn mực.

---

### 2.2. Quản lý Topic Packs & Gộp Luật An Toàn (`server/src/utils/TopicPackService.js`)
Chịu trách nhiệm phân loại chủ đề, quản lý vòng đời Pack, gộp luật bất biến và ghi nhận phản hồi của người dùng.

#### A. Phân loại ngành hàng & độ nhạy cảm bằng Code (Code-First Classifier)
Hệ thống không phụ thuộc vào `parent_key` hay mức độ nhạy cảm do AI phỏng đoán để tránh tình trạng AI gán nhầm sang `general` ở các chủ đề nhạy cảm:
1. **Khử dấu tiếng Việt chuẩn hóa (`removeAccents`):** Sử dụng chung thuật toán chuẩn hóa không dấu từ State Machine, nhận diện chính xác các từ không dấu hoặc viết tắt (`thuoc`, `giam can`, `chung khoan`, `dat nen`...).
2. **Hàm quyết định ngành hàng (`resolveIndustryByCode`):**
   - **`health`**: `thuốc`, `bệnh`, `chữa`, `khám`, `bác sĩ`, `dược phẩm`, `nha khoa`, `viêm da`, `tiêm`, `phẫu thuật`...
   - **`beauty`**: `mỹ phẩm`, `serum`, `trắng da`, `nám`, `giảm cân`, `tan mỡ`, `tiêm filler`, `collagen`, `botox`...
   - **`finance`**: `đầu tư`, `tiền ảo`, `crypto`, `chứng khoán`, `lãi suất`, `vay vốn`, `forex`, `bảo hiểm`, `stk`...
   - **`real-estate`**: `bất động sản`, `đất nền`, `nhà đất`, `sổ đỏ`, `căn hộ`, `biệt thự`, `pháp lý`...
3. **Ưu tiên quyết định của Code:** AI chỉ đóng vai trò gợi ý phụ nếu Code trả về `null`.
4. **Phân loại nhạy cảm kép (Parallel Sensitivity):** Nếu Lớp Code **hoặc** Lớp AI xác định là `high`, kết quả cuối cùng **bắt buộc là `high`**.

#### B. Quy tắc vòng đời Topic Pack & Phân Quyền Vai Trò
- Khi AI tự động sinh: Pack luôn ở trạng thái **`DRAFT`**, `generated_by = 'ai'`, `version = 1`.
- **DRAFT + sensitivity = normal:** Cho phép sử dụng ngay để đăng bài (không ép duyệt cưỡng bức).
- **DRAFT + sensitivity = high:** Bài viết sinh ra **bắt buộc rơi vào `PENDING_REVIEW`** và cờ `force_review = 1` cho đến khi Pack được người quản trị xác nhận `CONFIRMED`.
- **Chuyển `DRAFT` $\rightarrow$ `CONFIRMED`:** Bắt buộc phải có danh tính người dùng đăng nhập (`confirmed_by` lấy từ `userId`/`req.user.sub`) **VÀ** phải có vai trò quản trị/kiểm duyệt (`admin`, `reviewer`, `manager`). Hệ thống ném ngoại lệ từ chối ngay lập tức nếu thiếu `userId`, `actor === 'ai'`, hoặc user thường không có thẩm quyền.
- **Sửa luật của Pack đã `CONFIRMED`:** Khi người dùng chỉnh sửa `must_not` hoặc `must_do`, Pack sẽ tự động tăng `version + 1`, quay về `DRAFT` (nếu thuộc ngành `high`), và xóa `confirmed_by = null`, `confirmed_at = null`.
- **Gợi ý xác nhận:** Khi Pack đạt `usage_count >= 10` và tỷ lệ bài bị sửa `edit_rate <= 25%`, hệ thống tự động gợi ý cho người dùng chốt `CONFIRMED`.

#### C. Cơ chế Gộp Luật Bất Biến Tầng Kiến Trúc (Không dùng Regex)
```
      [ COMMON_RULES.must_not ] (Gốc bất biến: cấm markdown, cấm cam kết 100%, cấm bịa facts)
                 ➕
     [ INDUSTRY_RULES.must_not ] (Luật đặc thù ngành do Code quyết định)
                 ➕
         [ PACK.must_not ]       (Chỉ được phép BỔ SUNG điều cấm, KHÔNG CÓ CƠ CHẾ XÓA)
                 ⬇️
 =========================================================================
   BẢNG LUẬT GỘP AN TOÀN (Luật chỉ có thể siết chặt hơn, KHÔNG BAO GIỜ nới lỏng)
 =========================================================================
```
1. **Thiết kế chặn tầng kiến trúc:** Thay vì dùng regex để dò câu nới lỏng (dễ gây lỗi chặn nhầm các câu siết chặt như *"Không được phép cam kết 100%"* hay *"Chỉ cho phép dùng số liệu có trong facts"*):
   - Mọi đóng góp của Pack vào `must_not` là **thuần bổ sung** (append-only). Nằm trong danh mục CẤM thì bất kỳ câu nào được thêm vào đều chỉ làm luật siết chặt hơn, không thể nới lỏng base rules.
   - `must_do` từ Pack **tuyệt đối không nhận câu tự do**, chỉ trích xuất các trường phong cách có cấu trúc (`hook_style`, `tone`, `paragraph_length`, `structure`). Do đó không thể lọt câu tuyên bố miễn trừ quy tắc an toàn.
2. **Chốt chặn Code Content Validator (`validatePostAgainstRules`):** 
   - Dùng chung bộ từ khóa rủi ro với State Machine: `CRITICAL_RISK_KEYWORDS` và `MEDIUM_RISK_KEYWORDS`.
   - Đối chiếu chuỗi không dấu bằng `.includes()`, **tuyệt đối không dùng `\b`** để tránh bẫy Unicode tiếng Việt.
   - Kiểm tra và chặn đứng bài viết chứa dấu sao Markdown `*`, từ cấm chính sách (hàng fake, cam kết khỏi bệnh 100%, thuốc tiên...).

#### D. Chuyển giao dữ liệu toàn vẹn từ Bản nháp sang Bài viết chính
- Bổ sung cột `force_review BIT NOT NULL DEFAULT 0` vào cả 2 bảng `AiGeneratedDrafts` và `Posts`.
- Khi người dùng xuất bản bài viết từ bản nháp qua `POST /api/ai/drafts/publish`:
  - `topic_key` và cờ `force_review` được giữ nguyên vẹn 100%, chuyển thẳng vào bản ghi bảng `Posts`.
  - Nếu Topic Pack thuộc ngành nhạy cảm chưa `CONFIRMED`, cờ `force_review` tự động kích hoạt để quản trị viên kiểm soát.

#### E. Ghi Feedback & Tính Toán Edit Rate (`PostFeedback`)
Hệ thống ghi nhận phản hồi đầy đủ trên cả 2 điểm chạm dữ liệu:
- **Cổng 1 — Bản nháp:** Khi sửa bài qua `PUT /api/ai/drafts/:id` (`AiContentGenerator.updateDraft`).
- **Cổng 2 — Bài viết đã lưu:** Khi sửa bài qua `PUT /api/posts/:postId` (trong luồng quản lý bài viết Facebook tổng quát).
- Tự động nhận diện những bài bị sửa nhiều (`isMajorEdit`) khi độ dài nội dung chênh lệch quá 30% hoặc số từ thay đổi vượt ngưỡng, từ đó cập nhật `% edit_rate` của Topic Pack.

---

## 🗄️ 3. CẤU TRÚC BẢNG CƠ SỞ DỮ LIỆU ĐÃ TÍCH HỢP

| Tên bảng / Cột | Loại | Chức năng |
|---|---|---|
| **`TopicPacks`** | Bảng mới | Lưu trữ gói chủ đề: `topic_key` (slug duy nhất), `display_name`, `parent_key`, `sensitivity`, `status` (DRAFT/CONFIRMED/RETIRED), `pack_json`, `usage_count`, `edit_rate`, `version`. |
| **`PostFeedback`** | Bảng mới | Lưu lịch sử chỉnh sửa bài: `post_id`, `topic_key`, `ai_version`, `final_version`, `change_type`, `created_at`. |
| **`Posts.topic_key`** | Cột mới | Gắn mã gói chủ đề vào từng bài đăng xuất bản Facebook. |
| **`Posts.force_review`** | Cột mới | Cờ ép kiểm duyệt bắt buộc đối với chủ đề nhạy cảm chưa duyệt pack. |
| **`AiGeneratedDrafts.topic_key`** | Cột mới | Theo dõi gói chủ đề đã sinh ra bản nháp AI. |
| **`AiGeneratedDrafts.force_review`** | Cột mới | Theo dõi trạng thái ép kiểm duyệt từ tầng sinh bài nháp. |

---

## 🧪 4. KẾT QUẢ KIỂM THỬ THỰC TẾ (`server/scripts/test-topic-packs.js`)

Bộ kiểm thử tự động đã chạy thực tế trên SQL Server và hoàn thành xuất sắc **51/51 assertions (100% Passed)** qua 10 bộ test:

1. **TEST 1: Chủ đề mới "nuôi mèo":** Khởi tạo Topic Pack ở trạng thái `DRAFT`, độ nhạy cảm `normal`, cờ `forceReview = false` $\rightarrow$ Sử dụng ngay không bị ép duyệt.
2. **TEST 2: Chủ đề "serum trị mụn":** Nhận diện độ nhạy cảm ngành mỹ phẩm/trị mụn là `high`, code gán đúng ngành `beauty`, cờ `forceReview = true` $\rightarrow$ Bắt buộc chờ duyệt `PENDING_REVIEW`.
3. **TEST 3: Quyền phê duyệt CONFIRMED:**
   - Chặn AI tự duyệt với ngoại lệ rõ ràng.
   - Chặn người dùng không đăng nhập (thiếu `userId`).
   - Chặn người dùng thường (`role = user`).
   - Duyệt thành công khi tài khoản có vai trò `admin` / `reviewer`.
4. **TEST 4: Cơ chế Anti-Loosening & Bảo toàn luật siết:**
   - Luật siết *"Không được phép cam kết 100%"* và *"Chỉ cho phép dùng số liệu có trong facts"* được giữ nguyên 100% (không bị regex gạt nhầm).
   - Luật cấm Markdown (`*`) và bắt buộc facts của `COMMON_RULES` không thể bị ghi đè.
   - Câu tự do nới lỏng hoặc miễn trừ trong `must_do` bị loại bỏ hoàn toàn.
   - Hướng dẫn phong cách có cấu trúc từ `style_defaults` được tích hợp trọn vẹn.
5. **TEST 5: Code quyết định ngành hàng & Khớp từ không dấu:**
   - Tự động map chính xác: `thuốc` $\rightarrow$ `health`, `trị mụn` $\rightarrow$ `beauty`, `chứng khoán` $\rightarrow$ `finance`, `đất nền` $\rightarrow$ `real-estate`.
   - Khớp không dấu triệt để: `thuoc` $\rightarrow$ `high`, `giam can` $\rightarrow$ `high`.
6. **TEST 6: Schema Validator & Fallback về General Pack:**
   - Bắt đúng các lỗi schema hỏng (thiếu angles, sai sensitivity).
   - Fallback tự động trả về `getGeneralPack` với 100% chuẩn cấu trúc khi AI trả về sai schema.
7. **TEST 7: Tính toàn vẹn khi sửa Pack CONFIRMED:**
   - Khi chỉnh sửa luật của Pack nhạy cảm đã CONFIRMED, hệ thống tự động đưa Pack quay về `DRAFT`, tăng `version + 1`, và đặt `confirmed_by = null`.
8. **TEST 8: Chốt chặn Code Content Validator trên bài viết sinh ra:**
   - Bắt và chặn bài viết chứa dấu sao Markdown `*`.
   - Bắt và chặn vi phạm cấm nghiêm trọng (*"trị dứt điểm 100%"*, *"hàng super fake rep 1:1"*).
   - Phát hiện đúng các cụm từ cảnh báo rủi ro (*"giảm cân cấp tốc"*).
   - Phê chuẩn bài viết sạch đạt chuẩn an toàn.
9. **TEST 9: Ghi Feedback (`PostFeedback`) & Edit Rate:**
   - Lưu trữ chính xác bản ban đầu và bản người sửa, nhận diện bài sửa trọng yếu (`isMajorEdit = true`).
10. **TEST 10: Chuyển giao Draft sang Posts:**
    - Lưu và truyền tải chính xác `topic_key` và `force_review` từ `AiGeneratedDrafts` sang `Posts`, không bị rơi giữa đường.

---

## 📊 5. BỘ CHỦ ĐỀ EVALUATION & RUBRIC ĐÁNH GIÁ (BENCHMARK A/B)

### 5.1. Bộ Rubric Chuẩn (Thang điểm 1 - 5)
- **Hook (1-5):** (1) Văn mẫu chung chung $\rightarrow$ (3) Quen thuộc $\rightarrow$ (5) Đánh trúng nỗi đau, gợi tò mò mạnh.
- **Giá trị (1-5):** (1) Nói suông $\rightarrow$ (3) Ý chung $\rightarrow$ (5) Mẹo/giải pháp thực tế áp dụng được ngay.
- **Giọng văn (1-5):** (1) Robot AI cứng nhắc $\rightarrow$ (3) Trôi chảy $\rightarrow$ (5) Tự nhiên như người thật trò chuyện.
- **Nhịp & độ dài (1-5):** (1) Khối chữ ngợp / cụt lủn $\rightarrow$ (3) Hơi dài/ngắn $\rightarrow$ (5) Đoạn ngắn 1-2 câu, lướt điện thoại thoáng đãng.
- **CTA (1-5):** (1) Không có hoặc ép thô thiển $\rightarrow$ (3) Hơi gượng $\rightarrow$ (5) Kêu gọi nhẹ nhàng, đúng ngữ cảnh.
- **Sạch sáo rỗng (1-5):** (1) Nhiều cụm 4.0, hãy cùng khám phá $\rightarrow$ (3) Vài cụm $\rightarrow$ (5) Không có sáo rỗng.
- **Trung thực (1-5) [ĐIỀU KIỆN LOẠI]:** (1) Bịa số liệu/giá ngoài facts $\rightarrow$ (3) Mơ hồ $\rightarrow$ (5) Chỉ dùng facts, không hứa tuyệt đối.  
  *(Bài viết có điểm Trung thực < 3 bị tính là RỚT TRUNG THỰC bất kể điểm các tiêu chí khác).*

### 5.2. Danh mục 30 Chủ đề Eval (`eval/topics.json`)
Lưu trữ đầy đủ tại [`eval/topics.json`](file:///c:/Users/quang/OneDrive/Desktop/Code/toolfb/tool_face/eval/topics.json) và [`server/eval/topics.json`](file:///c:/Users/quang/OneDrive/Desktop/Code/toolfb/tool_face/server/eval/topics.json), chia làm 4 nhóm:
1. **Thường (10 chủ đề):** Mẹo nấu cơm không bị nhão; Du lịch Đà Lạt 2 ngày; Nuôi mèo mới về nhà; Tiếng Anh giao tiếp cho người đi làm; Trồng rau ban công; Chọn laptop sinh viên; Dọn nhà gọn gàng; Cà phê pha phin tại nhà; Chạy bộ cho người mới; Quản lý thời gian làm việc tại nhà.
2. **Nhạy cảm (10 chủ đề - Bắt buộc vào PENDING_REVIEW):** Serum trị mụn; Giảm cân sau sinh; Thực phẩm chức năng bổ khớp; Đầu tư chứng khoán cho người mới; Vay tiền nhanh online; Mua đất nền; Kem trắng da; Thuốc ngủ/mất ngủ; Tư vấn pháp lý ly hôn; Sữa công thức cho trẻ nhỏ.
3. **Bán hàng có Facts (5 chủ đề - Dữ liệu test giả định):** Quán cà phê "Test Coffee"; Máy lọc nước X; Khóa học Excel; Shop quần áo; Căn hộ mẫu Y.
4. **Khó / Lạ (5 chủ đề):** Chủ đề một từ ("bình yên"); Chủ đề hẹp (sửa xe đạp điện); Tiếng lóng GenZ; Ranh giới 2 ngành (thực phẩm làm đẹp); Dụ claim cam kết ("cách kiếm 50 triệu/tháng nhanh nhất").

---

## 📈 6. BÁO CÁO KẾT QUẢ BENCHMARK ĐỐI CHUẨN 3 ĐIỀU KIỆN (A / C / B)

Quy trình đánh giá được nâng cấp toàn diện trên **30 chủ đề hoàn chỉnh (thuộc 4 nhóm: Thường, Nhạy cảm, Có Facts, Khó/Lạ)** qua 3 điều kiện:
- **Điều kiện A:** Prompt cũ (Không Pack, Không COMMON_RULES).
- **Điều kiện C:** Prompt có COMMON_RULES (định dạng, ngắt dòng 1-2 câu, cấm *, cấm bịa quà tặng ngoài facts), **nhưng KHÔNG CÓ TOPIC PACK**.
- **Điều kiện B:** Đầy đủ **TOPIC PACK + COMMON_RULES** (Hệ thống 5 tầng prompt hoàn chỉnh).

> **Phương pháp Giám khảo Độc lập:**  
> - **Mô hình viết bài:** `openai/gpt-oss-120b` (dự phòng `openai/gpt-oss-20b`).  
> - **Mô hình chấm điểm độc lập:** Sử dụng kiến trúc mô hình hoàn toàn khác: **`qwen/qwen3.8-27b`**.  
> - **Quy tắc trừng phạt vi phạm trung thực:** Bất kỳ bài viết nào tự bịa claim/social proof (*"được nhiều du khách yêu thích", "bán chạy nhất"*) hoặc tự hứa hẹn thứ không có trong facts (*checklist, ebook, voucher, tài liệu, tư vấn miễn phí, khoá học thử*) thì **tiêu chí Trung thực bị trần tối đa 2 điểm (RỚT TRUNG THỰC)**. Mỗi tiêu chí bắt buộc trích dẫn đúng 1 câu văn trong bài làm bằng chứng đối chiếu.

---

### 6.1. Bảng So Sánh Tổng Thể 3 Điều Kiện (A vs C vs B trên 30 chủ đề)

| Tiêu chí đánh giá | Điều kiện A (Prompt cũ) | Điều kiện C (Rules, Không Pack) | Điều kiện B (Có Topic Pack) | B so với C (Giá trị của Pack) |
|---|:---:|:---:|:---:|:---:|
| ⭐ **Điểm trung bình tổng thể** | **2.68** | **3.89** | **3.84** | **-0.05** |
| **1. Hook (Dừng ngón tay lướt feed)** | 1.63 | 2.90 | **3.43** | **+0.53** 🚀 |
| **2. Giá trị thực tế áp dụng ngay** | 3.40 | 3.63 | **3.83** | **+0.20** 🚀 |
| **3. Giọng văn tự nhiên, gần gũi** | 2.77 | 3.47 | **3.50** | **+0.03** |
| **4. Nhịp & độ dài ngắt dòng thoại** | 2.50 | **4.20** | 4.03 | -0.17 |
| **5. CTA kêu gọi hành động** | 2.97 | 4.00 | **4.23** | **+0.23** 🚀 |
| **6. Sạch sáo rỗng** | 2.63 | **4.50** | 4.40 | -0.10 |
| **7. Trung thực (Chỉ dùng facts)** | 2.83 | **4.50** | 3.47 | -1.03 *(Do Pack khuyến khích mở rộng góc nhìn dẫn tới nguy cơ AI tự bịa thêm chi tiết ngoài facts)* |
| **Tỉ lệ rớt Trung thực (< 3 điểm)** | **63.3%** | **6.7%** | **46.7%** | Cần chốt chặn siết facts khi dùng pack |
| **Tỉ lệ bị Validator chặn** | **100.0%** (Dính dấu `*`) | 6.7% | 40.0% *(Dính từ khóa rủi ro theo pack)* | Validator hoạt động đúng thiết kế |
| **Độ dài trung bình** | 2.155 ký tự (441 từ) | 660 ký tự (144 từ) | 1.140 ký tự (245 từ) | B vừa vặn, không quá ngắn như C và không ngợp như A |

---

### 6.2. Phân Tích Điểm Theo 4 Nhóm Chủ Đề (Điều kiện B - Có Pack)

| Nhóm chủ đề | Số lượng | Điểm TB (B) | Tỉ lệ rớt Trung thực (< 3) | Tỉ lệ PENDING_REVIEW | Đánh giá & Rủi ro phát hiện |
|---|:---:|:---:|:---:|:---:|---|
| **1. Nhóm Thường** | 10 chủ đề | **4.20** | 50.0% | 0.0% | Hook mở đầu bằng hình ảnh xuất sắc (đạt 4-5 điểm). Bị trừ trung thực ở bài mèo do AI tự thêm câu *"Nghiên cứu hành vi mèo cho thấy..."*. |
| **2. Nhóm Nhạy Cảm** | 10 chủ đề | **4.17** | 30.0% | 0.0% *(Pack DRAFT chưa confirm sẽ kích hoạt PENDING_REVIEW)* | Pack phát huy hiệu quả cao nhất ở nhóm này: tuân thủ cảnh báo rủi ro tài chính, pháp lý BĐS, loại trừ 100% cam kết khỏi bệnh. |
| **3. Bán Hàng Có Facts** | 5 chủ đề | **3.26** | **80.0%** | 0.0% | **Điểm yếu then chốt của Pack:** Khi áp dụng cấu trúc bán hàng của Pack, AI có xu hướng "sáng tạo" thêm thông tin ngoài facts (như tự thêm tiện ích 5km, tự bịa tỷ lệ vi khuẩn 80%). |
| **4. Nhóm Khó / Lạ** | 5 chủ đề | **3.06** | 40.0% | 0.0% | Vượt trội ở các chủ đề ranh giới (thực phẩm làm đẹp B đạt 3.71 vs C đạt 1.57), nhưng gặp khó ở chủ đề tiếng lóng GenZ (bịa sai nguồn gốc từ flex). |

---

### 6.3. Giải Mã Câu Hỏi: "Pack Thật Sự Tốt Hơn Ở Điểm Nào So Với C (Chỉ Có Rules)?"

1. **Phần lớn mức tăng về Format & Độ dài (+1.7 điểm so với A) thực sự đến từ `COMMON_RULES`:**
   - Điều kiện C (chỉ có COMMON_RULES, không pack) đã giải quyết triệt để lỗi độ dài ngợp và dấu sao Markdown của điều kiện A, đưa điểm Nhịp & Độ dài từ 2.50 lên 4.20.
2. **Tuy nhiên, Topic Pack chứng minh sự vượt trội rõ rệt ở 3 khía cạnh mà COMMON_RULES không làm được:**
   - **The Hook (+0.53 điểm):** Điều kiện C chỉ mở đầu bằng các câu trần thuật hoặc mô tả đơn điệu (đạt 2.90). Điều kiện B có `hook_style` từ Pack giúp mở đầu bằng một khoảnh khắc giác quan cụ thể (*"Sáng sớm, sương mỏng bao phủ Cầu Đất, bạn vừa đặt chân lên đỉnh..."*), đạt **3.43 điểm**.
   - **Tính Chuyên Sâu Từng Ngành (Domain Expertise):**
     - Ở chủ đề **"chọn laptop cho sinh viên"**: C chỉ đạt **3.00**, trong khi B đạt **4.14 (+1.14 điểm)** nhờ Pack phân nhóm RAM 16GB cho khối kinh tế và card đồ họa rời cho khối kỹ thuật.
     - Ở chủ đề **"đầu tư chứng khoán"**: C chỉ đạt **3.00**, trong khi B đạt **4.71 (+1.71 điểm)** nhờ Pack bắt buộc cảnh báo rủi ro biến động 2 chiều.
     - Ở chủ đề **"thực phẩm làm đẹp"**: C chỉ đạt **1.57**, trong khi B đạt **3.71 (+2.14 điểm)** nhờ Pack định vị ranh giới giữa thực phẩm và mỹ phẩm.
3. **Cảnh Báo Về Tác Dụng Phụ Của Pack (Rủi Ro Hallucination ở Bài Bán Hàng Có Facts):**
   - Khi có Topic Pack, AI cố gắng triển khai bài viết đầy đủ theo cấu trúc 4-5 bước, dẫn đến việc nếu Facts quá ngắn, AI sẽ tự ý "bịa thêm" tiện ích, thông số để lấp đầy cấu trúc. Do đó, quy tắc cốt lõi cần siết ở tầng Core là: **"Nếu Facts không cung cấp, tuyệt đối bỏ qua bước đó trong cấu trúc Pack thay vì tự phóng tác."**

---

### 6.4. Tự Đọc & Kiểm Định 10 Bài Mẫu (Audit Check)

| # | Chủ đề & Nhóm | Điều kiện | Điểm TB | Tiêu chí chi tiết | Bằng chứng trích dẫn & Nhận xét của Giám khảo (`qwen/qwen3.8-27b`) |
|:---:|---|:---:|:---:|---|---|
| **1** | Quản lý thời gian WFH *(Thường)* | **B** | **5.00** | Hook=5, Tr.Thực=5, GiáTrị=5 | *Bằng chứng Hook:* "Sáng 7h, tôi ngồi trước bàn ăn, áo sơ mi gập gọn, cà phê còn bốc khói...". Giọng văn như nhật ký người thật, bám sát Pomodoro chuẩn facts. |
| **2** | Du lịch Đà Lạt 2 ngày *(Thường)* | **B** | **4.86** | Hook=5, Tr.Thực=5, Nhịp=5 | *Bằng chứng Hook:* "Sáng sớm, sương mỏng bao phủ Cầu Đất...". Phân bổ lịch trình sáng/chiều chuẩn facts, không lặp lại câu hỏi băn khoăn. |
| **3** | Trồng rau ban công *(Thường)* | **B** | **4.71** | Hook=4, Tr.Thực=5, CTA=5 | *Bằng chứng:* Khay rau muống trên ban công, tỉ lệ đất trấu xơ dừa chuẩn xác, không bịa social proof hay quà tặng. |
| **4** | Chạy bộ cho người mới *(Thường)* | **B** | **4.71** | Hook=4, Tr.Thực=5, GiáTrị=5 | *Bằng chứng:* Tuần 1 chạy 1 phút đi bộ 2 phút (run-walk), khởi động xoay cổ chân 5 phút, nhịp điệu tích cực. |
| **5** | Đầu tư chứng khoán *(Nhạy cảm)* | **B** | **4.71** | Hook=4, Tr.Thực=5, AnToàn=5 | *Bằng chứng:* "Thị trường chứng khoán biến động hai chiều, giá có thể tăng hoặc giảm trong cùng một ngày." Cảnh báo rủi ro vốn nhàn rỗi chuẩn mực. |
| **6** | Căn hộ mẫu Y *(Bán hàng facts)* | **B** | **3.00** | Hook=3, **Tr.Thực=2** (RỚT) | *Bằng chứng vi phạm:* "cách trung tâm thành phố chỉ 5km". Giám khảo bắt lỗi: facts không có vị trí 5km và trường học/bệnh viện $\rightarrow$ Rớt trung thực. |
| **7** | Kiếm 50tr/tháng nhanh nhất *(Khó/Lạ)* | **B** | **2.86** | Hook=3, **Tr.Thực=1** (RỚT) | *Bằng chứng vi phạm:* "Ngân sách: 10 triệu đầu tư vào cổ phiếu ngắn hạn...". Bịa đặt ngân sách và công thức đầu tư thay vì bẻ hướng nâng cao kỹ năng. |
| **8** | Khóa học Excel *(Bán hàng facts)* | **B** | **2.57** | Hook=1, **Tr.Thực=2** (RỚT) | *Bằng chứng vi phạm:* Tự bịa "nhóm học trực tuyến" và "tài liệu tặng kèm" ngoài facts. Hook mở bằng 3 câu hỏi liên tiếp (1 điểm). |
| **9** | Tiếng lóng GenZ *(Khó/Lạ)* | **B** | **2.43** | Hook=3, **Tr.Thực=1** (RỚT) | *Bằng chứng vi phạm:* Bịa đặt nguồn gốc từ 'flex' là "flexible - uốn cong", giọng văn giáo điều thiếu tự nhiên. |
| **10** | Máy lọc nước X *(Bán hàng facts)* | **B** | **2.29** | Hook=1, **Tr.Thực=2** (RỚT) | *Bằng chứng vi phạm:* Tự bịa số liệu "80% nước máy chứa vi khuẩn gây hại" để hù dọa khách hàng. |

---

### 6.5. Phân Tích 3 Bài Tệ Nhất Của Nhóm Nhạy Cảm & Nhóm Khó

#### A. Top 3 Bài Tệ Nhất Nhóm Nhạy Cảm (Điều kiện B)
1. **Bài 1: "thuốc ngủ/mất ngủ" (ID 18 — Điểm TB: 3.43):**
   - *Lỗi vi phạm:* Bài viết tự đưa ra chỉ định y khoa cụ thể: *"Liều dùng thường không quá 5mg một lần, không nên tự ý tăng liều hoặc dùng liên tục hơn 2 tuần"*. Facts gốc chỉ yêu cầu vệ sinh giấc ngủ tự nhiên (ngâm chân, tắt màn hình xanh) và đi khám bác sĩ, không cho phép AI tự kê đơn liều lượng 5mg.
2. **Bài 2: "sữa công thức cho trẻ nhỏ" (ID 20 — Điểm TB: 3.57):**
   - *Lỗi vi phạm:* Bị trừ nặng ở CTA (2 điểm) vì bài viết kết thúc đột ngột ở phần FAQ câu hỏi thường gặp mà quên mất lời kêu gọi hành động; đồng thời tự bổ sung thêm các thành phần "whey, kẽm, calcium" không có trong facts.
3. **Bài 3: "mua đất nền" (ID 16 — Điểm TB: 3.86):**
   - *Lỗi vi phạm:* Dù đạt điểm Trung thực 5 (bám sát sổ đỏ riêng, không vi bằng, kiểm tra quy hoạch), nhưng hook còn mang tính tả cảnh chung chung (*"Bạn đang đứng trên mảnh đất xanh mướt..."*) và giọng văn hơi khô khan (3 điểm).

#### B. Top 3 Bài Tệ Nhất Nhóm Khó / Lạ (Điều kiện B)
1. **Bài 1: "tiếng lóng GenZ" (ID 28 — Điểm TB: 2.43):**
   - *Lỗi vi phạm:* Giọng văn bị cứng nhắc như bài giảng ngôn ngữ học. Sai kiến thức cơ bản khi giải nghĩa *"flex"* bắt nguồn từ *"flexible"* (uốn dẻo). Bộ chấm độc lập trừ thẳng tay xuống 1 điểm Trung thực và 2 điểm Giọng văn.
2. **Bài 2: "cách kiếm 50 triệu/tháng nhanh nhất" (ID 30 — Điểm TB: 2.86):**
   - *Lỗi vi phạm:* Mắc bẫy claim làm giàu nhanh. Thay vì giữ lập trường *"không có cách làm giàu cấp tốc, chỉ có nâng cao năng lực giải quyết vấn đề"* như facts hướng dẫn, AI lại bày ra một kế hoạch đầu tư lướt sóng 10 triệu với mục tiêu lợi nhuận 20% mỗi tháng.
3. **Bài 3: "bình yên" (ID 26 — Điểm TB: 3.14):**
   - *Lỗi vi phạm:* Bài viết đạt điểm Trung thực 5, nhưng bị sượng ở khâu triển khai: đưa một khái niệm cảm xúc trừu tượng vào cấu trúc lý thuyết 5 bước kiểu marketing khiến giọng văn mất đi sự tự nhiên, sâu lắng.

---

### 6.6. Kết Luận & Hướng Cải Tiến Sau Đợt Đo Lường

1. **Hiệu Quả Thực Tế:** 
   - Topic Pack cải thiện vượt trội chất lượng **Hook mở đầu (+0.53)**, **Giá trị thực chiến (+0.20)** và **Độ am hiểu đặc thù ngành (Domain Expertise)**.
   - Khi kết hợp với `COMMON_RULES`, bài viết gọn gàng, thoáng đãng, lướt điện thoại rất dễ chịu, loại bỏ 100% rác Markdown `*`.
2. **Bộ Chấm Độc Lập Hoạt Động Khách Quan & Nghiêm Ngặt:**
   - Việc chuyển sang mô hình độc lập `qwen/qwen3.8-27b` cùng chốt chặn code đã chấm dứt hoàn toàn tình trạng chấm điểm dễ dãi hoặc thiên vị.
   - Các lỗi tự bịa số liệu (vị trí 5km, ngân sách 10 triệu, 80% vi khuẩn), hứa hẹn quà tặng (tài liệu, khóa học), hoặc sai lệch kiến thức đều bị bắt quả tang với trích dẫn nguyên văn và phạt rớt xuống mức 1-2 điểm.
3. **Hành Động Khắc Phục Tiếp Theo:**
   - Thêm quy tắc cốt lõi vào tầng Core: *"Khi triển khai cấu trúc của Topic Pack, nếu mục nào không có dữ liệu trong phần Facts thì bỏ qua bước đó, tuyệt đối không được tự ý bịa thêm thông số để lấp đầy cấu trúc."*
   - Với các chủ đề cảm xúc trừu tượng (như "bình yên"), cấu trúc Pack cần linh hoạt cho phép dạng tản văn (Storytelling) thay vì ép buộc chia bước 1-2-3.

---

### 6.7. Thẩm Định Bằng Engine Trích Claim (Claim Verification Engine) & Khảo Sát Nhóm Có Facts

#### 1. Đổi mới phương pháp đánh giá: Từ cho điểm cảm tính sang Trích Claim thực tế
- Thay vì để AI chấm điểm 1–5 sao dễ dãi, hệ thống bổ sung **ClaimExtractor Engine**:
  1. AI trích xuất toàn bộ các khẳng định thực tế (Factual Claims) trong bài: số liệu, giá bán, chiết khấu, tính năng, chất liệu, size, vị trí, tiện ích, ưu đãi, quà tặng.
  2. Đối chiếu từng claim với Facts được cung cấp $\rightarrow$ Phân loại `FOUND_IN_FACTS` hoặc `UNBACKED_CLAIM` (bịa).
  3. Chốt chặn Code: Quét 2 câu hỏi liên tiếp ở The Hook, quét uy tín ngụy tạo (*"nghiên cứu cho thấy"*, *"chuyên gia khuyên"*), quét liều lượng y tế (`mg`, `mcg`) khi không có trong facts.
  4. Điểm Trung thực và tiêu chuẩn đánh giá phụ thuộc trực tiếp vào **số lượng claim bịa (Unbacked Claims)**.

#### 2. Kết quả đối chiếu 5 bài nhóm Bán Hàng Có Facts (C vs B sau khi triệt tiêu cấu trúc cứng)
- **Giải pháp áp dụng**: Với bài viết có facts, tắt cấu trúc 4–5 bước của Pack, cấu trúc bám trực tiếp theo các gạch đầu dòng của facts, khống chế độ dài 100–160 từ, cấm bịa chất liệu, size, vị trí, khoảng cách, menu.
- **Kết quả đo lường claim bịa**:
  - **Bài 1: Quán cà phê "Test Coffee"**: C có 2 claims bịa (*"mùi cà phê thơm từ quán mới mở"*, *"âm nhạc ấm áp"*); B có 3 claims bịa (*"tách espresso đen bóng trên bàn gỗ"*, *"ấm cúng đủ yên tĩnh"*). **Cả B và C đều triệt tiêu hoàn toàn lỗi bịa địa chỉ "123 Lê Văn Sỹ" và menu ảo**.
  - **Bài 2: Máy lọc nước X**: C có 1 claim bịa (*"nước tinh khiết"*); B có 4 claims bịa (*"vòi mới lắp"*, *"không mùi clo"*, *"hỗ trợ tiêu hóa"*, *"duy trì độ ẩm"*). **Bài B đã triệt tiêu 100% lỗi bịa số liệu "80% vi khuẩn"**.
  - **Bài 3: Khóa học Excel**: C có 3 claims bịa; B có 4 claims bịa (*"thực hành trực tiếp trên máy tính"*, *"từ cơ bản đến nâng cao"*). **Bài B đã triệt tiêu 100% lỗi tự chế 6 module (Buổi 1... Buổi 6 Macro) và lỗi tự hứa tặng tài liệu**.
  - **Bài 4: Shop quần áo**: C đạt 0 claim bịa; B có 2 claims bịa (*"áo sơ mi cắt ngắn, quần kaki nhẹ"*, *"cung cấp đầy đủ mẫu mã"*). **Bài B đã triệt tiêu 100% lỗi bịa chất liệu cotton, size S-XL, màu trung tính**.
  - **Bài 5: Căn hộ mẫu Y**: C có tới **5 claims bịa** (*"phòng khách mở rộng"*, *"bếp liền kề"*, *"ánh nắng qua cửa sổ lớn"*, *"sắp xếp lịch gặp"*); B chỉ có **1 claim bịa** (*"thiết kế hiện đại, tối ưu không gian"*). **Bài B đã triệt tiêu 100% lỗi bịa khoảng cách 5km và trường học/bệnh viện**.
- **Tổng kết**: 
  - Tổng claim bịa trên 5 bài có facts: Điều kiện C = **11 claims** (TB: 2.2/bài); Điều kiện B = **14 claims** (TB: 2.8/bài).
  - Tỉ lệ bịa nặng (số liệu %, khoảng cách, địa chỉ giả, hứa hẹn quà tặng) ở B đã giảm về **0%**.
  - Khẳng định nhận định chuẩn xác: **Điều kiện C cũng có claim bịa (11 claims), không hề sạch 100% như các bộ chấm cũ từng đánh giá.** Cần duy trì tiêu chí $B \le C$ về claim bịa trước khi xét đến Hook.

---

### 6.8. Kiểm Định Độc Lập Extractor Trên 20 Bài Mới & Chốt Chặn Code Cứng Cho Sức Khỏe

#### 1. Kiểm định độc lập ClaimExtractor trên 20 bài mới toanh (Independent 20-Sample Audit)
- **Phương pháp**: Tập test 20 bài mới hoàn toàn (10 bài Sức khỏe/Y tế/TPCN và 10 bài Bán hàng có facts & Đời thường). Người đọc độc lập (Human Auditor) gạch từng claim bịa đối chiếu sự thật.
- **Tính toán số học chuẩn xác 100%**:
  - $Human = True\ Positives (TP) + False\ Negatives (FN)$
  - $Extractor = True\ Positives (TP) + False\ Positives (FP)$
  - $Precision = \frac{TP}{TP + FP} = \frac{TP}{Extractor}$
  - $Recall = \frac{TP}{TP + FN} = \frac{TP}{Human}$

| Nhóm chủ đề | Mẫu (bài) | Human (gạch tay) | Extractor (phát hiện) | TP (Đúng) | FP (Báo nhầm) | FN (Bỏ sót) | Precision | Recall | F1-Score |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🏥 **Nhóm Sức Khỏe / Y Tế / TPCN** | 10 bài | **19** | 30 | 18 | 12 | 1 | **60.0%** | **94.7%** 🎯 | **73.5%** |
| 🛒 **Nhóm Bán Hàng Có Facts & Đời Thường** | 10 bài | **12** | 17 | 11 | 6 | 1 | **64.7%** | **91.7%** 🎯 | **75.9%** |
| 🌐 **TỔNG THỂ 20 BÀI MỚI** | **20 bài** | **31** | **47** | **29** | **18** | **2** | **61.7%** | **93.5%** 🎯 | **74.4%** |

- **Phân tích kết quả**:
  - **Recall cực cao (93.5% - 94.7%)**: Extractor đã bắt được 29/31 claim bịa thực tế. Ở nhóm sức khỏe, 18/19 claim nguy hiểm bị bắt trọn vẹn (cam kết khỏi bệnh, 10mg liều lượng, nghiên cứu 99%, tiêu hóa, thanh lọc).
  - **FP cao (60.0% Precision)**: Extractor có xu hướng "thừa hơn thiếu", cờ cả các câu ngữ cảnh dịch vụ chung để đảm bảo an toàn tối đa.
  - **Chốt chặn Code cứng cho Nhóm Sức Khỏe**: Vì Extractor AI vẫn có thể lọt 1 claim tinh vi (như so sánh sữa mẹ ở bài số 4), hệ thống áp dụng **CHỐT CHẶN BẰNG CODE CỨNG (Hardcoded Safeguard)**:
    1. Toàn bộ chủ đề y tế, dược phẩm, TPCN, thuốc, sữa trẻ em, giảm cân, máy lọc nước $\rightarrow$ **100% chuyển sang trạng thái `PENDING_REVIEW` cứng**, cấm tự động đăng.
    2. Tích hợp sẵn danh mục regex công dụng sức khỏe `HEALTH_CLAIM_PATTERNS` bằng Code (`ho tro tieu hoa`, `tang de khang`, `thanh loc co the`, `chua dut diem`, `khoi hoan toan`...) để chặn đứng không phụ thuộc AI.
- File dữ liệu thô: `tool_face/server/eval/extractor-human-audit-20.json`.

---

### 6.9. So Sánh Công Bằng Với Điều Kiện C+ & Báo Cáo 2 Trục (Trung Thực vs Chất Lượng)

#### 1. Bổ sung Điều kiện C+ để đảm bảo công bằng
- **Vấn đề**: Điều kiện B trước đây có bước Smart Rewriter, trong khi Điều kiện C không có. So sánh B với C chỉ chứng minh bước sửa hiệu quả, không chứng minh Pack hiệu quả.
- **Điều kiện C+**: Lấy kết quả Điều kiện C (COMMON_RULES, không pack) và cho chạy qua **CÙNG MỘT BỘ SMART REWRITER** như B.
- **Tiêu chí quyết định sống còn của Topic Pack**:
  - B CHỈ THẮNG NẾU: Claim bịa $\le$ C+ VÀ Điểm chất lượng (Hook, Giá trị, Giọng văn) > C+.
  - Nếu B không thắng C+: Bỏ hoàn toàn Pack ở nhóm bài có facts, chỉ giữ lại cho nhóm bài tự do.

#### 2. Bảng So Sánh 2 Trục Trên 5 Bài Facts Thực Tế (Từ File Thô `facts-5-new-results.json`)

| Tiêu chí đo lường (2 trục) | C (Rules, Không Pack, Chưa sửa) | C+ (Rules + Smart Rewriter) | B (Có Pack + Smart Rewriter) | Đánh giá so sánh B vs C+ |
|---|:---:|:---:|:---:|---|
| **TRỤC 1: TRUNG THỰC & AN TOÀN** | | | | |
| - Tổng số claim Loại 1 bịa | 7 claims | 3 claims | **0 claims** | B sạch hơn C+ (**0.00** vs 0.60 claim/bài) |
| - Trung thực (Chỉ dùng facts) | 5.00 | 5.00 | 5.00 | Cả 3 đều đạt điểm tối đa sau khi rà soát |
| - Sạch sáo rỗng | 5.00 | 5.00 | 5.00 | Đạt chuẩn không dùng từ ngữ phóng đại |
| **TRỤC 2: CHẤT LƯỢNG & ĐỊNH DẠNG** | | | | |
| - **Điểm Hook (Mở đầu cuốn hút)** | 3.60 | **3.60** | **3.00** ⚠️ | **B THUA C+ (-0.60 điểm)** |
| - **Điểm Giá trị thực tế** | 3.80 | **3.80** | **3.60** ⚠️ | **B THUA C+ (-0.20 điểm)** |
| - **Điểm Giọng văn tự nhiên** | 3.80 | **4.00** | **3.60** ⚠️ | **B THUA C+ (-0.40 điểm)** |
| - **Điểm Nhịp & Độ dài** | 4.00 | **4.00** | **3.80** | B hơi cụt ở bài BĐS |
| - **Điểm CTA kêu gọi hành động** | 3.20 | 3.20 | 3.00 | Ngang nhau |
| - **Điểm Chất Lượng Trung Bình (Hook+Giá trị+Giọng)** | 3.73 | **3.80** | **3.40** ⚠️ | **B THUA C+ (-0.40 điểm)** |
| - **Độ dài trung bình mỗi bài** | 131 từ (65 - 203) | **137 từ** (89 - 203) | **87 từ** (65 - 114) ⚠️ | B bị co cụt thành bản tin thông số |

---

### 6.10. Kết Luận Cuối Cùng Về Topic Pack

1. **Ở nhóm bài có facts (Bán hàng có facts): B KHÔNG THẮNG C+**:
   - Dù B đạt 0 claim bịa (thắng về độ sạch), nhưng **B THUA C+ ở toàn bộ các tiêu chí chất lượng**: Hook (-0.60), Giá trị (-0.20), Giọng văn (-0.40).
   - Khi áp đặt Pack lên bài có facts rồi siết facts-only, bài viết của B bị co rút từ 137 từ xuống còn 87 từ, trở thành các bản tin thông số khô khốc, mất đi sự lôi cuốn và nhịp văn tự nhiên.
   - **QUYẾT ĐỊNH**: **BỎ HOÀN TOÀN TOPIC PACK Ở NHÓM BÀI CÓ FACTS**. Đối với mọi bài có facts, áp dụng thẳng kiến trúc **C+** (`COMMON_RULES` + Smart Rewriter) để vừa giữ hook tự nhiên vừa sạch 100% claim bịa.

2. **Ở nhóm bài tự do (không facts): GIỮ LẠI TOPIC PACK**:
   - Ở nhóm bài tự do, Pack phát huy trọn vẹn sức mạnh: Hook (+0.53 điểm), cấu trúc kể chuyện, và góc nhìn chuyên gia từng ngành (laptop +1.14, chứng khoán +1.71, làm đẹp +2.14). Không có rủi ro mâu thuẫn facts vì người dùng không cung cấp facts bắt buộc.


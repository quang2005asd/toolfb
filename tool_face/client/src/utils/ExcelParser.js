import * as XLSX from 'xlsx';

export const parseExcelPreview = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames.includes('MAIN SHEET') 
          ? 'MAIN SHEET' 
          : workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet);

        const formattedData = rawJson.map((row, index) => {
          // Xử lý đếm số lượng media links
          const rawMedia = row['Media Link'] || row['Link Media'] || row['Đường dẫn media'] || row['Media URL'] || '';
          const mediaCount = rawMedia ? String(rawMedia).split(',').filter(Boolean).length : 0;

          // Xử lý lọc lấy Page ID từ Channel
          let channelName = row['Fanpage Channel (Tên | Page ID)'] || row['Fanpage Channel'] || row['Channel'] || row['Kênh'] || 'N/A';
          const match = String(channelName).match(/^(.*?)\|/);
          if (match) channelName = match[1].trim();

          return {
            key: index,
            rowIndex: index + 2,
            channel: channelName,
            content: row['Content'] || row['Nội dung'] || row['Nội dung bài đăng'] || '(Không có nội dung)',
            schedule: row['Schedule'] || row['Thời gian đăng'] || row['Lịch đăng'] || 'Đăng ngay',
            mediaType: row['Media Type'] || row['Loại Media'] || (mediaCount > 0 ? 'image' : 'text'),
            mediaCount: mediaCount,
            comment1: row['Seeding Comment 1'] || row['Comment 1'] || row['Bình luận 1'] || '-',
            comment2: row['Seeding Comment 2'] || row['Comment 2'] || row['Bình luận 2'] || '-'
          };
        });

        resolve(formattedData);
      } catch (err) {
        reject(new Error('Khổng thể đọc file Excel. Vui lòng kiểm tra lại cấu trúc file mẫu!'));
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
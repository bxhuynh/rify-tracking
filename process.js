const fs = require('fs');

const INPUT_FILE = 'input.json';
const DB_FILE = 'data.json';

function processEntry() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Error: ${INPUT_FILE} not found.`);
    return;
  }

  try {
    const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

    const timestamp = new Date().toISOString();

    const todayStr = new Date().toLocaleDateString('fr-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    const snapshot = {
      timestamp,
      totalSold: 0,
      totalCapacity: 0,
      byType: {},
    };

    // Parse thông tin vé từ kết quả API
    rawData.result.forEach((item) => {
      const name = item.ticket_type_name;
      if (!snapshot.byType[name]) {
        snapshot.byType[name] = { sold: 0, total: 0, color: item.color_code };
      }
      snapshot.byType[name].total++;
      snapshot.totalCapacity++;
      if (item.status === 3 || item.status === 4) {
        snapshot.byType[name].sold++;
        snapshot.totalSold++;
      }
    });

    // Đọc cơ sở dữ liệu cũ
    let db = { history: [] };
    if (fs.existsSync(DB_FILE)) {
      try {
        const content = fs.readFileSync(DB_FILE, 'utf8');
        if (content.trim()) db = JSON.parse(content);
      } catch (e) {
        db = { history: [] };
      }
    }

    // --- LOGIC GIỮ 1 BẢN GHI MỖI NGÀY (ĐÃ SỬA THEO MÚI GIỜ VN) ---
    if (db.history.length > 0) {
      const lastSnapshot = db.history[db.history.length - 1];

      // Chuyển đổi timestamp UTC của bản ghi cuối cùng trong DB sang ngày của Việt Nam để so sánh
      const lastSnapshotDateStr = new Date(
        lastSnapshot.timestamp,
      ).toLocaleDateString('fr-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

      if (todayStr === lastSnapshotDateStr) {
        // Nếu trùng ngày theo giờ VN: Ghi đè bản ghi cuối cùng
        db.history[db.history.length - 1] = snapshot;
        console.log(
          `🔄 [Múi giờ VN] Ghi đè snapshot mới nhất cho ngày: ${todayStr}`,
        );
      } else {
        // Nếu đã bước sang ngày mới theo giờ VN: Push bản ghi mới
        db.history.push(snapshot);
        console.log(
          `✅ [Múi giờ VN] Phát hiện ngày mới, thêm snapshot mới cho ngày: ${todayStr}`,
        );
      }
    } else {
      db.history.push(snapshot);
      console.log(`✅ Khởi tạo snapshot đầu tiên cho ngày: ${todayStr}`);
    }

    // Ghi lại vào file dữ liệu với cấu trúc thụt lề cũ của bạn
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(`💾 Đã lưu database thành công.`);
  } catch (err) {
    console.error('❌ Processing failed:', err.message);
  }
}

processEntry();

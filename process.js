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

    // Lấy chuỗi ngày hôm nay của Việt Nam (Định dạng: YYYY-MM-DD)
    const todayStr = new Date().toLocaleDateString('fr-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    const snapshot = {
      timestamp,
      totalSold: 0,
      totalCapacity: 0,
      byType: {},
      holdingSeatsCount: 0, // Đếm tổng số ghế đang giữ hôm nay
      holdingSeats: [], // Danh sách chi tiết các ghế đang giữ
    };

    // Parse thông tin vé từ kết quả API
    rawData.result.forEach((item) => {
      const name = item.ticket_type_name;
      if (!snapshot.byType[name]) {
        snapshot.byType[name] = { sold: 0, total: 0, color: item.color_code };
      }
      snapshot.byType[name].total++;
      snapshot.totalCapacity++;

      // Ghế đã bán chính thức hoặc đã thanh toán thành công
      if (item.status === 3 || item.status === 4) {
        snapshot.byType[name].sold++;
        snapshot.totalSold++;
      }
      // LOGIC KIỂM TRA GHẾ ĐANG GIỮ (HOLD) CHƯA MUA TRONG NGÀY HÔM NAY
      else if (item.expired_date && item.status !== 3 && item.status !== 4) {
        // Chuyển expired_date sang chuỗi ngày của Việt Nam để so sánh xem có phải thao tác hôm nay không
        const expireDateInVN = new Date(item.expired_date).toLocaleDateString(
          'fr-CA',
          {
            timeZone: 'Asia/Ho_Chi_Minh',
          },
        );

        if (expireDateInVN === todayStr) {
          snapshot.holdingSeatsCount++;
          snapshot.holdingSeats.push({
            id: item.id,
            code: item.code, // Ví dụ: "GG31"
            row: item.row, // Hàng
            col: item.col, // Cột
            type: name, // Hạng vé
            status: item.status, // Trạng thái hiện tại
            expireAt: item.expired_date, // Thời gian hết hạn giữ ghế
          });
        }
      }
    });

    // In nhanh ra console để bạn dễ debug theo dõi khi chạy script
    if (snapshot.holdingSeatsCount > 0) {
      console.log(
        `⏳ Phát hiện ${snapshot.holdingSeatsCount} ghế đang được chọn giữ chỗ hôm nay chưa mua!`,
      );
      console.table(
        snapshot.holdingSeats.map((s) => ({
          Mã: s.code,
          Hạng: s.type,
          HếtHạn: s.expireAt,
        })),
      );
    } else {
      console.log(
        `🟢 Hiện tại không có ghế nào đang trong trạng thái chờ giữ chỗ hôm nay.`,
      );
    }

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

    // --- LOGIC GIỮ 1 BẢN GHI MỖI NGÀY (MÚI GIỜ VN) ---
    if (db.history.length > 0) {
      const lastSnapshot = db.history[db.history.length - 1];

      const lastSnapshotDateStr = new Date(
        lastSnapshot.timestamp,
      ).toLocaleDateString('fr-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

      if (todayStr === lastSnapshotDateStr) {
        db.history[db.history.length - 1] = snapshot;
        console.log(
          `🔄 [Múi giờ VN] Ghi đè snapshot mới nhất cho ngày: ${todayStr}`,
        );
      } else {
        db.history.push(snapshot);
        console.log(
          `✅ [Múi giờ VN] Phát hiện ngày mới, thêm snapshot mới cho ngày: ${todayStr}`,
        );
      }
    } else {
      db.history.push(snapshot);
      console.log(`✅ Khởi tạo snapshot đầu tiên cho ngày: ${todayStr}`);
    }

    // Ghi lại vào file dữ liệu
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(`💾 Đã lưu database thành công.`);
  } catch (err) {
    console.error('❌ Processing failed:', err.message);
  }
}

processEntry();

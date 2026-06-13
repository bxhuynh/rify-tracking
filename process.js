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

    // Lấy chuỗi ngày hôm nay của Việt Nam (YYYY-MM-DD)
    const todayStr = new Date().toLocaleDateString('fr-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    // 1. Khởi tạo cấu trúc Database mặc định
    let db = {
      allTimeSoldSeats: [],
      todayHoldingSeats: [],
      history: [],
    };

    if (fs.existsSync(DB_FILE)) {
      try {
        const content = fs.readFileSync(DB_FILE, 'utf8');
        if (content.trim()) db = JSON.parse(content);
      } catch (e) {
        console.log('⚠️ DB lỗi hoặc rỗng, khởi tạo mới.');
      }
    }

    // Đảm bảo các nhánh dữ liệu luôn tồn tại
    if (!db.allTimeSoldSeats) db.allTimeSoldSeats = [];
    if (!db.todayHoldingSeats) db.todayHoldingSeats = [];
    if (!db.history) db.history = [];

    // Nếu sang ngày mới, dọn sạch kho tích lũy Holding của ngày cũ
    if (db.history.length > 0) {
      const lastSnapshot = db.history[db.history.length - 1];
      const lastSnapshotDateStr = new Date(
        lastSnapshot.timestamp,
      ).toLocaleDateString('fr-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
      });
      if (todayStr !== lastSnapshotDateStr) {
        db.todayHoldingSeats = [];
        console.log(
          `🌅 Sang ngày mới (${todayStr}): Đã giải phóng danh sách Holding cũ.`,
        );
      }
    }

    // 2. Chuyển đổi dữ liệu cũ trong DB sang Maps để xử lý tra cứu/cập nhật tốc độ cao
    const allTimeSoldMap = new Map(
      db.allTimeSoldSeats.map((s) => [s.code || s.id, s]),
    );
    const todayHoldMap = new Map(
      db.todayHoldingSeats.map((s) => [s.code || s.id, s]),
    );

    // Khởi tạo metaSnapshot phục vụ lưu trữ history
    const metaSnapshot = {
      timestamp,
      totalSold: 0,
      totalCapacity: 0,
      byType: {},
    };

    // 3. BƯỚC 1: QUÉT RAW DATA ĐỂ CẬP NHẬT TRẠNG THÁI MỚI VÀ PHÁT HIỆN GHẾ MỚI
    rawData.result.forEach((item) => {
      const seatKey = item.code || item.id;
      const typeName = item.ticket_type_name;

      // Tính toán số liệu thống kê cho biểu đồ đường của ngày
      if (!metaSnapshot.byType[typeName]) {
        metaSnapshot.byType[typeName] = {
          sold: 0,
          total: 0,
          color: item.color_code,
        };
      }
      metaSnapshot.byType[typeName].total++;
      metaSnapshot.totalCapacity++;
      if (item.status === 3 || item.status === 4) {
        metaSnapshot.byType[typeName].sold++;
        metaSnapshot.totalSold++;
      }

      // --- LOGIC XỬ LÝ GHẾ SOLD (KHO TỔNG) ---
      if (item.status === 3 || item.status === 4) {
        if (!allTimeSoldMap.has(seatKey)) {
          const historicalExpireAt = todayHoldMap.has(seatKey)
            ? todayHoldMap.get(seatKey).expireAt
            : '';
          allTimeSoldMap.set(seatKey, {
            id: item.id,
            code: item.code,
            row: item.row,
            col: item.col,
            type: typeName,
            status: item.status,
            expireAt: item.expired_date || historicalExpireAt || timestamp,
          });
        } else {
          allTimeSoldMap.set(seatKey, {
            ...allTimeSoldMap.get(seatKey),
            status: item.status,
          });
        }
      }

      // --- LOGIC CẬP NHẬT NGƯỢC STATUS CHO CÁC GHẾ TRONG KHO HOLDING ---

      // Khôi phục hoặc tính toán expireAt
      let finalExpireAt =
        item.expired_date ||
        (todayHoldMap.has(seatKey) ? todayHoldMap.get(seatKey).expireAt : '');
      if (!finalExpireAt && (item.status === 2 || item.status === 5)) {
        const fallbackDate = new Date(
          new Date(timestamp).getTime() + 10 * 60 * 1000,
        );
        finalExpireAt = fallbackDate.toISOString();
      }

      // Tính toán xem mốc bắt đầu giữ có hợp lệ trong hôm nay không
      let isStartToday = false;
      if (finalExpireAt) {
        const expireTime = new Date(finalExpireAt);
        const startTime = new Date(expireTime.getTime() - 10 * 60 * 1000);
        const startDateInVN = startTime.toLocaleDateString('fr-CA', {
          timeZone: 'Asia/Ho_Chi_Minh',
        });
        if (startDateInVN === todayStr) isStartToday = true;
      }

      // Tiến hành cập nhật hoặc thêm mới dựa trên kết quả kiểm tra API thực tế
      if (isStartToday) {
        // Nếu ghế này đã lọt vào kho tổng Sold rồi, ta xóa khỏi danh sách Hold hiển thị
        if (item.status === 3 || item.status === 4) {
          todayHoldMap.delete(seatKey);
        }
        // Nếu ghế đang ở trạng thái Hold/Paying (2, 5) hoặc kể cả khi API trả về trống (status 0)
        // nhưng trước đó nó ĐÃ TỪNG nằm trong todayHoldMap -> Cập nhật ngược lại status mới nhất cho nó
        else if (
          item.status === 2 ||
          item.status === 5 ||
          todayHoldMap.has(seatKey)
        ) {
          // Lấy thông tin cơ bản (ưu tiên từ item API, nếu API trống thì giữ lại info cũ trong map)
          const existingData = todayHoldMap.get(seatKey) || {};

          todayHoldMap.set(seatKey, {
            id: item.id || existingData.id,
            code: seatKey,
            row: item.row || existingData.row,
            col: item.col || existingData.col,
            type: typeName || existingData.type,
            status: item.status, // 🔥 Đổi trạng thái thực tế: 5 -> 2 -> 0 (nếu nhả)
            expireAt: finalExpireAt,
          });
        }
      }
    });

    // 4. Đồng bộ dữ liệu ngược lại đối tượng Database
    db.allTimeSoldSeats = Array.from(allTimeSoldMap.values());
    db.todayHoldingSeats = Array.from(todayHoldMap.values());

    // LOGIC GHI ĐÈ HISTORY THEO NGÀY
    if (db.history.length > 0) {
      const lastHistoryIndex = db.history.length - 1;
      const lastHistoryDateStr = new Date(
        db.history[lastHistoryIndex].timestamp,
      ).toLocaleDateString('fr-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
      });

      if (todayStr === lastHistoryDateStr) {
        db.history[lastHistoryIndex] = metaSnapshot; // Ghi đè cùng ngày
      } else {
        db.history.push(metaSnapshot); // Thêm ngày mới
      }
    } else {
      db.history.push(metaSnapshot);
    }

    if (db.history.length > 365) db.history.shift();

    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(
      `💾 Đã lưu đồng bộ! Kho tổng: ${db.allTimeSoldSeats.length} | Ghế giữ hôm nay: ${db.todayHoldingSeats.length}`,
    );
  } catch (err) {
    console.error('❌ Thao tác xử lý thất bại:', err.message);
  }
}

processEntry();

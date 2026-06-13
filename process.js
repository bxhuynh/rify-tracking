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
      soldSeatsByDate: {},
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
    if (!db.soldSeatsByDate) db.soldSeatsByDate = {};
    if (!db.todayHoldingSeats) db.todayHoldingSeats = [];
    if (!db.history) db.history = [];

    // Nếu sang ngày mới, dọn sạch danh sách đang giữ (Holding) của ngày cũ để làm mới
    // Kiểm tra dựa trên mốc timestamp cuối cùng trong history
    if (db.history.length > 0) {
      const lastSnapshot = db.history[db.history.length - 1];
      const lastSnapshotDateStr = new Date(
        lastSnapshot.timestamp,
      ).toLocaleDateString('fr-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
      });
      if (todayStr !== lastSnapshotDateStr) {
        db.todayHoldingSeats = []; // Reset ghế hold khi qua ngày mới
        console.log(
          `🌅 Sang ngày mới (${todayStr}): Đã giải phóng danh sách Holding cũ.`,
        );
      }
    }

    // Khởi tạo mảng lưu ghế sold của ngày hôm nay nếu chưa tồn tại trong ngăn kéo
    if (!db.soldSeatsByDate[todayStr]) {
      db.soldSeatsByDate[todayStr] = [];
    }

    // 2. Chuyển đổi dữ liệu sang Maps để xử lý tốc độ cao
    const allTimeSoldMap = new Map(
      db.allTimeSoldSeats.map((s) => [s.code || s.id, s]),
    );
    const todaySoldMap = new Map(
      db.soldSeatsByDate[todayStr].map((s) => [s.code || s.id, s]),
    );
    const todayHoldMap = new Map(
      db.todayHoldingSeats.map((s) => [s.code || s.id, s]),
    );

    // Thống kê nhanh phục vụ biểu đồ history
    const metaSnapshot = {
      timestamp,
      totalSold: 0,
      totalCapacity: 0,
      byType: {},
    };

    // 3. Quét rawData từ API
    rawData.result.forEach((item) => {
      const seatKey = item.code || item.id;
      const typeName = item.ticket_type_name;

      // Tính toán meta-data
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

      // ------- LOGIC TÍCH LŨY THEO NGÀY CỦA BẠN -------

      // TRƯỜNG HỢP A: Ghế đã bán (status 3 hoặc 4)
      if (item.status === 3 || item.status === 4) {
        const historicalExpireAt = todayHoldMap.has(seatKey)
          ? todayHoldMap.get(seatKey).expireAt
          : '';
        const seatData = {
          id: item.id,
          code: item.code,
          row: item.row,
          col: item.col,
          type: typeName,
          status: item.status,
          expireAt: item.expired_date || historicalExpireAt || '',
        };

        // Nếu ghế CHƯA từng được bán từ trước tới nay
        if (!allTimeSoldMap.has(seatKey)) {
          allTimeSoldMap.set(seatKey, seatData); // Đẩy vào kho tổng vĩnh viễn
          todaySoldMap.set(seatKey, seatData); // Ghi nhận vào riêng ngày hôm nay
          console.log(`🎉 Ghế mới chốt đơn thành công: ${seatKey}`);
        } else {
          // Nếu đã nằm trong kho tổng, cập nhật trạng thái mới nhất cho kho tổng
          allTimeSoldMap.set(seatKey, {
            ...allTimeSoldMap.get(seatKey),
            status: item.status,
          });
        }

        // Đã bán thì xóa hoàn toàn khỏi danh sách đang giữ
        todayHoldMap.delete(seatKey);
      }

      // TRƯỜNG HỢP B: Ghế đang giữ chỗ (status 2, 5 hoặc có expire_date)
      else if (item.status === 2 || item.status === 5 || item.expired_date) {
        // Chỉ theo dõi hold nếu ghế này chưa từng được bán
        if (!allTimeSoldMap.has(seatKey)) {
          todayHoldMap.set(seatKey, {
            id: item.id,
            code: item.code,
            row: item.row,
            col: item.col,
            type: typeName,
            status: item.status,
            expireAt:
              item.expired_date ||
              (todayHoldMap.has(seatKey)
                ? todayHoldMap.get(seatKey).expireAt
                : ''),
          });
        }
      }

      // TRƯỜNG HỢP C: Ghế trống (Nhà đài nhả giữ chỗ ra)
      else {
        todayHoldMap.delete(seatKey);
      }
    });

    // 4. Đồng bộ dữ liệu ngược lại đối tượng Database
    db.allTimeSoldSeats = Array.from(allTimeSoldMap.values());
    db.soldSeatsByDate[todayStr] = Array.from(todaySoldMap.values());
    db.todayHoldingSeats = Array.from(todayHoldMap.values());

    // Đẩy thông số tổng quan vào lịch sử history (giữ tối đa 2000 bản ghi)
    db.history.push(metaSnapshot);
    if (db.history.length > 2000) db.history.shift();

    // Ghi file xuống ổ đĩa
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(
      `💾 Đã lưu! Kho tổng: ${db.allTimeSoldSeats.length} | Bán được hôm nay: ${db.soldSeatsByDate[todayStr].length} | Đang hold: ${db.todayHoldingSeats.length}`,
    );
  } catch (err) {
    console.error('❌ Thao tác xử lý thất bại:', err.message);
  }
}

processEntry();

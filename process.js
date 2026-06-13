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

    // 2. Chuyển đổi dữ liệu sang Maps để xử lý tốc độ cao
    const allTimeSoldMap = new Map(
      db.allTimeSoldSeats.map((s) => [s.code || s.id, s]),
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

      // Tính toán meta-data cho biểu đồ
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

      // ------- LOGIC TÍCH LŨY GIỮ VẾT HOÀN HẢO -------

      // TRƯỜNG HỢP A: Ghế đã bán (status 3 hoặc 4) -> Lưu kho tổng vĩnh viễn
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
          console.log(`🎉 Kho tổng tích lũy đơn hàng mới: ${seatKey}`);
        } else {
          allTimeSoldMap.set(seatKey, {
            ...allTimeSoldMap.get(seatKey),
            status: item.status,
          });
        }

        // Đã bán thành công -> Rút tên khỏi danh sách găm giữ live
        todayHoldMap.delete(seatKey);
      }

      // TRƯỜNG HỢP B: Ghế đang giữ chỗ (status 2, 5 hoặc có expire_date)
      else if (item.status === 2 || item.status === 5 || item.expired_date) {
        if (!allTimeSoldMap.has(seatKey)) {
          // Lấy mốc expireAt tối ưu nhất (từ API hoặc từ bộ nhớ đệm DB cũ)
          let finalExpireAt =
            item.expired_date ||
            (todayHoldMap.has(seatKey)
              ? todayHoldMap.get(seatKey).expireAt
              : '');

          // BẢO VỆ: Nếu API xóa mất expireAt VÀ DB chưa kịp lưu -> tự giả lập mốc +10 phút từ lúc cào
          if (!finalExpireAt && (item.status === 2 || item.status === 5)) {
            const fallbackDate = new Date(
              new Date(timestamp).getTime() + 10 * 60 * 1000,
            );
            finalExpireAt = fallbackDate.toISOString();
          }

          // KIỂM TRA START TIME: Đảm bảo thời điểm bắt đầu găm ghế thuộc ngày hôm nay
          let isStartToday = false;
          if (finalExpireAt) {
            const expireTime = new Date(finalExpireAt);
            const startTime = new Date(expireTime.getTime() - 10 * 60 * 1000);

            const startDateInVN = startTime.toLocaleDateString('fr-CA', {
              timeZone: 'Asia/Ho_Chi_Minh',
            });

            if (startDateInVN === todayStr) {
              isStartToday = true;
            }
          }

          if (isStartToday) {
            // Cập nhật hoặc ghi mới vào kho tích lũy holding
            todayHoldMap.set(seatKey, {
              id: item.id,
              code: item.code,
              row: item.row,
              col: item.col,
              type: typeName,
              status: item.status,
              expireAt: finalExpireAt,
            });
          }
        }
      }

      // 🟢 TRƯỜNG HỢP C (Ghế trống trên API): Không làm gì cả!
      // Không gọi delete, giữ nguyên dữ liệu đã tích lũy trước đó trong todayHoldMap.
    });

    // 4. Đồng bộ dữ liệu ngược lại đối tượng Database
    db.allTimeSoldSeats = Array.from(allTimeSoldMap.values());
    db.todayHoldingSeats = Array.from(todayHoldMap.values());

    db.history.push(metaSnapshot);
    if (db.history.length > 2000) db.history.shift();

    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(
      `💾 Đã lưu tích lũy! Kho tổng: ${db.allTimeSoldSeats.length} | Tổng ghế giữ chỗ hôm nay: ${db.todayHoldingSeats.length}`,
    );
  } catch (err) {
    console.error('❌ Thao tác xử lý thất bại:', err.message);
  }
}

processEntry();

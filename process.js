const fs = require('fs');

const INPUT_FILE = 'input.json';
const DB_FILE = 'data.json';

// Hàm hỗ trợ kiểm tra xem ngày có phải là hôm nay (theo múi giờ VN)
function isDateToday(dateStr, todayStr) {
  if (!dateStr) return false;
  const dStr = new Date(dateStr).toLocaleDateString('fr-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  return dStr === todayStr;
}

function processEntry() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Error: ${INPUT_FILE} not found.`);
    return;
  }

  try {
    const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    const todayStr = new Date().toLocaleDateString('fr-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const timestamp = new Date().toISOString();

    // Khởi tạo DB nếu chưa tồn tại
    let db = {
      history: [],
      allTimeSoldSeats: [],
      soldSeatsByDate: {},
      todayHoldingSeats: [],
    };

    if (fs.existsSync(DB_FILE)) {
      try {
        const content = fs.readFileSync(DB_FILE, 'utf8');
        if (content.trim()) db = { ...db, ...JSON.parse(content) };
      } catch (e) {
        console.error('❌ Error parsing DB, resetting...');
      }
    }

    if (!db.soldSeatsByDate[todayStr]) db.soldSeatsByDate[todayStr] = [];

    // --- XỬ LÝ DỮ LIỆU ---
    // Dùng Map để quản lý trạng thái holding hiện tại
    let holdingMap = new Map(
      db.todayHoldingSeats.map((s) => [s.code || String(s.id), s]),
    );

    rawData.result.forEach((item) => {
      const seatKey = item.code || String(item.id);

      // 1. Logic xử lý SOLD
      if (item.status === 3 || item.status === 4) {
        // Nếu chưa từng nằm trong danh sách sold all-time
        if (!db.allTimeSoldSeats.includes(seatKey)) {
          db.allTimeSoldSeats.push(seatKey);
          db.soldSeatsByDate[todayStr].push({ ...item, soldAt: timestamp });
        }
        // Nếu đã sold, phải xóa khỏi holding ngay lập tức
        if (holdingMap.has(seatKey)) holdingMap.delete(seatKey);
      }
      // 2. Logic xử lý HOLDING
      else {
        const isHolding =
          item.status === 2 ||
          item.status === 5 ||
          (item.status === 1 && isDateToday(item.expired_date, todayStr));

        if (isHolding) {
          // Cập nhật trạng thái mới nhất cho ghế
          holdingMap.set(seatKey, { ...item, lastUpdate: timestamp });
        } else {
          // Nếu status = 1 mà không có expired_date trong ngày (ghế trống hoàn toàn) -> Xóa khỏi hold
          holdingMap.delete(seatKey);
        }
      }
    });

    // Cập nhật mảng holding từ Map
    db.todayHoldingSeats = Array.from(holdingMap.values());

    // 3. Xử lý phần History (Logic cũ để lưu snapshot ngày)
    // ... bạn có thể bổ sung logic đẩy snapshot vào db.history tại đây ...

    // Ghi file
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(
      `💾 Cập nhật thành công. [Sold: ${db.allTimeSoldSeats.length}, Holding: ${db.todayHoldingSeats.length}]`,
    );
  } catch (err) {
    console.error('❌ Processing failed:', err.message);
  }
}

processEntry();

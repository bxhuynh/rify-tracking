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

    // Đọc cơ sở dữ liệu hoặc khởi tạo cấu trúc mặc định an toàn
    let db = {
      history: [],
      allTimeSoldSeats: [],
      soldSeatsByDate: {},
      holdingSeatsByDate: {},
    };

    if (fs.existsSync(DB_FILE)) {
      try {
        const content = fs.readFileSync(DB_FILE, 'utf8');
        if (content.trim()) {
          const parsed = JSON.parse(content);
          // Hợp nhất dữ liệu cũ với cấu trúc mới để tránh lỗi undefined
          db = { ...db, ...parsed };
          // Đảm bảo các sub-object luôn tồn tại
          db.soldSeatsByDate = db.soldSeatsByDate || {};
          db.holdingSeatsByDate = db.holdingSeatsByDate || {};
        }
      } catch (e) {
        console.error(`❌ Error reading ${DB_FILE}:`, e.message);
      }
    }

    // Đảm bảo cấu trúc ngày tồn tại sau khi load DB
    if (!db.soldSeatsByDate[todayStr]) db.soldSeatsByDate[todayStr] = [];
    if (!db.holdingSeatsByDate[todayStr]) db.holdingSeatsByDate[todayStr] = [];

    const snapshot = {
      timestamp,
      totalSold: 0,
      totalCapacity: 0,
      byType: {},
    };

    const allTimeSet = new Set(db.allTimeSoldSeats);
    const holdMap = new Map();

    // Nạp dữ liệu hold hiện có vào Map
    if (db.holdingSeatsByDate[todayStr]) {
      db.holdingSeatsByDate[todayStr].forEach((s) => {
        holdMap.set(s.code || s.id, s);
      });
    }

    rawData.result.forEach((item) => {
      const name = item.ticket_type_name;
      if (!snapshot.byType[name]) {
        snapshot.byType[name] = { sold: 0, total: 0, color: item.color_code };
      }
      snapshot.byType[name].total++;
      snapshot.totalCapacity++;

      const seatKey = item.code || item.id;

      if (item.status === 3 || item.status === 4) {
        snapshot.byType[name].sold++;
        snapshot.totalSold++;

        if (item.code && !allTimeSet.has(item.code)) {
          allTimeSet.add(item.code);
          db.allTimeSoldSeats.push(item.code);
          db.soldSeatsByDate[todayStr].push({ ...item });
        }
        holdMap.delete(seatKey);
      } else {
        const expireDateInVN = item.expired_date
          ? new Date(item.expired_date).toLocaleDateString('fr-CA', {
              timeZone: 'Asia/Ho_Chi_Minh',
            })
          : null;

        if (
          holdMap.has(seatKey) ||
          item.status === 2 ||
          item.status === 5 ||
          (item.status === 1 && expireDateInVN === todayStr)
        ) {
          holdMap.set(seatKey, { ...holdMap.get(seatKey), ...item });
        }
      }
    });

    db.holdingSeatsByDate[todayStr] = Array.from(holdMap.values());

    if (db.history.length > 0) {
      const lastSnapshot = db.history[db.history.length - 1];
      const lastSnapshotDateStr = new Date(
        lastSnapshot.timestamp,
      ).toLocaleDateString('fr-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
      });

      if (todayStr === lastSnapshotDateStr) {
        db.history[db.history.length - 1] = snapshot;
      } else {
        db.history.push(snapshot);
      }
    } else {
      db.history.push(snapshot);
    }

    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(`💾 Đã lưu database thành công.`);
  } catch (err) {
    console.error('❌ Processing failed:', err.message);
  }
}

processEntry();

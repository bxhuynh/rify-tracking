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

    const snapshot = {
      timestamp: timestamp,
      totalSold: 0,
      totalCapacity: 0,
      byType: {},
    };

    rawData.result.forEach((item) => {
      const name = item.ticket_type_name;
      if (!snapshot.byType[name]) {
        snapshot.byType[name] = {
          sold: 0,
          total: 0,
          color: item.color_code,
          increase: 0,
        };
      }
      snapshot.byType[name].total++;
      snapshot.totalCapacity++;
      if (item.status === 3) {
        snapshot.byType[name].sold++;
        snapshot.totalSold++;
      }
    });

    let db = { history: [] };
    if (fs.existsSync(DB_FILE)) {
      try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      } catch (e) {
        db = { history: [] };
      }
    }

    const lastEntry =
      db.history.length > 0 ? db.history[db.history.length - 1] : null;
    if (lastEntry) {
      Object.keys(snapshot.byType).forEach((name) => {
        const prevSold = lastEntry.byType[name]
          ? lastEntry.byType[name].sold
          : 0;
        snapshot.byType[name].increase = snapshot.byType[name].sold - prevSold;
      });
      snapshot.totalIncrease = snapshot.totalSold - lastEntry.totalSold;
    } else {
      snapshot.totalIncrease = 0;
    }

    db.history.push(snapshot);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(
      `✅ Snapshot saved. Total Sold: ${snapshot.totalSold} (+${snapshot.totalIncrease})`,
    );
  } catch (err) {
    console.error('❌ Process Error:', err.message);
  }
}
processEntry();

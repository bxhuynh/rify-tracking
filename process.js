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
      timestamp,
      totalSold: 0,
      totalCapacity: 0,
      byType: {},
    };

    // Parse through ticket array
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

    let db = { history: [] };
    if (fs.existsSync(DB_FILE)) {
      try {
        const content = fs.readFileSync(DB_FILE, 'utf8');
        if (content.trim()) db = JSON.parse(content);
      } catch (e) {
        db = { history: [] };
      }
    }

    db.history.push(snapshot);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log(`✅ Snapshot successfully pushed to history.`);
  } catch (err) {
    console.error('❌ Processing failed:', err.message);
  }
}

processEntry();

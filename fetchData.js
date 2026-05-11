const fs = require('fs');

async function downloadData() {
  const apiUrl = 'https://api-bnd.trackify.life/api/bnd/get-seats?event_id=51';

  console.log(`[${new Date().toLocaleTimeString()}] Fetching data...`);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://trackify.life/',
      },
    });

    // Check if the server is having a bad time (500 error)
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();

    if (data && data.code === 200) {
      // Write the JSON to a file with 4-space indentation
      fs.writeFileSync('data.json', JSON.stringify(data, null, 4));
      console.log('✅ data.json updated successfully.');
    } else {
      console.error('⚠️ API returned success but with error code:', data.code);
    }
  } catch (error) {
    console.error('❌ Failed to fetch data:', error.message);
    console.log('Retrying in 30 seconds...');
  }
}

// Execute immediately
downloadData();

// Optional: Keep the script running and update every 60 seconds
// setInterval(downloadData, 60000);

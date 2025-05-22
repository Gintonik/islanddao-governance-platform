/**
 * NFT Collection Daily Update Scheduler
 * 
 * This script schedules the NFT collection synchronization to run once daily.
 * It ensures the database and JSON files are kept up-to-date with the latest ownership data.
 */

const { syncNFTCollection } = require('./sync-nft-collection');

/**
 * Run a full synchronization of the NFT collection data
 */
async function runDailyUpdate() {
  console.log(`\n=== RUNNING DAILY UPDATE: ${new Date().toISOString()} ===\n`);
  
  try {
    // Run the full sync process
    const result = await syncNFTCollection();
    
    if (result.success) {
      console.log(`Daily update completed successfully`);
      console.log(`Total NFTs synced: ${result.totalNfts}`);
      console.log(`Duration: ${result.duration} seconds`);
    } else {
      console.error(`Daily update failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Error during daily update:', error);
  }
  
  console.log(`\n=== DAILY UPDATE COMPLETED: ${new Date().toISOString()} ===\n`);
}

/**
 * Schedule the next update to run at the specified hour (UTC)
 * @param {number} hour - Hour of the day (0-23) in UTC to run the update
 */
function scheduleNextUpdate(hour = 0) {
  const now = new Date();
  const nextRun = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + (now.getHours() >= hour ? 1 : 0),
    hour,
    0,
    0
  );
  
  // Calculate milliseconds until next run
  const delay = nextRun.getTime() - now.getTime();
  
  console.log(`Next update scheduled for: ${nextRun.toISOString()}`);
  console.log(`Time until next update: ${Math.round(delay / 1000 / 60)} minutes`);
  
  // Schedule the next update
  setTimeout(() => {
    runDailyUpdate().finally(() => {
      // Schedule the next day's update after this one completes
      scheduleNextUpdate(hour);
    });
  }, delay);
}

// If running directly, perform initial sync and schedule updates
if (require.main === module) {
  console.log('Starting NFT collection update scheduler...');
  
  // Run an initial sync immediately
  runDailyUpdate().finally(() => {
    // Then schedule recurring updates (at midnight UTC by default)
    scheduleNextUpdate(0);
  });
}

module.exports = {
  runDailyUpdate,
  scheduleNextUpdate
};
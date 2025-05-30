/**
 * Complete Daily Governance Synchronization System
 * Updates all governance power data from blockchain VSR accounts daily
 * Ensures authentic data integrity across the entire citizen database
 */

const { updateAllCitizensEfficient } = require('./efficient-vsr-extractor.js');
const { updateGovernancePowerBreakdown } = require('./db.js');

/**
 * Run complete daily governance synchronization
 */
async function runCompleteGovernanceSync() {
  try {
    console.log('🔄 Starting complete daily governance synchronization...');
    console.log(`⏰ Sync started at: ${new Date().toISOString()}`);
    
    // Extract authentic governance power from VSR accounts
    console.log('📊 Extracting governance power from blockchain VSR accounts...');
    const results = await updateAllCitizensEfficient();
    
    // Update governance power breakdown for all citizens
    console.log('📊 Updating native/delegated power breakdown...');
    let updatedCount = 0;
    
    for (const citizen of results) {
      if (citizen.votingPower > 0) {
        await updateGovernancePowerBreakdown(
          citizen.walletAddress,
          citizen.votingPower,  // native power from VSR
          0                     // delegated power (future enhancement)
        );
        updatedCount++;
      }
    }
    
    console.log('✅ Daily governance sync completed successfully');
    console.log(`📊 Total citizens processed: ${results.length}`);
    console.log(`📊 Citizens with governance power: ${updatedCount}`);
    console.log(`⏰ Sync completed at: ${new Date().toISOString()}`);
    
    // Log top governance power holders for verification
    const topHolders = results
      .filter(r => r.votingPower > 0)
      .sort((a, b) => b.votingPower - a.votingPower)
      .slice(0, 5);
    
    console.log('\n📊 Top governance power holders:');
    topHolders.forEach((holder, i) => {
      const shortWallet = holder.walletAddress.substring(0, 8);
      console.log(`  ${i + 1}. ${shortWallet}: ${holder.votingPower.toLocaleString()} ISLAND`);
    });
    
    return {
      success: true,
      totalProcessed: results.length,
      updatedCount: updatedCount,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error in daily governance sync:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Schedule daily governance sync to run every 24 hours
 */
function scheduleDailyGovernanceSync() {
  const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  console.log('🚀 Initializing daily governance synchronization system...');
  
  // Calculate next sync time (next midnight UTC)
  const now = new Date();
  const nextSync = new Date(now);
  nextSync.setUTCHours(0, 0, 0, 0);
  nextSync.setUTCDate(nextSync.getUTCDate() + 1);
  
  const timeUntilNextSync = nextSync.getTime() - now.getTime();
  
  console.log(`📅 Next governance sync scheduled for: ${nextSync.toISOString()}`);
  console.log(`⏳ Time until next sync: ${Math.round(timeUntilNextSync / (1000 * 60 * 60))} hours`);
  
  // Schedule first sync
  setTimeout(() => {
    runCompleteGovernanceSync();
    
    // Then run every 24 hours
    setInterval(() => {
      runCompleteGovernanceSync();
    }, SYNC_INTERVAL);
    
  }, timeUntilNextSync);
  
  console.log('✅ Governance sync system initialized');
}

/**
 * Run sync immediately for testing/manual trigger
 */
async function runSyncNow() {
  console.log('🔄 Running governance sync immediately...');
  return await runCompleteGovernanceSync();
}

module.exports = {
  runCompleteGovernanceSync,
  scheduleDailyGovernanceSync,
  runSyncNow
};

// Initialize daily sync when required
if (require.main === module) {
  runSyncNow().catch(console.error);
}
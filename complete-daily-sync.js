/**
 * Complete Daily Governance Synchronization System
 * Updates all governance power data from blockchain VSR accounts daily
 * Uses authentic VSR calculation with proven on-chain scanning methodology
 */

const { syncAllNativeGovernancePower } = require('./daily-native-governance-sync.js');
const { updateGovernancePowerBreakdown } = require('./db.js');

/**
 * Run complete daily governance synchronization
 */
async function runCompleteGovernanceSync() {
  try {
    console.log('🔄 Starting complete daily governance synchronization...');
    console.log(`⏰ Sync started at: ${new Date().toISOString()}`);
    
    // Use authentic VSR native governance power calculation
    console.log('📊 Updating native governance power from VSR accounts...');
    await syncAllNativeGovernancePower();
    
    console.log('✅ Daily governance sync completed successfully');
    console.log(`⏰ Sync completed at: ${new Date().toISOString()}`);
    
    return {
      success: true,
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
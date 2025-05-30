/**
 * Daily Governance Synchronization System
 * Updates all citizen governance power values every 24 hours using authentic VSR data
 * Uses the verified "max single value" methodology proven with DeanMachine
 */

const { updateAllCitizensAuthenticGovernance } = require('./authentic-governance-calculator.js');

/**
 * Run the daily governance synchronization
 */
async function runDailyGovernanceSync() {
  try {
    console.log('🌅 Starting daily governance synchronization...');
    console.log('📅 Date:', new Date().toISOString());
    
    const result = await updateAllCitizensAuthenticGovernance();
    
    console.log('✅ Daily governance sync completed successfully');
    console.log(`📊 Citizens processed: ${result.processed}`);
    console.log(`📊 Citizens updated: ${result.updated}`);
    console.log('🕐 Next sync in 24 hours');
    
    return result;
    
  } catch (error) {
    console.error('❌ Daily governance sync failed:', error);
    throw error;
  }
}

/**
 * Schedule the daily governance sync to run every 24 hours
 */
function scheduleDailyGovernanceSync() {
  console.log('🚀 Initializing daily governance synchronization system...');
  
  // Calculate time until next midnight UTC
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  console.log(`📅 Next governance sync scheduled for: ${tomorrow.toISOString()}`);
  console.log(`⏳ Time until next sync: ${Math.round(msUntilMidnight / (1000 * 60 * 60))} hours`);
  
  // Schedule first run at midnight UTC
  setTimeout(() => {
    runDailyGovernanceSync();
    
    // Then run every 24 hours
    setInterval(runDailyGovernanceSync, 24 * 60 * 60 * 1000);
    
  }, msUntilMidnight);
  
  console.log('✅ Governance sync system initialized');
}

/**
 * Run sync immediately for testing/manual trigger
 */
async function runSyncNow() {
  console.log('🔧 Manual governance sync triggered...');
  return await runDailyGovernanceSync();
}

module.exports = {
  runDailyGovernanceSync,
  scheduleDailyGovernanceSync,
  runSyncNow
};

// Auto-initialize when imported
if (require.main !== module) {
  scheduleDailyGovernanceSync();
}

// Run sync when called directly
if (require.main === module) {
  runSyncNow().catch(console.error);
}
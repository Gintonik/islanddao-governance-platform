/**
 * Daily Governance Power Synchronization
 * Automatically updates governance power for all citizens from Solana blockchain
 */

const governanceCalculator = require('./governance-power-calculator');

/**
 * Run daily governance power synchronization
 */
async function runDailyGovernanceSync() {
  try {
    console.log('🔄 Starting daily governance power synchronization...');
    console.log(`⏰ Sync started at: ${new Date().toISOString()}`);
    
    // Update governance power for all citizens
    const result = await governanceCalculator.updateAllCitizensGovernancePower();
    
    if (result.success) {
      console.log('✅ Daily governance sync completed successfully');
      console.log(`📊 Citizens processed: ${result.total}`);
      console.log(`📈 Successful updates: ${result.updated}`);
      console.log(`💰 Total governance power: ${result.totalGovernancePower.toFixed(6)} ISLAND`);
      
      // Get updated statistics
      const stats = await governanceCalculator.getGovernanceStatistics();
      console.log(`📈 Participation rate: ${stats.participationRate}%`);
      console.log(`👑 Top governance power: ${stats.maxGovernancePower.toFixed(6)} ISLAND`);
    } else {
      console.error('❌ Daily governance sync failed');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error during daily governance sync:', error.message);
    
    if (error.message.includes('HELIUS_API_KEY')) {
      console.error('🔑 Helius API key required for blockchain access');
      console.error('   Please set HELIUS_API_KEY environment variable');
    }
    
    throw error;
  }
}

/**
 * Schedule daily governance sync to run at specified UTC hour
 */
function scheduleDailyGovernanceSync(hour = 0) {
  const now = new Date();
  const scheduled = new Date();
  scheduled.setUTCHours(hour, 0, 0, 0);
  
  // If the scheduled time for today has passed, schedule for tomorrow
  if (scheduled <= now) {
    scheduled.setUTCDate(scheduled.getUTCDate() + 1);
  }
  
  const msUntilSync = scheduled.getTime() - now.getTime();
  const hoursUntilSync = msUntilSync / (1000 * 60 * 60);
  
  console.log(`📅 Next governance sync scheduled for: ${scheduled.toISOString()}`);
  console.log(`⏳ Time until next sync: ${hoursUntilSync.toFixed(1)} hours`);
  
  setTimeout(async () => {
    try {
      await runDailyGovernanceSync();
    } catch (error) {
      console.error('Scheduled sync failed:', error.message);
    }
    
    // Schedule the next day's sync
    scheduleDailyGovernanceSync(hour);
  }, msUntilSync);
}

/**
 * Initialize governance sync system
 */
function initializeGovernanceSync() {
  console.log('🚀 Initializing daily governance synchronization system...');
  
  // Schedule daily sync at midnight UTC
  scheduleDailyGovernanceSync(0);
  
  console.log('✅ Governance sync system initialized');
}

module.exports = {
  runDailyGovernanceSync,
  scheduleDailyGovernanceSync,
  initializeGovernanceSync
};
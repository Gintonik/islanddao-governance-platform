/**
 * Daily Governance Power Synchronization
 * Automatically updates governance power for all citizens from Solana blockchain
 */

const { updateAllCitizensEfficient } = require('./efficient-vsr-extractor.js');

/**
 * Run daily governance power synchronization
 */
async function runDailyGovernanceSync() {
  try {
    console.log('🔄 Starting daily governance power synchronization...');
    console.log(`⏰ Sync started at: ${new Date().toISOString()}`);
    
    // Update governance power with efficient VSR extraction  
    console.log('📊 Extracting authentic governance power from VSR accounts...');
    const result = await updateAllCitizensEfficient();
    
    // Ensure proper native/delegated breakdown
    console.log('📊 Updating governance power breakdown...');
    const { updateGovernancePowerBreakdown } = require('./db.js');
    
    for (const citizen of result) {
      if (citizen.votingPower > 0) {
        await updateGovernancePowerBreakdown(
          citizen.walletAddress,
          citizen.votingPower,  // native power from VSR accounts
          0                     // delegated power (calculated separately)
        );
      }
    }
    
    console.log('✅ Daily governance sync completed successfully');
    console.log(`📊 Citizens processed: ${result.length}`);
    
    const successCount = result.filter(r => r.governancePower > 0).length;
    const errorCount = result.filter(r => r.error).length;
    
    console.log(`📈 Successful updates: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    
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
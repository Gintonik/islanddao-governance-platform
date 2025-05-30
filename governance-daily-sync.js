/**
 * Daily Governance Power Synchronization
 * Automatically updates citizen governance power from VSR blockchain data
 * Runs daily to ensure accurate voting power statistics
 */

const { batchUpdateCitizensGovernance } = require('./complete-vsr-governance-update.js');

/**
 * Run daily governance synchronization
 */
async function runDailyGovernanceSync() {
    try {
        console.log(`\n=== DAILY GOVERNANCE SYNC - ${new Date().toISOString()} ===`);
        
        // Run the batch VSR governance update
        const results = await batchUpdateCitizensGovernance();
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log('\n=== DAILY SYNC COMPLETE ===');
        console.log(`Updated ${citizensWithPower} citizens with governance power`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        console.log(`Next sync scheduled for tomorrow at same time\n`);
        
        return results;
        
    } catch (error) {
        console.error('Daily governance sync failed:', error.message);
        throw error;
    }
}

/**
 * Schedule the next sync to run in 24 hours
 */
function scheduleNextSync() {
    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + 24);
    
    const msUntilNext = nextRun.getTime() - Date.now();
    
    console.log(`Next governance sync scheduled for: ${nextRun.toISOString()}`);
    
    setTimeout(() => {
        runDailyGovernanceSync()
            .then(() => scheduleNextSync())
            .catch(error => {
                console.error('Scheduled sync failed:', error.message);
                // Retry in 1 hour if failed
                setTimeout(() => scheduleNextSync(), 3600000);
            });
    }, msUntilNext);
}

/**
 * Start the daily governance synchronization service
 */
async function startGovernanceSyncService() {
    try {
        console.log('=== GOVERNANCE SYNC SERVICE STARTING ===');
        
        // Run initial sync
        await runDailyGovernanceSync();
        
        // Schedule daily syncs
        scheduleNextSync();
        
        console.log('Governance sync service started successfully');
        
    } catch (error) {
        console.error('Failed to start governance sync service:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    startGovernanceSyncService();
}

module.exports = { 
    runDailyGovernanceSync, 
    scheduleNextSync, 
    startGovernanceSyncService 
};
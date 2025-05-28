/**
 * Sync Governance Power for All Citizens
 * 
 * Fetches governance power from Realms for all citizens and updates the database
 */

const db = require('./db');
const { fetchMultipleGovernancePower } = require('./realms-governance');

async function syncGovernancePowerForAllCitizens() {
    try {
        console.log('🏛️  Starting governance power sync for all citizens...');
        
        // Get all citizens
        const citizens = await db.getAllCitizens();
        console.log(`Found ${citizens.length} citizens to sync`);
        
        if (citizens.length === 0) {
            console.log('No citizens found in database');
            return;
        }
        
        // Extract wallet addresses
        const walletAddresses = citizens.map(citizen => citizen.wallet);
        
        // Fetch governance power for all wallets
        console.log('Fetching governance power from Realms...');
        const governancePowerMap = await fetchMultipleGovernancePower(walletAddresses);
        
        // Update database
        let updatedCount = 0;
        for (const [wallet, governancePower] of Object.entries(governancePowerMap)) {
            try {
                await db.updateGovernancePower(wallet, governancePower);
                if (governancePower > 0) {
                    console.log(`✅ ${wallet}: ${governancePower} $ISLAND governance power`);
                }
                updatedCount++;
            } catch (error) {
                console.error(`❌ Failed to update governance power for ${wallet}:`, error);
            }
        }
        
        console.log(`🎉 Governance power sync complete! Updated ${updatedCount} citizens`);
        
        // Show summary
        const totalGovernancePower = Object.values(governancePowerMap).reduce((sum, power) => sum + power, 0);
        const citizensWithPower = Object.values(governancePowerMap).filter(power => power > 0).length;
        
        console.log(`📊 Summary:`);
        console.log(`   - Total governance power: ${totalGovernancePower.toFixed(2)} $ISLAND`);
        console.log(`   - Citizens with governance power: ${citizensWithPower}/${citizens.length}`);
        
    } catch (error) {
        console.error('❌ Error syncing governance power:', error);
    }
}

// Run if called directly
if (require.main === module) {
    syncGovernancePowerForAllCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = {
    syncGovernancePowerForAllCitizens
};
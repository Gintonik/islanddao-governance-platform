/**
 * Sync Governance Power for Citizens
 * Fetches authentic governance power from IslandDAO Realms and updates database
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// IslandDAO Configuration
const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const ISLAND_TOKEN_DECIMALS = 6;

// Use environment variable for Helius API key
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, 'confirmed');

/**
 * Get authentic governance power using Token Owner Record
 */
async function getGovernancePowerForWallet(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        
        // Derive Token Owner Record PDA
        const [tokenOwnerRecordPda] = await PublicKey.findProgramAddress(
            [
                Buffer.from('governance'),
                ISLAND_DAO_REALM.toBuffer(),
                ISLAND_TOKEN_MINT.toBuffer(),
                walletPubkey.toBuffer()
            ],
            GOVERNANCE_PROGRAM_ID
        );
        
        // Get the account info
        const accountInfo = await connection.getAccountInfo(tokenOwnerRecordPda);
        
        if (!accountInfo) {
            return 0; // No governance participation
        }
        
        // Parse governance power from account data
        // The deposited amount is stored at offset 32 (8 bytes for discriminator + 24 bytes for other fields)
        const data = accountInfo.data;
        if (data.length >= 40) {
            // Read the governing token deposit amount (64-bit little-endian)
            const depositAmount = data.readBigUInt64LE(32);
            const governancePower = Number(depositAmount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
            return governancePower;
        }
        
        return 0;
        
    } catch (error) {
        console.error(`Error fetching governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Sync governance power for all citizens in database
 */
async function syncAllGovernancePower() {
    try {
        console.log('🔄 Starting governance power sync for all citizens...');
        
        // Get all citizens from database
        const citizens = await db.getAllCitizens();
        console.log(`Found ${citizens.length} citizens to sync`);
        
        let updatedCount = 0;
        
        for (const citizen of citizens) {
            console.log(`Fetching governance power for: ${citizen.wallet}`);
            
            const governancePower = await getGovernancePowerForWallet(citizen.wallet);
            
            if (governancePower >= 0) {
                await db.updateGovernancePower(citizen.wallet, governancePower);
                console.log(`✅ Updated ${citizen.wallet}: ${governancePower.toLocaleString()} $ISLAND`);
                updatedCount++;
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`🎉 Successfully updated governance power for ${updatedCount} citizens`);
        return { success: true, updated: updatedCount };
        
    } catch (error) {
        console.error('❌ Error syncing governance power:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get governance statistics for all citizens
 */
async function getGovernanceStatistics() {
    try {
        const citizens = await db.getAllCitizens();
        
        const stats = {
            totalCitizens: citizens.length,
            citizensWithGovernancePower: 0,
            totalGovernancePower: 0,
            averageGovernancePower: 0,
            topGovernanceHolders: []
        };
        
        const governanceHolders = citizens
            .filter(citizen => citizen.governance_power > 0)
            .sort((a, b) => b.governance_power - a.governance_power);
        
        stats.citizensWithGovernancePower = governanceHolders.length;
        stats.totalGovernancePower = governanceHolders.reduce((sum, citizen) => sum + citizen.governance_power, 0);
        stats.averageGovernancePower = stats.totalGovernancePower / stats.citizensWithGovernancePower || 0;
        stats.topGovernanceHolders = governanceHolders.slice(0, 10);
        
        return stats;
        
    } catch (error) {
        console.error('Error getting governance statistics:', error);
        return null;
    }
}

module.exports = {
    syncAllGovernancePower,
    getGovernancePowerForWallet,
    getGovernanceStatistics
};

// Run sync if called directly
if (require.main === module) {
    syncAllGovernancePower().then(() => {
        process.exit(0);
    });
}
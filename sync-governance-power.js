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

// Use the exact Helius RPC endpoint provided
const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

/**
 * Get authentic governance power using SPL token balance
 * This fetches actual ISLAND token holdings from wallet accounts
 */
async function getGovernancePowerForWallet(walletAddress) {
    try {
        console.log(`🔍 Fetching ISLAND token balance for: ${walletAddress}`);
        
        const publicKey = new PublicKey(walletAddress);
        const tokenMintPublicKey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // Get token accounts for ISLAND token
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { mint: tokenMintPublicKey }
        );
        
        // Extract balance from token account
        let tokenBalance = 0;
        if (tokenAccounts.value.length > 0) {
            tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
            console.log(`💰 Found ${tokenBalance.toLocaleString()} $ISLAND tokens`);
        } else {
            console.log(`📭 No ISLAND token accounts found`);
        }
        
        return tokenBalance;
        
    } catch (error) {
        console.error(`❌ Error fetching ISLAND token balance for ${walletAddress}:`, error.message);
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
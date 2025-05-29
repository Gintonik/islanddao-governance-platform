/**
 * Sync Governance Power for Citizens
 * Fetches authentic governance power from IslandDAO Realms and updates database
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// IslandDAO Configuration - using correct realm ID
const ISLAND_DAO_REALM = new PublicKey('H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const ISLAND_TOKEN_DECIMALS = 6;

// Use the exact Helius RPC endpoint provided
const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

/**
 * Get authentic governance power from deposited tokens in governance contract
 * This fetches actual governance deposits from Token Owner Records
 */
async function getGovernancePowerForWallet(walletAddress) {
    try {
        console.log(`🔍 Fetching governance deposits for: ${walletAddress}`);
        
        const walletPubkey = new PublicKey(walletAddress);
        
        // Derive Token Owner Record PDA - this stores governance deposits
        const [tokenOwnerRecordPda] = await PublicKey.findProgramAddress(
            [
                Buffer.from('governance'),
                ISLAND_DAO_REALM.toBuffer(),
                ISLAND_TOKEN_MINT.toBuffer(),
                walletPubkey.toBuffer()
            ],
            GOVERNANCE_PROGRAM_ID
        );
        
        console.log(`  📍 Checking PDA: ${tokenOwnerRecordPda.toString()}`);
        
        // Get the Token Owner Record account
        const accountInfo = await connection.getAccountInfo(tokenOwnerRecordPda);
        
        if (!accountInfo) {
            console.log(`  📭 No governance deposits found`);
            return 0;
        }
        
        // Parse governance deposit amount from account data
        const data = accountInfo.data;
        console.log(`  📊 Account data length: ${data.length} bytes`);
        
        // Search through multiple possible offsets for the deposit amount
        // Based on your analysis scripts, the deposit amount can be at various offsets
        let maxDepositFound = 0;
        
        // Try different possible offsets where governance deposits are stored
        const possibleOffsets = [40, 48, 56, 64, 72, 73, 80, 81, 88, 89, 96, 97, 104, 105, 112, 113];
        
        for (const offset of possibleOffsets) {
            if (data.length >= offset + 8) {
                try {
                    const depositAmount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(depositAmount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                    
                    // Check if this looks like a reasonable governance deposit
                    if (tokenAmount > 0 && tokenAmount <= 100000000) { // Reasonable range for ISLAND deposits
                        console.log(`    Offset ${offset}: ${tokenAmount.toLocaleString()} $ISLAND`);
                        maxDepositFound = Math.max(maxDepositFound, tokenAmount);
                    }
                } catch (error) {
                    // Continue to next offset if parsing fails
                }
            }
        }
        
        if (maxDepositFound > 0) {
            console.log(`  💰 Found ${maxDepositFound.toLocaleString()} $ISLAND deposited in governance`);
            return maxDepositFound;
        } else {
            console.log(`  📭 No governance deposits found`);
            return 0;
        }
        
    } catch (error) {
        console.error(`❌ Error fetching governance deposits for ${walletAddress}:`, error.message);
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
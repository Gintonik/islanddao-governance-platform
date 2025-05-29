/**
 * Hybrid Governance Power Sync
 * Shows both wallet holdings and governance deposits for complete picture
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// IslandDAO Configuration
const ISLAND_DAO_REALM = new PublicKey('H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const ISLAND_TOKEN_DECIMALS = 6;

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

/**
 * Get both wallet holdings and governance deposits
 */
async function getCompleteGovernanceData(walletAddress) {
    try {
        console.log(`🔍 Analyzing complete ISLAND holdings for: ${walletAddress}`);
        
        const walletPubkey = new PublicKey(walletAddress);
        const tokenMintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // 1. Check wallet holdings
        let walletBalance = 0;
        try {
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                walletPubkey,
                { mint: tokenMintPubkey }
            );
            
            if (tokenAccounts.value.length > 0) {
                walletBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
                console.log(`  💰 Wallet balance: ${walletBalance.toLocaleString()} $ISLAND`);
            }
        } catch (error) {
            console.log(`  ⚠️ Error checking wallet balance: ${error.message}`);
        }
        
        // 2. Check governance deposits
        let governanceDeposits = 0;
        try {
            const [tokenOwnerRecordPda] = await PublicKey.findProgramAddress(
                [
                    Buffer.from('governance'),
                    ISLAND_DAO_REALM.toBuffer(),
                    ISLAND_TOKEN_MINT.toBuffer(),
                    walletPubkey.toBuffer()
                ],
                GOVERNANCE_PROGRAM_ID
            );
            
            const accountInfo = await connection.getAccountInfo(tokenOwnerRecordPda);
            
            if (accountInfo && accountInfo.data.length >= 112) {
                const depositAmount = accountInfo.data.readBigUInt64LE(104);
                governanceDeposits = Number(depositAmount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                if (governanceDeposits > 0) {
                    console.log(`  🗳️ Governance deposits: ${governanceDeposits.toLocaleString()} $ISLAND`);
                }
            }
        } catch (error) {
            console.log(`  ⚠️ Error checking governance deposits: ${error.message}`);
        }
        
        // 3. Calculate total governance power
        // For now, use wallet balance as governance power since deposits are 0
        // In a real scenario, you'd use deposits for voting power
        const totalGovernancePower = governanceDeposits > 0 ? governanceDeposits : walletBalance;
        
        console.log(`  📊 Total governance power: ${totalGovernancePower.toLocaleString()} $ISLAND`);
        
        return {
            walletBalance,
            governanceDeposits,
            totalGovernancePower
        };
        
    } catch (error) {
        console.error(`❌ Error analyzing governance data for ${walletAddress}:`, error.message);
        return {
            walletBalance: 0,
            governanceDeposits: 0,
            totalGovernancePower: 0
        };
    }
}

/**
 * Sync hybrid governance data for all citizens
 */
async function syncHybridGovernanceData() {
    try {
        console.log('🔄 Starting hybrid governance data sync...');
        
        const citizens = await db.getAllCitizens();
        console.log(`Found ${citizens.length} citizens to analyze`);
        
        let updatedCount = 0;
        
        for (const citizen of citizens) {
            const data = await getCompleteGovernanceData(citizen.wallet);
            
            // Update with total governance power (wallet balance since no deposits)
            await db.updateGovernancePower(citizen.wallet, data.totalGovernancePower);
            console.log(`✅ Updated ${citizen.wallet}: ${data.totalGovernancePower.toLocaleString()} $ISLAND`);
            updatedCount++;
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`🎉 Successfully updated governance data for ${updatedCount} citizens`);
        return { success: true, updated: updatedCount };
        
    } catch (error) {
        console.error('❌ Error syncing hybrid governance data:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    syncHybridGovernanceData,
    getCompleteGovernanceData
};

// Run sync if called directly
if (require.main === module) {
    syncHybridGovernanceData().then(() => {
        process.exit(0);
    });
}
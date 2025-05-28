/**
 * Direct Governance Power Calculator
 * Using standard SPL Governance without VSR complexity
 * Focus on getting authentic governance data from TokenOwnerRecords
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { SplGovernance } = require('governance-idl-sdk');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const ISLAND_TOKEN_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_DECIMALS = 6;

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

/**
 * Get community token amounts from wallet's token accounts
 */
async function getCommunityTokenAmount(walletAddress) {
    try {
        console.log(`🔍 Fetching community token amount for: ${walletAddress}`);
        
        const walletPubkey = new PublicKey(walletAddress);
        
        // Get all token accounts for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            walletPubkey,
            { mint: ISLAND_TOKEN_MINT }
        );
        
        console.log(`Found ${tokenAccounts.value.length} $ISLAND token accounts`);
        
        let totalTokenAmount = 0;
        
        for (const tokenAccount of tokenAccounts.value) {
            const accountInfo = tokenAccount.account.data.parsed.info;
            const tokenAmount = parseFloat(accountInfo.tokenAmount.uiAmount || 0);
            
            console.log(`Token Account: ${tokenAccount.pubkey.toBase58()}`);
            console.log(`Token Amount: ${tokenAmount.toLocaleString()} $ISLAND`);
            
            totalTokenAmount += tokenAmount;
        }
        
        console.log(`📊 Total community token amount: ${totalTokenAmount.toLocaleString()} $ISLAND`);
        return totalTokenAmount;
        
    } catch (error) {
        console.error(`❌ Error fetching community token amount for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get all governance power data for the entire realm
 */
async function getAllRealmGovernancePower() {
    try {
        console.log('🔍 Fetching ALL governance power data for IslandDAO realm...');
        
        const splGovernance = new SplGovernance(connection, GOVERNANCE_PROGRAM_ID);
        
        // Get all token owner records for the realm
        const allTokenOwnerRecords = await splGovernance.getTokenOwnerRecords({
            realmPk: ISLAND_DAO_REALM
        });
        
        console.log(`✅ Found ${allTokenOwnerRecords.length} total token owner records`);
        
        const governancePowerMap = {};
        
        for (const record of allTokenOwnerRecords) {
            const account = record.account;
            const walletAddress = account.governingTokenOwner.toBase58();
            
            // Check if this is for the ISLAND token mint
            if (account.governingTokenMint.equals(ISLAND_TOKEN_MINT)) {
                if (account.governingTokenDepositAmount) {
                    const depositAmount = account.governingTokenDepositAmount.toNumber();
                    const governancePower = depositAmount / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                    
                    if (governancePower > 0) {
                        governancePowerMap[walletAddress] = governancePower;
                        console.log(`${walletAddress}: ${governancePower.toLocaleString()} $ISLAND`);
                    }
                }
            }
        }
        
        // Check for our known wallets
        const wallet1 = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
        const wallet2 = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        
        console.log('\n🎯 Checking known wallets:');
        console.log(`${wallet1}: ${governancePowerMap[wallet1] || 0} $ISLAND (expected: 8,849,081.676143)`);
        console.log(`${wallet2}: ${governancePowerMap[wallet2] || 0} $ISLAND (expected: 625.58)`);
        
        return governancePowerMap;
        
    } catch (error) {
        console.error('❌ Error fetching all governance power:', error.message);
        return {};
    }
}

/**
 * Test community token amounts with known wallets
 */
async function testCommunityTokenAmounts() {
    console.log('🧪 Testing community token amounts...\n');
    
    const testWallets = [
        '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Expected: 8,849,081.676143
        '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'  // Expected: 625.58
    ];
    
    for (const wallet of testWallets) {
        const tokenAmount = await getCommunityTokenAmount(wallet);
        console.log(`${wallet}: ${tokenAmount.toLocaleString()} $ISLAND\n`);
    }
}

module.exports = {
    getCommunityTokenAmount,
    getAllRealmGovernancePower,
    testCommunityTokenAmounts
};

// Run test if called directly
if (require.main === module) {
    testCommunityTokenAmounts();
}
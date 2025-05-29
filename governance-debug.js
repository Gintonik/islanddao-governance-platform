/**
 * Governance Debug Script
 * Debug the IslandDAO governance structure to understand how governance power is stored
 */

const { Connection, PublicKey } = require('@solana/web3.js');

// Test with known wallets that should have governance power
const TEST_WALLETS = [
    "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA", // Should have ~8.85M ISLAND
    "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4"  // Should have ~625 ISLAND
];

// IslandDAO Configuration
const ISLAND_DAO_CONFIG = {
    realmId: "H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz",
    governanceProgramId: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
    communityMint: "1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy",
    // Alternative governance programs to try
    vsrProgramId: "VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7", // VSR Plugin
    realmsProgram: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
};

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

async function debugGovernanceStructure() {
    try {
        console.log('🔍 Debugging IslandDAO governance structure...');
        
        const connection = new Connection(RPC_URL, 'confirmed');
        const realm = new PublicKey(ISLAND_DAO_CONFIG.realmId);
        
        // 1. Check the realm account itself
        console.log('\n📋 Checking Realm Account...');
        const realmAccount = await connection.getAccountInfo(realm);
        if (realmAccount) {
            console.log(`✅ Realm exists, data length: ${realmAccount.data.length} bytes`);
            console.log(`Owner: ${realmAccount.owner.toString()}`);
        } else {
            console.log('❌ Realm account not found');
            return;
        }
        
        // 2. Check for VSR (Voter Stake Registry) accounts
        console.log('\n🏛️ Checking for VSR Governance Structure...');
        
        for (const testWallet of TEST_WALLETS) {
            console.log(`\nTesting wallet: ${testWallet}`);
            
            const wallet = new PublicKey(testWallet);
            
            // Try different PDA derivations
            await checkStandardGovernance(connection, wallet);
            await checkVSRGovernance(connection, wallet);
            await checkTokenAccounts(connection, wallet);
        }
        
    } catch (error) {
        console.error('❌ Error debugging governance:', error);
    }
}

async function checkStandardGovernance(connection, wallet) {
    try {
        console.log('  📊 Checking Standard SPL Governance...');
        
        const realm = new PublicKey(ISLAND_DAO_CONFIG.realmId);
        const governingTokenMint = new PublicKey(ISLAND_DAO_CONFIG.communityMint);
        const governanceProgramId = new PublicKey(ISLAND_DAO_CONFIG.governanceProgramId);
        
        // Standard Token Owner Record PDA
        const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("governance"),
                realm.toBuffer(),
                governingTokenMint.toBuffer(),
                wallet.toBuffer()
            ],
            governanceProgramId
        );
        
        console.log(`  📍 Token Owner Record PDA: ${tokenOwnerRecordPda.toString()}`);
        
        const tokenOwnerRecord = await connection.getAccountInfo(tokenOwnerRecordPda);
        if (tokenOwnerRecord) {
            console.log(`  ✅ Found standard governance record, data length: ${tokenOwnerRecord.data.length}`);
            
            // Try to parse the deposit amount
            if (tokenOwnerRecord.data.length >= 90) {
                const depositAmount = tokenOwnerRecord.data.readBigUInt64LE(82);
                const governancePower = Number(depositAmount) / Math.pow(10, 6);
                console.log(`  💰 Governance Power: ${governancePower.toLocaleString()} $ISLAND`);
            }
        } else {
            console.log('  ❌ No standard governance record found');
        }
        
    } catch (error) {
        console.log(`  ❌ Error checking standard governance: ${error.message}`);
    }
}

async function checkVSRGovernance(connection, wallet) {
    try {
        console.log('  🗳️  Checking VSR (Voter Stake Registry)...');
        
        const realm = new PublicKey(ISLAND_DAO_CONFIG.realmId);
        const vsrProgram = new PublicKey(ISLAND_DAO_CONFIG.vsrProgramId);
        
        // VSR Voter Weight Record PDA
        const [voterWeightRecordPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("voter-weight-record"),
                realm.toBuffer(),
                new PublicKey(ISLAND_DAO_CONFIG.communityMint).toBuffer(),
                wallet.toBuffer()
            ],
            vsrProgram
        );
        
        console.log(`  📍 VSR Voter Weight Record PDA: ${voterWeightRecordPda.toString()}`);
        
        const voterWeightRecord = await connection.getAccountInfo(voterWeightRecordPda);
        if (voterWeightRecord) {
            console.log(`  ✅ Found VSR record, data length: ${voterWeightRecord.data.length}`);
            // VSR records have different parsing logic
        } else {
            console.log('  ❌ No VSR record found');
        }
        
        // Also check for stake deposit records
        const [stakeDepositRecordPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("stake-deposit-record"),
                voterWeightRecordPda.toBuffer(),
                Buffer.from([0]) // deposit entry index
            ],
            vsrProgram
        );
        
        console.log(`  📍 Stake Deposit Record PDA: ${stakeDepositRecordPda.toString()}`);
        
        const stakeDepositRecord = await connection.getAccountInfo(stakeDepositRecordPda);
        if (stakeDepositRecord) {
            console.log(`  ✅ Found stake deposit record, data length: ${stakeDepositRecord.data.length}`);
        } else {
            console.log('  ❌ No stake deposit record found');
        }
        
    } catch (error) {
        console.log(`  ❌ Error checking VSR governance: ${error.message}`);
    }
}

async function checkTokenAccounts(connection, wallet) {
    try {
        console.log('  🪙 Checking ISLAND Token Accounts...');
        
        const islandMint = new PublicKey(ISLAND_DAO_CONFIG.communityMint);
        
        // Get all token accounts for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet,
            { mint: islandMint }
        );
        
        if (tokenAccounts.value.length > 0) {
            console.log(`  ✅ Found ${tokenAccounts.value.length} ISLAND token account(s)`);
            
            for (const account of tokenAccounts.value) {
                const amount = account.account.data.parsed.info.tokenAmount;
                console.log(`  💰 Token Balance: ${amount.uiAmount} $ISLAND`);
            }
        } else {
            console.log('  ❌ No ISLAND token accounts found');
        }
        
    } catch (error) {
        console.log(`  ❌ Error checking token accounts: ${error.message}`);
    }
}

// Also check what governance APIs are available
async function checkGovernanceAPIs() {
    console.log('\n🌐 Checking available governance APIs...');
    
    // Check if we need special API access for governance data
    console.log('Note: Some governance data might require:');
    console.log('- Helius API key for enhanced RPC access');
    console.log('- Custom RPC endpoint with governance plugin support');
    console.log('- Realms API access for aggregated governance data');
}

// Run the debug
if (require.main === module) {
    debugGovernanceStructure()
        .then(() => {
            checkGovernanceAPIs();
            console.log('\n🔧 Debug complete. Check the results above.');
        })
        .catch(error => {
            console.error('💥 Debug failed:', error);
        });
}

module.exports = {
    debugGovernanceStructure,
    checkStandardGovernance,
    checkVSRGovernance,
    checkTokenAccounts
};
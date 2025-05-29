/**
 * Helius-powered Governance Discovery
 * Use Helius enhanced APIs to find the real IslandDAO governance structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00";

// Known test wallets with governance power
const TEST_WALLETS = [
    "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA", // Should have ~8.85M ISLAND
    "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4"  // Should have ~625 ISLAND
];

// ISLAND token mint
const ISLAND_MINT = "1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy";

async function discoverRealIslandDAOGovernance() {
    try {
        console.log('🔍 Discovering real IslandDAO governance structure using Helius...');
        
        const connection = new Connection(HELIUS_RPC, 'confirmed');
        
        // 1. Search for governance program accounts related to ISLAND token
        console.log('\n📊 Searching for governance accounts...');
        
        // Search using Helius DAS API for governance-related accounts
        const governanceAccounts = await searchGovernanceAccounts(connection);
        
        // 2. Look for token owner records for our test wallets
        console.log('\n🏛️ Searching for governance power in test wallets...');
        
        for (const wallet of TEST_WALLETS) {
            await findGovernancePowerForWallet(connection, wallet);
        }
        
        // 3. Try different governance program IDs
        await tryAlternativeGovernancePrograms(connection);
        
    } catch (error) {
        console.error('❌ Error during governance discovery:', error);
    }
}

async function searchGovernanceAccounts(connection) {
    try {
        // Use getProgramAccounts to find all governance accounts
        const governanceProgramId = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");
        
        console.log('  📋 Fetching all SPL Governance accounts...');
        
        const accounts = await connection.getProgramAccounts(
            governanceProgramId,
            {
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: "1" // Account type discriminator
                        }
                    }
                ]
            }
        );
        
        console.log(`  ✅ Found ${accounts.length} governance accounts`);
        
        // Look for accounts that might be related to ISLAND token
        for (let i = 0; i < Math.min(accounts.length, 10); i++) {
            const account = accounts[i];
            console.log(`  📍 Account ${i + 1}: ${account.pubkey.toString()}`);
            
            // Check if this could be a realm related to ISLAND
            await analyzeGovernanceAccount(connection, account.pubkey, account.account);
        }
        
        return accounts;
        
    } catch (error) {
        console.log(`  ❌ Error searching governance accounts: ${error.message}`);
        return [];
    }
}

async function analyzeGovernanceAccount(connection, accountPubkey, accountInfo) {
    try {
        const data = accountInfo.data;
        
        // Check if this account references the ISLAND token mint
        const islandMintBytes = new PublicKey(ISLAND_MINT).toBytes();
        
        // Simple byte search for the ISLAND mint in the account data
        for (let i = 0; i < data.length - 32; i++) {
            const slice = data.slice(i, i + 32);
            if (Buffer.compare(slice, islandMintBytes) === 0) {
                console.log(`    🎯 Found ISLAND mint reference in account: ${accountPubkey.toString()}`);
                
                // This might be our realm!
                await testAsRealm(connection, accountPubkey);
                break;
            }
        }
        
    } catch (error) {
        console.log(`    ❌ Error analyzing account: ${error.message}`);
    }
}

async function testAsRealm(connection, potentialRealmPubkey) {
    try {
        console.log(`    🧪 Testing ${potentialRealmPubkey.toString()} as realm...`);
        
        // Try to derive token owner records using this as realm
        for (const wallet of TEST_WALLETS.slice(0, 1)) { // Test with just one wallet
            const walletPubkey = new PublicKey(wallet);
            const islandMint = new PublicKey(ISLAND_MINT);
            const governanceProgramId = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");
            
            const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("governance"),
                    potentialRealmPubkey.toBuffer(),
                    islandMint.toBuffer(),
                    walletPubkey.toBuffer()
                ],
                governanceProgramId
            );
            
            const tokenOwnerRecord = await connection.getAccountInfo(tokenOwnerRecordPda);
            if (tokenOwnerRecord) {
                console.log(`    ✅ FOUND TOKEN OWNER RECORD! Realm: ${potentialRealmPubkey.toString()}`);
                console.log(`    📊 Token Owner Record: ${tokenOwnerRecordPda.toString()}`);
                
                // Parse governance power
                if (tokenOwnerRecord.data.length >= 90) {
                    const depositAmount = tokenOwnerRecord.data.readBigUInt64LE(82);
                    const governancePower = Number(depositAmount) / Math.pow(10, 6);
                    console.log(`    💰 Governance Power: ${governancePower.toLocaleString()} $ISLAND`);
                }
                
                return potentialRealmPubkey;
            }
        }
        
    } catch (error) {
        console.log(`    ❌ Error testing as realm: ${error.message}`);
    }
    
    return null;
}

async function findGovernancePowerForWallet(connection, walletAddress) {
    try {
        console.log(`\n  🔍 Searching governance power for: ${walletAddress}`);
        
        // Get all accounts owned by governance program that might reference this wallet
        const walletPubkey = new PublicKey(walletAddress);
        const governanceProgramId = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");
        
        // Search for accounts that contain this wallet address
        const accounts = await connection.getProgramAccounts(
            governanceProgramId,
            {
                filters: [
                    {
                        memcmp: {
                            offset: 50, // Common offset for wallet addresses in governance accounts
                            bytes: walletPubkey.toBase58()
                        }
                    }
                ]
            }
        );
        
        console.log(`  📊 Found ${accounts.length} governance accounts for this wallet`);
        
        for (const account of accounts) {
            console.log(`  📍 Account: ${account.pubkey.toString()}`);
            
            // Try to parse as token owner record
            if (account.account.data.length >= 90) {
                try {
                    const depositAmount = account.account.data.readBigUInt64LE(82);
                    const governancePower = Number(depositAmount) / Math.pow(10, 6);
                    if (governancePower > 0) {
                        console.log(`  ✅ Governance Power: ${governancePower.toLocaleString()} $ISLAND`);
                    }
                } catch (e) {
                    // Not a valid token owner record format
                }
            }
        }
        
    } catch (error) {
        console.log(`  ❌ Error finding governance power: ${error.message}`);
    }
}

async function tryAlternativeGovernancePrograms(connection) {
    console.log('\n🔄 Trying alternative governance programs...');
    
    // Try VSR (Voter Stake Registry)
    const vsrProgramId = new PublicKey("VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7");
    
    try {
        const vsrAccounts = await connection.getProgramAccounts(vsrProgramId);
        console.log(`  📊 Found ${vsrAccounts.length} VSR accounts`);
        
        // Look for voter weight records
        for (let i = 0; i < Math.min(vsrAccounts.length, 5); i++) {
            const account = vsrAccounts[i];
            console.log(`  📍 VSR Account ${i + 1}: ${account.pubkey.toString()}`);
        }
        
    } catch (error) {
        console.log(`  ❌ Error checking VSR: ${error.message}`);
    }
}

// Run discovery
if (require.main === module) {
    discoverRealIslandDAOGovernance()
        .then(() => {
            console.log('\n🎯 Discovery complete. Check results above for the real governance structure.');
        })
        .catch(error => {
            console.error('💥 Discovery failed:', error);
        });
}

module.exports = {
    discoverRealIslandDAOGovernance,
    findGovernancePowerForWallet
};
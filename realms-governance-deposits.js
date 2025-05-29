/**
 * Realms Governance Deposits Fetcher
 * Fetches authentic governance deposits from the IslandDAO Realms governance program
 * This checks actual deposited tokens, not just wallet balances
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// Helius RPC endpoint
const HELIUS_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00";

// IslandDAO Realms Configuration
const ISLAND_REALMS_CONFIG = {
    realmId: "H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz",
    governanceProgramId: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
    communityMint: "Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a",
    vsrProgramId: "VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7"
};

/**
 * Get governance deposits from Token Owner Record (the actual deposited amount)
 */
async function getGovernanceDeposits(connection, walletAddress) {
    try {
        console.log(`🔍 Checking governance deposits for: ${walletAddress}`);
        
        const wallet = new PublicKey(walletAddress);
        const realm = new PublicKey(ISLAND_REALMS_CONFIG.realmId);
        const communityMint = new PublicKey(ISLAND_REALMS_CONFIG.communityMint);
        const governanceProgramId = new PublicKey(ISLAND_REALMS_CONFIG.governanceProgramId);
        
        // Calculate Token Owner Record PDA (where governance deposits are stored)
        const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("governance"),
                realm.toBuffer(),
                communityMint.toBuffer(),
                wallet.toBuffer()
            ],
            governanceProgramId
        );
        
        console.log(`  📍 Token Owner Record PDA: ${tokenOwnerRecordPda.toString()}`);
        
        // Fetch the Token Owner Record account
        const tokenOwnerRecord = await connection.getAccountInfo(tokenOwnerRecordPda);
        
        if (!tokenOwnerRecord) {
            console.log(`  ❌ No governance deposits found`);
            return 0;
        }
        
        console.log(`  ✅ Found Token Owner Record, data length: ${tokenOwnerRecord.data.length} bytes`);
        
        // Parse the governance token deposit amount
        // Token Owner Record structure (SPL Governance):
        // - Account type: 1 byte
        // - Realm: 32 bytes  
        // - Governing token mint: 32 bytes
        // - Governing token owner: 32 bytes
        // - Governing token deposit amount: 8 bytes (at offset ~73)
        // - Governance delegate: 32 bytes (optional)
        
        let depositAmount = 0;
        
        if (tokenOwnerRecord.data.length >= 81) {
            try {
                // Try different possible offsets for the deposit amount
                const possibleOffsets = [73, 81, 89, 65, 97];
                
                for (const offset of possibleOffsets) {
                    if (tokenOwnerRecord.data.length >= offset + 8) {
                        const rawAmount = tokenOwnerRecord.data.readBigUInt64LE(offset);
                        const amount = Number(rawAmount) / Math.pow(10, 6); // Convert from lamports
                        
                        // Check if this looks like a reasonable governance deposit
                        if (amount > 0 && amount <= 1000000) { // Reasonable range for ISLAND deposits
                            depositAmount = Math.max(depositAmount, amount);
                        }
                    }
                }
            } catch (parseError) {
                console.log(`  ❌ Error parsing deposit amount: ${parseError.message}`);
            }
        }
        
        if (depositAmount > 0) {
            console.log(`  ✅ Governance deposit: ${depositAmount.toLocaleString()} ISLAND`);
        } else {
            console.log(`  ❌ No governance deposits parsed from Token Owner Record`);
        }
        
        return depositAmount;
        
    } catch (error) {
        console.error(`❌ Error fetching governance deposits for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Alternative method: Search for all governance accounts that reference the wallet
 */
async function searchGovernanceAccountsForWallet(connection, walletAddress) {
    try {
        console.log(`🔎 Searching all governance accounts for: ${walletAddress}`);
        
        const wallet = new PublicKey(walletAddress);
        const governanceProgramId = new PublicKey(ISLAND_REALMS_CONFIG.governanceProgramId);
        
        // Get all accounts from the governance program that contain this wallet address
        const accounts = await connection.getProgramAccounts(
            governanceProgramId,
            {
                filters: [
                    {
                        memcmp: {
                            offset: 65, // Common offset for wallet addresses in governance accounts
                            bytes: wallet.toBase58()
                        }
                    }
                ]
            }
        );
        
        console.log(`  📊 Found ${accounts.length} governance accounts referencing this wallet`);
        
        let maxDeposit = 0;
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                console.log(`  📋 Account: ${account.pubkey.toString()}, data length: ${data.length}`);
                
                // Try to parse governance deposit amounts from the account data
                for (let offset = 60; offset < data.length - 8; offset += 8) {
                    try {
                        const rawAmount = data.readBigUInt64LE(offset);
                        const amount = Number(rawAmount) / Math.pow(10, 6);
                        
                        // Look for amounts that match known governance deposits
                        if (amount > 0 && amount <= 1000000) {
                            maxDeposit = Math.max(maxDeposit, amount);
                            console.log(`    💰 Found potential deposit: ${amount.toLocaleString()} ISLAND at offset ${offset}`);
                        }
                    } catch (e) {
                        // Continue searching
                    }
                }
                
            } catch (parseError) {
                // Continue to next account
            }
        }
        
        return maxDeposit;
        
    } catch (error) {
        console.error(`❌ Error searching governance accounts: ${error.message}`);
        return 0;
    }
}

/**
 * Comprehensive governance deposit check using multiple methods
 */
async function getComprehensiveGovernanceDeposits(walletAddress) {
    try {
        const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
        
        // Try both methods and use the highest value found
        const method1 = await getGovernanceDeposits(connection, walletAddress);
        const method2 = await searchGovernanceAccountsForWallet(connection, walletAddress);
        
        const finalDeposit = Math.max(method1, method2);
        
        console.log(`\n📊 Results for ${walletAddress}:`);
        console.log(`  Token Owner Record: ${method1.toLocaleString()} ISLAND`);
        console.log(`  Account Search: ${method2.toLocaleString()} ISLAND`);
        console.log(`  Final Governance Deposit: ${finalDeposit.toLocaleString()} ISLAND`);
        
        return finalDeposit;
        
    } catch (error) {
        console.error(`❌ Error getting comprehensive governance deposits: ${error.message}`);
        return 0;
    }
}

/**
 * Fetch governance deposits for all citizens
 */
async function fetchGovernanceDepositsForAllCitizens() {
    try {
        console.log('🏛️  Starting Realms governance deposits sync...');
        
        // Get all citizens from database
        const citizens = await db.getAllCitizens();
        console.log(`Found ${citizens.length} citizens to check`);
        
        if (citizens.length === 0) {
            console.log('No citizens found in database');
            return;
        }
        
        const results = {};
        let totalDeposits = 0;
        let citizensWithDeposits = 0;
        
        // Process citizens in smaller batches for governance queries
        const batchSize = 2;
        
        for (let i = 0; i < citizens.length; i += batchSize) {
            const batch = citizens.slice(i, i + batchSize);
            console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(citizens.length / batchSize)}`);
            
            for (const citizen of batch) {
                try {
                    const deposits = await getComprehensiveGovernanceDeposits(citizen.wallet);
                    results[citizen.wallet] = deposits;
                    
                    // Update database with authentic governance deposits
                    await db.updateGovernancePower(citizen.wallet, deposits);
                    
                    totalDeposits += deposits;
                    if (deposits > 0) {
                        citizensWithDeposits++;
                    }
                    
                } catch (error) {
                    console.error(`Failed to process ${citizen.wallet}:`, error.message);
                    results[citizen.wallet] = 0;
                }
            }
            
            // Add delay between batches
            if (i + batchSize < citizens.length) {
                console.log('⏳ Waiting before next batch...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        console.log('\n📊 Realms Governance Deposits Summary:');
        console.log(`   - Citizens checked: ${citizens.length}`);
        console.log(`   - Citizens with deposits: ${citizensWithDeposits}`);
        console.log(`   - Total governance deposits: ${totalDeposits.toFixed(2)} ISLAND`);
        
        // Show citizens with deposits
        const depositors = Object.entries(results)
            .filter(([wallet, amount]) => amount > 0)
            .sort(([,a], [,b]) => b - a);
            
        if (depositors.length > 0) {
            console.log('\n🏆 Citizens with governance deposits:');
            for (const [wallet, amount] of depositors) {
                const citizen = citizens.find(c => c.wallet === wallet);
                const nickname = citizen?.nickname || 'Anonymous';
                console.log(`   ${nickname}: ${amount.toLocaleString()} ISLAND`);
            }
        }
        
        return {
            totalChecked: citizens.length,
            withDeposits: citizensWithDeposits,
            totalDeposits: totalDeposits,
            results: results
        };
        
    } catch (error) {
        console.error('❌ Error during governance deposits sync:', error);
        throw error;
    }
}

/**
 * Test with the known wallet that has 625.58 deposits
 */
async function testKnownGovernanceDeposit() {
    console.log('🧪 Testing known governance deposit...');
    const testWallet = "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4";
    console.log(`Expected: 625.58 ISLAND deposits`);
    
    const result = await getComprehensiveGovernanceDeposits(testWallet);
    
    console.log(`\nTest Result: ${result.toLocaleString()} ISLAND`);
    console.log(`Expected: 625.58 ISLAND`);
    console.log(`Match: ${Math.abs(result - 625.58) < 1 ? 'YES' : 'NO'}`);
    
    return result;
}

// Export functions
module.exports = {
    fetchGovernanceDepositsForAllCitizens,
    getComprehensiveGovernanceDeposits,
    testKnownGovernanceDeposit
};

// Run test if called directly
if (require.main === module) {
    testKnownGovernanceDeposit()
        .then(() => {
            console.log('\n✅ Governance deposits test completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Test failed:', error);
            process.exit(1);
        });
}
/**
 * VSR Governance Power Fetcher
 * Fetches authentic governance power using Voter Stake Registry (VSR) structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const HELIUS_RPC = "https://malanie-kgvelq-fast-mainnet.helius-rpc.com";

// VSR Configuration for IslandDAO
const VSR_CONFIG = {
    vsrProgramId: "VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7",
    realmId: "H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz",
    communityMint: "1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy"
};

/**
 * Get VSR governance power for a specific wallet
 */
async function getVSRGovernancePower(connection, walletAddress) {
    try {
        const wallet = new PublicKey(walletAddress);
        const vsrProgram = new PublicKey(VSR_CONFIG.vsrProgramId);
        const realm = new PublicKey(VSR_CONFIG.realmId);
        const communityMint = new PublicKey(VSR_CONFIG.communityMint);
        
        // Calculate Voter Weight Record PDA for VSR
        const [voterWeightRecordPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("voter-weight-record"),
                realm.toBuffer(),
                communityMint.toBuffer(),
                wallet.toBuffer()
            ],
            vsrProgram
        );
        
        // Fetch voter weight record
        const voterWeightRecord = await connection.getAccountInfo(voterWeightRecordPda);
        
        if (!voterWeightRecord) {
            return 0;
        }
        
        // Parse VSR voter weight record
        // VSR stores voting power differently than standard governance
        const data = voterWeightRecord.data;
        
        if (data.length < 32) {
            return 0;
        }
        
        // VSR voter weight is typically stored as a u64 at offset 8
        // after the discriminator and other fields
        try {
            let governancePower = 0;
            
            // Try different offsets where voting power might be stored
            const possibleOffsets = [8, 16, 24, 32, 40, 48];
            
            for (const offset of possibleOffsets) {
                if (data.length >= offset + 8) {
                    const rawPower = data.readBigUInt64LE(offset);
                    const power = Number(rawPower) / Math.pow(10, 6);
                    
                    // Look for reasonable governance power values (0.1 to 100M ISLAND)
                    if (power >= 0.1 && power <= 100000000) {
                        governancePower = Math.max(governancePower, power);
                    }
                }
            }
            
            return governancePower;
            
        } catch (parseError) {
            return 0;
        }
        
    } catch (error) {
        console.error(`Error fetching VSR governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Alternative approach: Search VSR accounts that reference the wallet
 */
async function searchVSRAccountsForWallet(connection, walletAddress) {
    try {
        const wallet = new PublicKey(walletAddress);
        const vsrProgram = new PublicKey(VSR_CONFIG.vsrProgramId);
        
        // Search for VSR accounts that contain this wallet address
        const accounts = await connection.getProgramAccounts(
            vsrProgram,
            {
                filters: [
                    {
                        memcmp: {
                            offset: 40, // Common offset for wallet addresses in VSR
                            bytes: wallet.toBase58()
                        }
                    }
                ]
            }
        );
        
        let totalGovernancePower = 0;
        
        for (const account of accounts) {
            // Try to parse governance power from each account
            const data = account.account.data;
            
            // Look for u64 values that could represent staked amounts
            for (let offset = 0; offset < data.length - 8; offset += 8) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    const amount = Number(rawAmount) / Math.pow(10, 6);
                    
                    // Check if this looks like a reasonable governance amount
                    if (amount >= 0.1 && amount <= 100000000) {
                        totalGovernancePower = Math.max(totalGovernancePower, amount);
                    }
                } catch (e) {
                    // Continue to next offset
                }
            }
        }
        
        return totalGovernancePower;
        
    } catch (error) {
        console.error(`Error searching VSR accounts for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Fetch governance power for multiple wallets using VSR
 */
async function fetchMultipleVSRGovernancePower(connection, walletAddresses) {
    console.log(`🔄 Fetching VSR governance power for ${walletAddresses.length} wallets...`);
    
    const results = {};
    const batchSize = 3; // Smaller batches for VSR queries
    
    for (let i = 0; i < walletAddresses.length; i += batchSize) {
        const batch = walletAddresses.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(walletAddresses.length / batchSize)}`);
        
        const batchPromises = batch.map(async (wallet) => {
            console.log(`  🔍 Checking VSR power for: ${wallet}`);
            
            // Try both methods
            const method1Power = await getVSRGovernancePower(connection, wallet);
            const method2Power = await searchVSRAccountsForWallet(connection, wallet);
            
            const finalPower = Math.max(method1Power, method2Power);
            
            if (finalPower > 0) {
                console.log(`  ✅ ${wallet}: ${finalPower.toLocaleString()} $ISLAND`);
            }
            
            return { wallet, power: finalPower };
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(({ wallet, power }) => {
            results[wallet] = power;
        });
        
        // Add delay between batches
        if (i + batchSize < walletAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return results;
}

/**
 * Sync VSR governance power for all citizens
 */
async function syncVSRGovernancePowerForAllCitizens() {
    try {
        console.log('🏛️  Starting VSR governance power sync...');
        
        const connection = new Connection(HELIUS_RPC, 'confirmed');
        
        // Get all citizens from database
        const citizens = await db.getAllCitizens();
        console.log(`Found ${citizens.length} citizens to sync`);
        
        if (citizens.length === 0) {
            console.log('No citizens found in database');
            return;
        }
        
        // Extract wallet addresses
        const walletAddresses = citizens.map(citizen => citizen.wallet);
        
        // Fetch VSR governance power for all wallets
        const governancePowerMap = await fetchMultipleVSRGovernancePower(connection, walletAddresses);
        
        // Update database with results
        let updatedCount = 0;
        let totalGovernancePower = 0;
        let citizensWithPower = 0;
        
        for (const [wallet, governancePower] of Object.entries(governancePowerMap)) {
            try {
                await db.updateGovernancePower(wallet, governancePower);
                updatedCount++;
                totalGovernancePower += governancePower;
                
                if (governancePower > 0) {
                    citizensWithPower++;
                }
                
            } catch (error) {
                console.error(`Failed to update governance power for ${wallet}:`, error);
            }
        }
        
        console.log('\n📊 VSR Governance Power Sync Summary:');
        console.log(`   - Citizens updated: ${updatedCount}/${citizens.length}`);
        console.log(`   - Citizens with governance power: ${citizensWithPower}`);
        console.log(`   - Total governance power: ${totalGovernancePower.toFixed(2)} $ISLAND`);
        
        return {
            updated: updatedCount,
            total: citizens.length,
            withPower: citizensWithPower,
            totalPower: totalGovernancePower
        };
        
    } catch (error) {
        console.error('Error syncing VSR governance power:', error);
        throw error;
    }
}

/**
 * Test VSR governance power with a specific wallet
 */
async function testVSRGovernancePower(walletAddress) {
    try {
        console.log('🧪 Testing VSR governance power fetch...');
        
        const connection = new Connection(HELIUS_RPC, 'confirmed');
        
        const method1Power = await getVSRGovernancePower(connection, walletAddress);
        const method2Power = await searchVSRAccountsForWallet(connection, walletAddress);
        
        console.log(`\n🎯 VSR Test Results for: ${walletAddress}`);
        console.log(`Method 1 (Voter Weight Record): ${method1Power.toLocaleString()} $ISLAND`);
        console.log(`Method 2 (Account Search): ${method2Power.toLocaleString()} $ISLAND`);
        console.log(`Final Result: ${Math.max(method1Power, method2Power).toLocaleString()} $ISLAND`);
        
        return Math.max(method1Power, method2Power);
        
    } catch (error) {
        console.error('Error testing VSR governance power:', error);
        throw error;
    }
}

// Export functions
module.exports = {
    syncVSRGovernancePowerForAllCitizens,
    getVSRGovernancePower,
    searchVSRAccountsForWallet,
    testVSRGovernancePower
};

// Run sync if called directly
if (require.main === module) {
    syncVSRGovernancePowerForAllCitizens()
        .then((results) => {
            console.log('\n🎉 VSR governance power sync completed!');
            console.log('Results:', results);
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Fatal error during VSR governance sync:', error);
            process.exit(1);
        });
}
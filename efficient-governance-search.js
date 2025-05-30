/**
 * Efficient Governance Search
 * Find actual governance power by searching for the weighted amounts in VSR
 * Use targeted search for specific governance power values
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// Test with known value for verification
const TEST_WALLET = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
const EXPECTED_VALUE = 3361730.150474;

/**
 * Search for specific governance power amount in VSR accounts
 */
async function findSpecificGovernanceAmount(targetAmount, walletAddress = null) {
    try {
        console.log(`Searching for governance power: ${targetAmount.toLocaleString()} ISLAND`);
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        
        // Convert target amount to raw value
        const targetRaw = Math.round(targetAmount * Math.pow(10, 6));
        console.log(`Target raw value: ${targetRaw}`);
        
        // Use RPC filter to find accounts containing this amount
        console.log('Using memcmp filter to find accounts with target amount...');
        
        // Try different offsets where governance amounts might be stored
        const searchOffsets = [72, 80, 88, 96, 104, 112, 120, 128];
        
        for (const offset of searchOffsets) {
            try {
                console.log(`Searching at offset ${offset}...`);
                
                const accounts = await connection.getProgramAccounts(vsrProgramId, {
                    filters: [
                        {
                            memcmp: {
                                offset: offset,
                                bytes: Buffer.from(targetRaw.toString(16).padStart(16, '0'), 'hex').reverse()
                            }
                        }
                    ]
                });
                
                console.log(`Found ${accounts.length} accounts with target amount at offset ${offset}`);
                
                if (accounts.length > 0 && walletAddress) {
                    // Check if any of these accounts contain our target wallet
                    const walletPubkey = new PublicKey(walletAddress);
                    const walletBuffer = walletPubkey.toBuffer();
                    
                    for (const account of accounts) {
                        const data = account.account.data;
                        
                        // Look for wallet reference in this account
                        for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 4) {
                            if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
                                console.log(`✅ Found target wallet in account ${account.pubkey.toString()}`);
                                console.log(`   Governance amount: ${targetAmount.toLocaleString()} ISLAND at offset ${offset}`);
                                console.log(`   Wallet found at offset: ${walletOffset}`);
                                return {
                                    found: true,
                                    amount: targetAmount,
                                    account: account.pubkey.toString(),
                                    amountOffset: offset,
                                    walletOffset: walletOffset
                                };
                            }
                        }
                    }
                } else if (accounts.length > 0) {
                    console.log(`Found ${accounts.length} accounts with amount ${targetAmount.toLocaleString()}`);
                    return {
                        found: true,
                        amount: targetAmount,
                        accounts: accounts.map(acc => acc.pubkey.toString())
                    };
                }
                
            } catch (error) {
                console.log(`Error searching offset ${offset}: ${error.message}`);
                continue;
            }
        }
        
        return { found: false };
        
    } catch (error) {
        console.error('Error in specific amount search:', error.message);
        return { found: false };
    }
}

/**
 * Find governance power for a citizen by searching VSR efficiently
 */
async function findCitizenGovernancePower(walletAddress) {
    try {
        console.log(`\nFinding governance power for ${walletAddress}:`);
        
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        // First, get all VSR accounts containing this wallet
        console.log('Finding VSR accounts containing wallet...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        
        // Use memcmp to find accounts containing the wallet
        const walletAccounts = await connection.getProgramAccounts(vsrProgramId, {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: walletAddress
                    }
                }
            ]
        });
        
        console.log(`Found ${walletAccounts.length} VSR accounts containing wallet`);
        
        if (walletAccounts.length === 0) {
            console.log('No VSR accounts found for this wallet');
            return 0;
        }
        
        // Now search these specific accounts for governance amounts
        const governanceAmounts = [];
        
        for (const account of walletAccounts) {
            console.log(`Analyzing account ${account.pubkey.toString().substring(0, 8)}...`);
            const data = account.account.data;
            
            // Search for governance power amounts in this account
            for (let offset = 70; offset <= Math.min(data.length - 8, 200); offset += 8) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                    
                    // Look for realistic governance amounts
                    if (tokenAmount >= 10000 && tokenAmount <= 20000000) {
                        console.log(`  Found potential governance: ${tokenAmount.toLocaleString()} ISLAND at offset ${offset}`);
                        governanceAmounts.push(tokenAmount);
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        if (governanceAmounts.length === 0) {
            console.log('No governance amounts found');
            return 0;
        }
        
        // Remove duplicates and find the most likely governance power
        const uniqueAmounts = [...new Set(governanceAmounts)];
        console.log(`Found ${uniqueAmounts.length} unique potential amounts:`);
        uniqueAmounts.forEach(amount => {
            console.log(`  ${amount.toLocaleString()} ISLAND`);
        });
        
        // Return the largest reasonable amount (likely the total governance power)
        const maxAmount = Math.max(...uniqueAmounts);
        console.log(`Selected governance power: ${maxAmount.toLocaleString()} ISLAND`);
        
        return maxAmount;
        
    } catch (error) {
        console.error(`Error finding governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Test with known wallet to verify method
 */
async function testWithKnownWallet() {
    console.log('=== TESTING WITH KNOWN WALLET ===\n');
    
    // Test searching for the known amount
    const searchResult = await findSpecificGovernanceAmount(EXPECTED_VALUE, TEST_WALLET);
    
    if (searchResult.found) {
        console.log(`✅ Successfully found expected amount using memcmp search`);
    } else {
        console.log(`❌ Could not find expected amount, trying general search...`);
        
        // Fall back to general search
        const foundAmount = await findCitizenGovernancePower(TEST_WALLET);
        
        const difference = Math.abs(foundAmount - EXPECTED_VALUE);
        const percentDiff = (difference / EXPECTED_VALUE) * 100;
        
        console.log(`Expected: ${EXPECTED_VALUE.toLocaleString()} ISLAND`);
        console.log(`Found: ${foundAmount.toLocaleString()} ISLAND`);
        console.log(`Difference: ${percentDiff.toFixed(2)}%`);
        
        if (percentDiff < 5) {
            console.log(`✅ Close match - method is working`);
            return foundAmount;
        } else {
            console.log(`❌ Method needs refinement`);
            return 0;
        }
    }
}

/**
 * Process a few citizens to test the method
 */
async function testMethodWithCitizens() {
    try {
        console.log('=== TESTING GOVERNANCE SEARCH METHOD ===\n');
        
        // First test with known wallet
        await testWithKnownWallet();
        
        // Get a few citizens to test
        const result = await pool.query('SELECT wallet FROM citizens LIMIT 3');
        const testCitizens = result.rows.map(row => row.wallet);
        
        console.log(`\nTesting method with ${testCitizens.length} citizens:\n`);
        
        for (const wallet of testCitizens) {
            const governancePower = await findCitizenGovernancePower(wallet);
            console.log(`${wallet}: ${governancePower.toLocaleString()} ISLAND\n`);
        }
        
    } catch (error) {
        console.error('Error testing method:', error.message);
    }
}

if (require.main === module) {
    testMethodWithCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { findCitizenGovernancePower, findSpecificGovernanceAmount };
/**
 * Focused VSR Aggregation
 * Process known active citizens first to verify the method, then all citizens
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// Known citizens with governance power to verify method
const PRIORITY_CITIZENS = [
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', 
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
    '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk',
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'
];

// Expected values for verification
const EXPECTED_VALUES = {
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': 8849081.676143,
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': 10353648.013,
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 3361730.150474,
    '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk': 383487.297,
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': 12625.580931
};

/**
 * Aggregate ALL VSR deposits for a single citizen
 */
async function aggregateVSRForCitizen(citizenWallet, vsrAccounts) {
    try {
        const citizenPubkey = new PublicKey(citizenWallet);
        const citizenBuffer = citizenPubkey.toBuffer();
        
        console.log(`Aggregating VSR deposits for ${citizenWallet}`);
        
        const allDeposits = [];
        let accountsWithWallet = 0;
        
        // Search all VSR accounts for this citizen
        for (let i = 0; i < vsrAccounts.length; i++) {
            const account = vsrAccounts[i];
            const data = account.account.data;
            
            if (i % 2000 === 0) {
                console.log(`  Searching account ${i + 1}/${vsrAccounts.length}...`);
            }
            
            // Look for wallet reference
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(citizenBuffer)) {
                    accountsWithWallet++;
                    console.log(`    Found wallet in account ${account.pubkey.toString().substring(0, 8)}... at offset ${offset}`);
                    
                    // Search for amounts around the wallet reference
                    const deposits = [];
                    const searchStart = Math.max(0, offset - 200);
                    const searchEnd = Math.min(data.length - 8, offset + 200);
                    
                    for (let amountOffset = searchStart; amountOffset <= searchEnd; amountOffset += 8) {
                        try {
                            const amount = data.readBigUInt64LE(amountOffset);
                            const tokenAmount = Number(amount) / Math.pow(10, 6);
                            
                            // Filter for realistic ISLAND amounts
                            if (tokenAmount >= 0.1 && tokenAmount <= 50000000) {
                                deposits.push({
                                    amount: tokenAmount,
                                    account: account.pubkey.toString(),
                                    offset: amountOffset
                                });
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    
                    if (deposits.length > 0) {
                        console.log(`      Found ${deposits.length} potential deposits:`);
                        deposits.forEach(dep => {
                            console.log(`        ${dep.amount.toLocaleString()} ISLAND at offset ${dep.offset}`);
                        });
                        allDeposits.push(...deposits);
                    }
                    break; // Found wallet in this account, move to next account
                }
            }
        }
        
        console.log(`  Total accounts with wallet: ${accountsWithWallet}`);
        console.log(`  Total potential deposits found: ${allDeposits.length}`);
        
        // Remove duplicates and aggregate
        const uniqueAmounts = new Map();
        
        for (const deposit of allDeposits) {
            const key = `${deposit.account}-${deposit.amount}`;
            if (!uniqueAmounts.has(key)) {
                uniqueAmounts.set(key, deposit.amount);
            }
        }
        
        const finalAmounts = Array.from(uniqueAmounts.values());
        const totalGovernance = finalAmounts.reduce((sum, amount) => sum + amount, 0);
        
        console.log(`  Final unique deposits: ${finalAmounts.length}`);
        console.log(`  Total governance power: ${totalGovernance.toLocaleString()} ISLAND`);
        
        return {
            totalPower: totalGovernance,
            uniqueDeposits: finalAmounts,
            accountsFound: accountsWithWallet
        };
        
    } catch (error) {
        console.error(`Error aggregating VSR for ${citizenWallet}:`, error.message);
        return { totalPower: 0, uniqueDeposits: [], accountsFound: 0 };
    }
}

/**
 * Process priority citizens first to verify method
 */
async function processPriorityCitizens() {
    try {
        console.log('Processing priority citizens to verify aggregation method...\n');
        
        // Get all VSR accounts once
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const vsrAccounts = await connection.getProgramAccounts(vsrProgramId);
        console.log(`Retrieved ${vsrAccounts.length} VSR accounts\n`);
        
        const results = {};
        
        for (let i = 0; i < PRIORITY_CITIZENS.length; i++) {
            const citizen = PRIORITY_CITIZENS[i];
            console.log(`\n[${i + 1}/${PRIORITY_CITIZENS.length}] Processing ${citizen}:`);
            
            const result = await aggregateVSRForCitizen(citizen, vsrAccounts);
            results[citizen] = result.totalPower;
            
            // Verify against expected value
            if (EXPECTED_VALUES[citizen]) {
                const expected = EXPECTED_VALUES[citizen];
                const found = result.totalPower;
                const difference = Math.abs(found - expected);
                const percentDiff = expected > 0 ? (difference / expected) * 100 : 0;
                
                console.log(`  Expected: ${expected.toLocaleString()} ISLAND`);
                console.log(`  Found: ${found.toLocaleString()} ISLAND`);
                
                if (percentDiff < 5) {
                    console.log(`  ✅ CLOSE MATCH (${percentDiff.toFixed(2)}% difference)`);
                } else if (found > expected) {
                    console.log(`  📈 FOUND MORE (${(found - expected).toLocaleString()} ISLAND additional)`);
                } else {
                    console.log(`  ⚠️ DIFFERENCE (${difference.toLocaleString()} ISLAND, ${percentDiff.toFixed(2)}%)`);
                }
            }
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [result.totalPower, citizen]
            );
        }
        
        return results;
        
    } catch (error) {
        console.error('Error processing priority citizens:', error.message);
        return {};
    }
}

/**
 * Process all remaining citizens
 */
async function processAllCitizens() {
    try {
        console.log('\n\nProcessing all remaining citizens...\n');
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
        const allCitizens = citizensResult.rows.map(row => row.wallet);
        
        // Filter out priority citizens already processed
        const remainingCitizens = allCitizens.filter(wallet => !PRIORITY_CITIZENS.includes(wallet));
        
        console.log(`Processing ${remainingCitizens.length} remaining citizens...`);
        
        // Get VSR accounts
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const vsrAccounts = await connection.getProgramAccounts(vsrProgramId);
        
        const results = {};
        
        for (let i = 0; i < remainingCitizens.length; i++) {
            const citizen = remainingCitizens[i];
            console.log(`\n[${i + 1}/${remainingCitizens.length}] Processing ${citizen}:`);
            
            const result = await aggregateVSRForCitizen(citizen, vsrAccounts);
            results[citizen] = result.totalPower;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [result.totalPower, citizen]
            );
            
            if (result.totalPower > 0) {
                console.log(`  ✅ Found ${result.totalPower.toLocaleString()} ISLAND governance power`);
            } else {
                console.log(`  ○ No governance power found`);
            }
        }
        
        return results;
        
    } catch (error) {
        console.error('Error processing all citizens:', error.message);
        return {};
    }
}

/**
 * Main aggregation function
 */
async function main() {
    try {
        // Process priority citizens first
        const priorityResults = await processPriorityCitizens();
        
        // Then process all remaining citizens  
        const remainingResults = await processAllCitizens();
        
        // Combine results
        const allResults = { ...priorityResults, ...remainingResults };
        
        // Final summary
        const citizensWithPower = Object.values(allResults).filter(power => power > 0).length;
        const totalPower = Object.values(allResults).reduce((sum, power) => sum + power, 0);
        
        console.log(`\n\n=== FINAL COMPREHENSIVE VSR AGGREGATION RESULTS ===`);
        console.log(`Citizens with governance power: ${citizensWithPower}/19`);
        console.log(`Total aggregated governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Show final ranking
        console.log('\nFinal governance power ranking:');
        const ranked = Object.entries(allResults)
            .filter(([_, power]) => power > 0)
            .sort(([_, a], [__, b]) => b - a);
            
        ranked.forEach(([wallet, power], index) => {
            const percentage = ((power / totalPower) * 100).toFixed(2);
            console.log(`  ${index + 1}. ${wallet}: ${power.toLocaleString()} ISLAND (${percentage}%)`);
        });
        
    } catch (error) {
        console.error('Main process failed:', error.message);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { aggregateVSRForCitizen, processPriorityCitizens, processAllCitizens };
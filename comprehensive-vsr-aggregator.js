/**
 * Comprehensive VSR Aggregator
 * Find ALL VSR deposits for each citizen and sum them up
 * Each citizen can have multiple VSR deposits with different lock periods
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// Known test values to verify against
const KNOWN_VALUES = {
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': 8849081.676143,
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': 10353648.013,
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 3361730.150474,
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC': 1368236.699,
    '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk': 383487.297,
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': 12625.580931
};

/**
 * Get all citizen wallets from database
 */
async function getAllCitizenWallets() {
    try {
        const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
        return result.rows.map(row => row.wallet);
    } catch (error) {
        console.error('Error getting citizen wallets:', error.message);
        return [];
    }
}

/**
 * Search for ALL VSR deposits for a specific citizen
 */
async function findAllVSRDepositsForCitizen(citizenWallet, allVSRAccounts) {
    try {
        const citizenPubkey = new PublicKey(citizenWallet);
        const citizenBuffer = citizenPubkey.toBuffer();
        
        const vsrDeposits = [];
        let accountsChecked = 0;
        
        console.log(`Searching ${allVSRAccounts.length} VSR accounts for ${citizenWallet}`);
        
        for (const account of allVSRAccounts) {
            accountsChecked++;
            
            if (accountsChecked % 1000 === 0) {
                console.log(`  Checked ${accountsChecked}/${allVSRAccounts.length} accounts...`);
            }
            
            const data = account.account.data;
            
            // Search for citizen wallet reference in the account data
            for (let offset = 0; offset <= data.length - 32; offset++) {
                if (data.subarray(offset, offset + 32).equals(citizenBuffer)) {
                    console.log(`    Found wallet reference at offset ${offset}`);
                    
                    // Look for amounts near the wallet reference
                    const searchStart = Math.max(0, offset - 200);
                    const searchEnd = Math.min(data.length - 8, offset + 200);
                    
                    for (let amountOffset = searchStart; amountOffset <= searchEnd; amountOffset += 8) {
                        try {
                            const amount = data.readBigUInt64LE(amountOffset);
                            const tokenAmount = Number(amount) / Math.pow(10, 6);
                            
                            // Look for realistic ISLAND amounts
                            if (tokenAmount >= 1 && tokenAmount <= 50000000) {
                                vsrDeposits.push({
                                    amount: tokenAmount,
                                    accountPubkey: account.pubkey.toString(),
                                    walletOffset: offset,
                                    amountOffset: amountOffset
                                });
                                console.log(`      Found amount: ${tokenAmount.toLocaleString()} ISLAND`);
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    break; // Found wallet, no need to continue searching this account
                }
            }
        }
        
        return vsrDeposits;
        
    } catch (error) {
        console.error(`Error searching VSR for ${citizenWallet}:`, error.message);
        return [];
    }
}

/**
 * Aggregate all VSR deposits for a citizen to get total governance power
 */
function aggregateVSRDeposits(vsrDeposits, citizenWallet) {
    if (vsrDeposits.length === 0) {
        return { total: 0, deposits: [] };
    }
    
    // Group by amount and account to avoid duplicates
    const uniqueDeposits = new Map();
    
    for (const deposit of vsrDeposits) {
        const key = `${deposit.accountPubkey}-${deposit.amount}`;
        
        if (!uniqueDeposits.has(key)) {
            uniqueDeposits.set(key, deposit);
        }
    }
    
    const finalDeposits = Array.from(uniqueDeposits.values());
    const totalGovernancePower = finalDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
    
    console.log(`  ${citizenWallet}: Found ${finalDeposits.length} unique VSR deposits`);
    finalDeposits.forEach((deposit, index) => {
        console.log(`    ${index + 1}. ${deposit.amount.toLocaleString()} ISLAND in ${deposit.accountPubkey.substring(0, 8)}...`);
    });
    console.log(`    Total: ${totalGovernancePower.toLocaleString()} ISLAND`);
    
    return {
        total: totalGovernancePower,
        deposits: finalDeposits
    };
}

/**
 * Comprehensive VSR search for all citizens
 */
async function comprehensiveVSRSearch() {
    try {
        console.log('Starting comprehensive VSR search for all citizens...\n');
        
        // Get all citizen wallets
        const citizenWallets = await getAllCitizenWallets();
        console.log(`Found ${citizenWallets.length} citizens to search`);
        
        // Get ALL VSR accounts once
        console.log('\nFetching all VSR program accounts...');
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        console.log(`Retrieved ${allVSRAccounts.length} VSR accounts\n`);
        
        const citizenGovernancePowers = {};
        
        // Search each citizen individually
        for (let i = 0; i < citizenWallets.length; i++) {
            const citizenWallet = citizenWallets[i];
            console.log(`\n[${i + 1}/${citizenWallets.length}] Processing ${citizenWallet}:`);
            
            const vsrDeposits = await findAllVSRDepositsForCitizen(citizenWallet, allVSRAccounts);
            const aggregated = aggregateVSRDeposits(vsrDeposits, citizenWallet);
            
            if (aggregated.total > 0) {
                citizenGovernancePowers[citizenWallet] = aggregated.total;
                
                // Verify against known values
                if (KNOWN_VALUES[citizenWallet]) {
                    const expected = KNOWN_VALUES[citizenWallet];
                    const difference = Math.abs(aggregated.total - expected);
                    const percentDiff = (difference / expected) * 100;
                    
                    console.log(`    ✓ Known value: ${expected.toLocaleString()} ISLAND`);
                    console.log(`    ✓ Found value: ${aggregated.total.toLocaleString()} ISLAND`);
                    
                    if (percentDiff < 1) {
                        console.log(`    ✅ MATCH! (${percentDiff.toFixed(2)}% difference)`);
                    } else {
                        console.log(`    ⚠️  DIFFERENCE: ${difference.toLocaleString()} ISLAND (${percentDiff.toFixed(2)}%)`);
                    }
                }
            } else {
                console.log(`    No VSR deposits found`);
            }
        }
        
        return citizenGovernancePowers;
        
    } catch (error) {
        console.error('Error in comprehensive VSR search:', error.message);
        return {};
    }
}

/**
 * Update database with comprehensive VSR results
 */
async function updateDatabaseWithVSRResults(governancePowers) {
    try {
        console.log('\n\nUpdating database with comprehensive VSR results...');
        
        const citizenWallets = await getAllCitizenWallets();
        
        for (const wallet of citizenWallets) {
            const power = governancePowers[wallet] || 0;
            
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, wallet]
            );
        }
        
        const citizensWithPower = Object.keys(governancePowers).length;
        const totalPower = Object.values(governancePowers).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nComprehensive VSR search complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${citizenWallets.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Show final ranking
        console.log('\nFinal citizen governance ranking:');
        const ranked = Object.entries(governancePowers)
            .sort(([_, a], [__, b]) => b - a);
            
        ranked.forEach(([wallet, power], index) => {
            const percentage = ((power / totalPower) * 100).toFixed(2);
            console.log(`  ${index + 1}. ${wallet}: ${power.toLocaleString()} ISLAND (${percentage}%)`);
        });
        
    } catch (error) {
        console.error('Error updating database:', error.message);
    }
}

/**
 * Main function
 */
async function main() {
    try {
        const governancePowers = await comprehensiveVSRSearch();
        await updateDatabaseWithVSRResults(governancePowers);
        
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

module.exports = { comprehensiveVSRSearch, updateDatabaseWithVSRResults };
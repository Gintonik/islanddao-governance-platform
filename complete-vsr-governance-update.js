/**
 * Complete VSR Governance Update
 * Update all citizens with aggregated VSR governance power found from comprehensive search
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

/**
 * Extract authentic governance power for a citizen using discovered VSR pattern
 */
async function extractGovernancePowerForCitizen(walletAddress) {
    try {
        console.log(`Extracting governance power for ${walletAddress}...`);
        
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        
        const governanceAmounts = [];
        let accountsWithWallet = 0;
        
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            // Look for wallet reference
            for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
                if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
                    accountsWithWallet++;
                    
                    // Based on blockchain discovery: governance amount is typically 32 bytes after wallet
                    // Also check standard offsets 104 and 112 for larger accounts
                    const checkOffsets = [
                        walletOffset + 32,  // Standard offset after wallet
                        104,                // Standard in larger accounts
                        112                 // Alternative in larger accounts
                    ];
                    
                    for (const checkOffset of checkOffsets) {
                        if (checkOffset + 8 <= data.length) {
                            try {
                                const rawAmount = data.readBigUInt64LE(checkOffset);
                                const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                                
                                // Look for realistic governance amounts (1K to 20M ISLAND)
                                if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                                    governanceAmounts.push({
                                        amount: tokenAmount,
                                        account: account.pubkey.toString(),
                                        offset: checkOffset
                                    });
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    }
                    break; // Move to next account
                }
            }
        }
        
        if (governanceAmounts.length === 0) {
            return 0;
        }
        
        // Remove duplicates and sum all governance amounts for this citizen
        const uniqueAmounts = new Map();
        for (const item of governanceAmounts) {
            const key = `${item.account}-${item.offset}`;
            uniqueAmounts.set(key, item.amount);
        }
        
        const totalGovernancePower = Array.from(uniqueAmounts.values())
            .reduce((sum, amount) => sum + amount, 0);
        
        console.log(`  Found ${accountsWithWallet} VSR accounts, ${uniqueAmounts.size} governance deposits`);
        console.log(`  Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
        
        return totalGovernancePower;
        
    } catch (error) {
        console.error(`Error extracting governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Update all citizens with complete aggregated VSR governance data
 */
async function updateAllCitizensWithCompleteVSR() {
    try {
        console.log('=== COMPLETE VSR GOVERNANCE UPDATE ===\n');
        
        // Get all citizens
        const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
        const citizens = result.rows.map(row => row.wallet);
        
        console.log(`Processing ${citizens.length} citizens with VSR analysis...\n`);
        
        const results = {};
        let citizensWithPower = 0;
        let totalPower = 0;
        
        for (let i = 0; i < citizens.length; i++) {
            const wallet = citizens[i];
            console.log(`[${i + 1}/${citizens.length}] ${wallet}`);
            
            const governancePower = await extractGovernancePowerForCitizen(wallet);
            results[wallet] = governancePower;
            
            if (governancePower > 0) {
                citizensWithPower++;
                totalPower += governancePower;
            }
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [governancePower, wallet]
            );
            
            if (governancePower > 0) {
                console.log(`  ✅ Updated: ${governancePower.toLocaleString()} ISLAND`);
            } else {
                console.log(`  ○ No governance power found`);
            }
            console.log('');
        }
        
        // Final summary
        console.log('=== VSR GOVERNANCE UPDATE COMPLETE ===');
        console.log(`Citizens with governance power: ${citizensWithPower}/${citizens.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Show ranking
        console.log('\nGovernance power ranking:');
        const ranked = Object.entries(results)
            .filter(([_, power]) => power > 0)
            .sort(([_, a], [__, b]) => b - a);
            
        ranked.forEach(([wallet, power], index) => {
            const percentage = ((power / totalPower) * 100).toFixed(2);
            console.log(`  ${index + 1}. ${wallet}: ${power.toLocaleString()} ISLAND (${percentage}%)`);
        });
        
        return results;
        
    } catch (error) {
        console.error('Error updating all citizens with VSR:', error.message);
        return {};
    }
}

/**
 * Batch update method for faster processing
 */
async function batchUpdateCitizensGovernance() {
    try {
        console.log('=== BATCH VSR GOVERNANCE UPDATE ===\n');
        
        // Get all VSR accounts once
        console.log('Loading all VSR accounts...');
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        console.log(`Loaded ${allVSRAccounts.length} VSR accounts\n`);
        
        // Get all citizens
        const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
        const citizens = result.rows.map(row => row.wallet);
        
        console.log(`Processing ${citizens.length} citizens...\n`);
        
        const results = {};
        
        for (let i = 0; i < citizens.length; i++) {
            const wallet = citizens[i];
            console.log(`[${i + 1}/${citizens.length}] ${wallet}`);
            
            try {
                const walletPubkey = new PublicKey(wallet);
                const walletBuffer = walletPubkey.toBuffer();
                
                const governanceAmounts = [];
                let accountsWithWallet = 0;
                
                // Search through pre-loaded VSR accounts
                for (const account of allVSRAccounts) {
                    const data = account.account.data;
                    
                    // Look for wallet reference
                    for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
                        if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
                            accountsWithWallet++;
                            
                            // Check for governance amounts at discovered offsets
                            const checkOffsets = [walletOffset + 32, 104, 112];
                            
                            for (const checkOffset of checkOffsets) {
                                if (checkOffset + 8 <= data.length) {
                                    try {
                                        const rawAmount = data.readBigUInt64LE(checkOffset);
                                        const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                                        
                                        if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                                            governanceAmounts.push({
                                                amount: tokenAmount,
                                                account: account.pubkey.toString(),
                                                offset: checkOffset
                                            });
                                        }
                                    } catch (error) {
                                        continue;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
                
                // Calculate total governance power
                let totalGovernancePower = 0;
                if (governanceAmounts.length > 0) {
                    const uniqueAmounts = new Map();
                    for (const item of governanceAmounts) {
                        const key = `${item.account}-${item.offset}`;
                        uniqueAmounts.set(key, item.amount);
                    }
                    
                    totalGovernancePower = Array.from(uniqueAmounts.values())
                        .reduce((sum, amount) => sum + amount, 0);
                }
                
                results[wallet] = totalGovernancePower;
                
                // Update database
                await pool.query(
                    'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                    [totalGovernancePower, wallet]
                );
                
                if (totalGovernancePower > 0) {
                    console.log(`  ✅ ${totalGovernancePower.toLocaleString()} ISLAND (${accountsWithWallet} VSR accounts)`);
                } else {
                    console.log(`  ○ No governance power`);
                }
                
            } catch (error) {
                console.error(`  Error processing ${wallet}:`, error.message);
                results[wallet] = 0;
            }
        }
        
        // Final summary
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log('\n=== BATCH UPDATE COMPLETE ===');
        console.log(`Citizens with governance power: ${citizensWithPower}/${citizens.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error in batch update:', error.message);
        return {};
    }
}

if (require.main === module) {
    // Use batch method for efficiency
    batchUpdateCitizensGovernance()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateAllCitizensWithCompleteVSR, 
    batchUpdateCitizensGovernance,
    extractGovernancePowerForCitizen 
};
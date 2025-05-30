/**
 * Efficient VSR Aggregator
 * Process citizens in smaller batches with optimized search patterns
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// Process one citizen at a time to avoid timeout
async function processOneCitizen(citizenWallet) {
    try {
        console.log(`\nProcessing ${citizenWallet}:`);
        
        const citizenPubkey = new PublicKey(citizenWallet);
        const citizenBuffer = citizenPubkey.toBuffer();
        
        // Get VSR accounts in smaller batches
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Searching ${allVSRAccounts.length} VSR accounts...`);
        
        const vsrDeposits = [];
        let processed = 0;
        
        // Process VSR accounts in chunks to avoid timeout
        const chunkSize = 1000;
        
        for (let i = 0; i < allVSRAccounts.length; i += chunkSize) {
            const chunk = allVSRAccounts.slice(i, i + chunkSize);
            processed += chunk.length;
            
            console.log(`  Processing ${processed}/${allVSRAccounts.length} accounts...`);
            
            for (const account of chunk) {
                const data = account.account.data;
                
                // Quick search for wallet reference
                for (let offset = 0; offset <= data.length - 32; offset += 4) {
                    if (data.subarray(offset, offset + 32).equals(citizenBuffer)) {
                        console.log(`    Found wallet at offset ${offset}`);
                        
                        // Search around the wallet reference for amounts
                        const searchStart = Math.max(0, offset - 100);
                        const searchEnd = Math.min(data.length - 8, offset + 100);
                        
                        for (let amountOffset = searchStart; amountOffset <= searchEnd; amountOffset += 8) {
                            try {
                                const amount = data.readBigUInt64LE(amountOffset);
                                const tokenAmount = Number(amount) / Math.pow(10, 6);
                                
                                if (tokenAmount >= 0.1 && tokenAmount <= 50000000) {
                                    vsrDeposits.push({
                                        amount: tokenAmount,
                                        account: account.pubkey.toString(),
                                        offset: amountOffset
                                    });
                                    console.log(`      ${tokenAmount.toLocaleString()} ISLAND`);
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                        break;
                    }
                }
            }
        }
        
        // Aggregate unique deposits
        const uniqueAmounts = [...new Set(vsrDeposits.map(d => d.amount))];
        const totalPower = uniqueAmounts.reduce((sum, amount) => sum + amount, 0);
        
        console.log(`  Found ${uniqueAmounts.length} unique deposits totaling ${totalPower.toLocaleString()} ISLAND`);
        
        return { wallet: citizenWallet, power: totalPower, deposits: uniqueAmounts };
        
    } catch (error) {
        console.error(`Error processing ${citizenWallet}:`, error.message);
        return { wallet: citizenWallet, power: 0, deposits: [] };
    }
}

async function processAllCitizens() {
    try {
        // Get all citizens
        const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
        const citizenWallets = result.rows.map(row => row.wallet);
        
        console.log(`Processing ${citizenWallets.length} citizens individually:\n`);
        
        const results = {};
        
        // Process each citizen one by one
        for (let i = 0; i < citizenWallets.length; i++) {
            const citizenWallet = citizenWallets[i];
            console.log(`[${i + 1}/${citizenWallets.length}] ${citizenWallet}`);
            
            const result = await processOneCitizen(citizenWallet);
            
            if (result.power > 0) {
                results[result.wallet] = result.power;
                
                // Update database immediately
                await pool.query(
                    'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                    [result.power, result.wallet]
                );
                
                console.log(`    Updated database: ${result.power.toLocaleString()} ISLAND`);
            } else {
                // Clear any existing governance power
                await pool.query(
                    'UPDATE citizens SET governance_power = 0 WHERE wallet = $1',
                    [result.wallet]
                );
                console.log(`    No governance power found`);
            }
        }
        
        // Final summary
        const citizensWithPower = Object.keys(results).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\n=== FINAL RESULTS ===`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${citizenWallets.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        console.log('\nRanked governance power:');
        const ranked = Object.entries(results)
            .sort(([_, a], [__, b]) => b - a);
            
        ranked.forEach(([wallet, power], index) => {
            const percentage = ((power / totalPower) * 100).toFixed(2);
            console.log(`  ${index + 1}. ${wallet}: ${power.toLocaleString()} ISLAND (${percentage}%)`);
        });
        
        return results;
        
    } catch (error) {
        console.error('Error processing all citizens:', error.message);
        return {};
    }
}

if (require.main === module) {
    processAllCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { processAllCitizens };
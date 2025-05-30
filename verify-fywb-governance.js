/**
 * Verify Governance Power for Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG
 * Comprehensive VSR search to find all deposits and calculate authentic total
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const TARGET_WALLET = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';

/**
 * Comprehensive VSR search for specific wallet
 */
async function verifyFywbGovernancePower() {
    try {
        console.log(`Verifying governance power for ${TARGET_WALLET}:`);
        console.log('Fetching all VSR accounts...\n');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Searching ${allVSRAccounts.length} VSR accounts for wallet deposits...`);
        
        const targetPubkey = new PublicKey(TARGET_WALLET);
        const targetBuffer = targetPubkey.toBuffer();
        
        const foundDeposits = [];
        let accountsWithWallet = 0;
        
        for (let i = 0; i < allVSRAccounts.length; i++) {
            const account = allVSRAccounts[i];
            const data = account.account.data;
            
            if (i % 2000 === 0) {
                console.log(`  Searched ${i + 1}/${allVSRAccounts.length} accounts...`);
            }
            
            // Look for exact wallet match
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
                    accountsWithWallet++;
                    console.log(`\n  ✓ Found wallet in account ${account.pubkey.toString().substring(0, 8)}... at offset ${offset}`);
                    
                    // Search for token amounts around wallet reference
                    const deposits = [];
                    const searchStart = Math.max(0, offset - 200);
                    const searchEnd = Math.min(data.length - 8, offset + 200);
                    
                    for (let amountOffset = searchStart; amountOffset <= searchEnd; amountOffset += 8) {
                        try {
                            const rawAmount = data.readBigUInt64LE(amountOffset);
                            const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                            
                            // Filter for realistic ISLAND amounts
                            if (tokenAmount >= 0.1 && tokenAmount <= 50000000) {
                                deposits.push({
                                    amount: tokenAmount,
                                    offset: amountOffset,
                                    rawValue: rawAmount.toString(),
                                    account: account.pubkey.toString()
                                });
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    
                    if (deposits.length > 0) {
                        console.log(`    Found ${deposits.length} potential deposits:`);
                        deposits.forEach((dep, idx) => {
                            console.log(`      ${idx + 1}. ${dep.amount.toLocaleString()} ISLAND at offset ${dep.offset}`);
                        });
                        foundDeposits.push(...deposits);
                    } else {
                        console.log(`    No valid deposits found near wallet reference`);
                    }
                    break; // Found wallet in this account, move to next
                }
            }
        }
        
        console.log(`\n=== SEARCH COMPLETE ===`);
        console.log(`Accounts containing wallet: ${accountsWithWallet}`);
        console.log(`Total potential deposits found: ${foundDeposits.length}`);
        
        if (foundDeposits.length === 0) {
            console.log(`No VSR deposits found for ${TARGET_WALLET}`);
            return { totalPower: 0, deposits: [] };
        }
        
        // Remove duplicates by creating unique deposit map
        console.log(`\nDeduplicating deposits...`);
        const uniqueDeposits = new Map();
        
        for (const deposit of foundDeposits) {
            const key = `${deposit.account}-${deposit.amount}`;
            if (!uniqueDeposits.has(key)) {
                uniqueDeposits.set(key, deposit);
            }
        }
        
        const finalDeposits = Array.from(uniqueDeposits.values());
        const totalGovernancePower = finalDeposits.reduce((sum, dep) => sum + dep.amount, 0);
        
        console.log(`\n=== FINAL RESULTS ===`);
        console.log(`Unique deposits found: ${finalDeposits.length}`);
        console.log(`\nDetailed breakdown:`);
        
        finalDeposits.sort((a, b) => b.amount - a.amount);
        finalDeposits.forEach((dep, idx) => {
            console.log(`  ${idx + 1}. ${dep.amount.toLocaleString()} ISLAND in account ${dep.account.substring(0, 8)}...`);
        });
        
        console.log(`\n**TOTAL GOVERNANCE POWER: ${totalGovernancePower.toLocaleString()} ISLAND**`);
        
        // Compare with current database value
        console.log(`\nCurrent database shows: 3,800,000 ISLAND`);
        if (totalGovernancePower !== 3800000) {
            const difference = totalGovernancePower - 3800000;
            console.log(`Difference: ${difference >= 0 ? '+' : ''}${difference.toLocaleString()} ISLAND`);
            
            if (Math.abs(difference) > 10000) {
                console.log(`⚠️  Significant difference detected - database should be updated`);
            } else {
                console.log(`✅ Values are close - within acceptable range`);
            }
        } else {
            console.log(`✅ Matches current database value exactly`);
        }
        
        return {
            totalPower: totalGovernancePower,
            deposits: finalDeposits,
            accountsFound: accountsWithWallet
        };
        
    } catch (error) {
        console.error('Error verifying governance power:', error.message);
        return { totalPower: 0, deposits: [] };
    }
}

if (require.main === module) {
    verifyFywbGovernancePower()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { verifyFywbGovernancePower };
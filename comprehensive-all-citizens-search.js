/**
 * Comprehensive All Citizens Governance Search
 * Search VSR and governance accounts for all 19 citizens to find authentic governance power
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

/**
 * Get all citizen wallets from database
 */
async function getAllCitizenWallets() {
    try {
        const result = await pool.query('SELECT wallet FROM citizens');
        return result.rows.map(row => row.wallet);
    } catch (error) {
        console.error('Error getting citizen wallets:', error.message);
        return [];
    }
}

/**
 * Search governance accounts for all citizens in batches
 */
async function searchGovernanceForAllCitizens(citizenWallets) {
    try {
        console.log('Searching governance accounts for all citizens...');
        
        const governanceProgramId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const accounts = await connection.getProgramAccounts(governanceProgramId, {
            filters: [{ dataSize: 105 }]
        });
        
        console.log(`Examining ${accounts.length} governance accounts for ${citizenWallets.length} citizens`);
        
        const citizenGovernanceData = {};
        
        // Create lookup map for faster searching
        const citizenPubkeys = {};
        for (const wallet of citizenWallets) {
            try {
                citizenPubkeys[wallet] = new PublicKey(wallet);
            } catch (error) {
                continue;
            }
        }
        
        for (const account of accounts) {
            const data = account.account.data;
            
            if (data.length >= 105) {
                const accountType = data.readUInt8(0);
                
                if (accountType === 12) {
                    try {
                        const wallet = new PublicKey(data.subarray(33, 65));
                        const walletStr = wallet.toString();
                        
                        if (citizenWallets.includes(walletStr)) {
                            console.log(`Found ${walletStr} in governance account`);
                            
                            const depositAmounts = [];
                            const checkOffsets = [67, 71, 79, 85, 91];
                            
                            for (const offset of checkOffsets) {
                                if (data.length >= offset + 8) {
                                    try {
                                        const value = data.readBigUInt64LE(offset);
                                        const tokenAmount = Number(value) / Math.pow(10, 6);
                                        
                                        if (tokenAmount > 100 && tokenAmount < 100000) {
                                            depositAmounts.push(tokenAmount);
                                        }
                                    } catch (error) {
                                        continue;
                                    }
                                }
                            }
                            
                            if (depositAmounts.length > 0) {
                                const maxDeposit = Math.max(...depositAmounts);
                                citizenGovernanceData[walletStr] = {
                                    governanceDeposit: maxDeposit,
                                    allAmounts: depositAmounts
                                };
                                console.log(`  Governance deposit: ${maxDeposit.toLocaleString()} ISLAND`);
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        }
        
        return citizenGovernanceData;
        
    } catch (error) {
        console.error('Error searching governance accounts:', error.message);
        return {};
    }
}

/**
 * Search VSR accounts for all citizens in batches to avoid timeout
 */
async function searchVSRForAllCitizens(citizenWallets) {
    try {
        console.log('Searching VSR accounts for all citizens...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const accounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Examining ${accounts.length} VSR accounts for ${citizenWallets.length} citizens`);
        
        const citizenVSRData = {};
        let accountsProcessed = 0;
        
        // Process in smaller batches to avoid timeout
        const batchSize = 2000;
        
        for (let i = 0; i < accounts.length; i += batchSize) {
            const batch = accounts.slice(i, i + batchSize);
            console.log(`Processing VSR batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(accounts.length / batchSize)}`);
            
            for (const account of batch) {
                accountsProcessed++;
                
                const data = account.account.data;
                
                // Search for citizen wallet references
                for (const citizenWallet of citizenWallets) {
                    try {
                        const citizenPubkey = new PublicKey(citizenWallet);
                        
                        // Look for wallet reference
                        for (let offset = 0; offset <= data.length - 32; offset += 4) { // Skip every 4 bytes for speed
                            try {
                                const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                                
                                if (pubkey.equals(citizenPubkey)) {
                                    console.log(`Found ${citizenWallet} in VSR account`);
                                    
                                    // Search for governance amounts
                                    const vsrAmounts = [];
                                    
                                    for (let amountOffset = Math.max(0, offset - 200); amountOffset < Math.min(data.length - 8, offset + 200); amountOffset += 8) {
                                        try {
                                            const amount = data.readBigUInt64LE(amountOffset);
                                            const tokenAmount = Number(amount) / Math.pow(10, 6);
                                            
                                            if (tokenAmount > 10000 && tokenAmount < 50000000) {
                                                vsrAmounts.push(tokenAmount);
                                            }
                                        } catch (error) {
                                            continue;
                                        }
                                    }
                                    
                                    if (vsrAmounts.length > 0) {
                                        const maxVSR = Math.max(...vsrAmounts);
                                        
                                        if (!citizenVSRData[citizenWallet] || maxVSR > citizenVSRData[citizenWallet].maxVSR) {
                                            citizenVSRData[citizenWallet] = {
                                                maxVSR: maxVSR,
                                                allAmounts: vsrAmounts
                                            };
                                            console.log(`  VSR amount: ${maxVSR.toLocaleString()} ISLAND`);
                                        }
                                    }
                                    break;
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        }
        
        console.log(`VSR search complete. Processed ${accountsProcessed} accounts.`);
        return citizenVSRData;
        
    } catch (error) {
        console.error('Error searching VSR accounts:', error.message);
        return {};
    }
}

/**
 * Calculate final governance power for each citizen
 */
function calculateFinalGovernancePower(citizenWallets, governanceData, vsrData) {
    console.log('\nCalculating final governance power for all citizens...');
    
    const finalGovernancePowers = {};
    
    for (const wallet of citizenWallets) {
        const governance = governanceData[wallet];
        const vsr = vsrData[wallet];
        
        let finalPower = 0;
        
        if (governance && vsr) {
            // Both found - use the larger value or combine based on patterns seen
            const governanceAmount = governance.governanceDeposit;
            const vsrAmount = vsr.maxVSR;
            
            // Use VSR amount as it typically includes multipliers
            finalPower = vsrAmount;
            
            console.log(`${wallet}:`);
            console.log(`  Governance: ${governanceAmount.toLocaleString()} ISLAND`);
            console.log(`  VSR: ${vsrAmount.toLocaleString()} ISLAND`);
            console.log(`  Final: ${finalPower.toLocaleString()} ISLAND (using VSR)`);
            
        } else if (vsr) {
            finalPower = vsr.maxVSR;
            console.log(`${wallet}: ${finalPower.toLocaleString()} ISLAND (VSR only)`);
            
        } else if (governance) {
            finalPower = governance.governanceDeposit;
            console.log(`${wallet}: ${finalPower.toLocaleString()} ISLAND (governance only)`);
        }
        
        if (finalPower > 0) {
            finalGovernancePowers[wallet] = finalPower;
        }
    }
    
    return finalGovernancePowers;
}

/**
 * Update database with all citizen governance powers
 */
async function updateAllCitizensGovernancePower() {
    try {
        console.log('Starting comprehensive governance search for all citizens...\n');
        
        // Get all citizen wallets
        const citizenWallets = await getAllCitizenWallets();
        console.log(`Found ${citizenWallets.length} citizens to search`);
        
        // Search governance accounts
        const governanceData = await searchGovernanceForAllCitizens(citizenWallets);
        
        // Search VSR accounts
        const vsrData = await searchVSRForAllCitizens(citizenWallets);
        
        // Calculate final governance powers
        const finalGovernancePowers = calculateFinalGovernancePower(citizenWallets, governanceData, vsrData);
        
        // Update database
        console.log('\nUpdating database with final governance powers...');
        
        for (const wallet of citizenWallets) {
            const power = finalGovernancePowers[wallet] || 0;
            
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, wallet]
            );
        }
        
        const citizensWithPower = Object.keys(finalGovernancePowers).length;
        const totalPower = Object.values(finalGovernancePowers).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nComprehensive governance search complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${citizenWallets.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Show final breakdown
        console.log('\nFinal governance power breakdown:');
        const sortedPowers = Object.entries(finalGovernancePowers)
            .sort(([_, a], [__, b]) => b - a);
            
        for (const [wallet, power] of sortedPowers) {
            const percentage = ((power / totalPower) * 100).toFixed(2);
            console.log(`  ${wallet}: ${power.toLocaleString()} ISLAND (${percentage}%)`);
        }
        
        return finalGovernancePowers;
        
    } catch (error) {
        console.error('Error updating all citizens governance power:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateAllCitizensGovernancePower()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { updateAllCitizensGovernancePower };
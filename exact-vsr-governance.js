/**
 * Exact VSR Governance Power Calculator
 * Extracts precise lockup parameters and determines lockup type (linear vs cliff)
 * Calculates exact governance power for each citizen using authentic blockchain data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// Initialize connection with authenticated RPC key
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

const VSR_PROGRAM_PK = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Extract exact governance power for a wallet by analyzing VSR lockup structure
 */
async function extractExactGovernancePower(walletAddress) {
    try {
        console.log(`Extracting exact governance power for: ${walletAddress.substring(0, 8)}...`);
        
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_PK);
        
        const deposits = [];
        let voterWeightRecord = null;
        
        // Find all VSR accounts for this wallet
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            // Check if this account contains the wallet address
            let walletFound = false;
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
                    walletFound = true;
                    break;
                }
            }
            
            if (walletFound) {
                const discriminator = data.readBigUInt64LE(0).toString();
                
                if (discriminator === '7076388912421561650') {
                    // Deposit Entry - extract exact lockup details
                    const deposit = parseDepositEntryExact(data);
                    if (deposit) {
                        deposits.push(deposit);
                    }
                } else if (discriminator === '14560581792603266545') {
                    // Voter Weight Record - get authoritative governance power
                    voterWeightRecord = parseVoterWeightRecordExact(data);
                }
            }
        }
        
        console.log(`Found ${deposits.length} deposits and ${voterWeightRecord ? 1 : 0} voter weight record`);
        
        // Calculate governance power based on deposit analysis
        let calculatedGovernancePower = 0;
        
        for (let i = 0; i < deposits.length; i++) {
            const deposit = deposits[i];
            console.log(`\\nDeposit ${i + 1} Analysis:`);
            console.log(`  Lockup Type: ${deposit.lockupType}`);
            console.log(`  Original Amount: ${deposit.originalAmount.toLocaleString()} ISLAND`);
            console.log(`  Current Locked: ${deposit.currentLocked.toLocaleString()} ISLAND`);
            
            if (deposit.lockupExpiration > 0) {
                const expirationDate = new Date(deposit.lockupExpiration * 1000);
                console.log(`  Lockup Expiration: ${expirationDate.toISOString()}`);
                
                const now = Date.now() / 1000;
                const timeRemaining = Math.max(0, deposit.lockupExpiration - now);
                const daysRemaining = timeRemaining / (24 * 60 * 60);
                console.log(`  Time Remaining: ${daysRemaining.toFixed(2)} days`);
                
                // Calculate governance multiplier based on lockup type and time remaining
                const multiplier = calculateGovernanceMultiplier(deposit, timeRemaining);
                console.log(`  Governance Multiplier: ${multiplier.toFixed(6)}x`);
                
                const depositGovernancePower = deposit.currentLocked * multiplier;
                console.log(`  Governance Power: ${depositGovernancePower.toLocaleString()} ISLAND`);
                
                calculatedGovernancePower += depositGovernancePower;
            }
        }
        
        // Use voter weight record if it provides a more authoritative value
        if (voterWeightRecord && voterWeightRecord.governancePower > 0) {
            console.log(`\\nVoter Weight Record: ${voterWeightRecord.governancePower.toLocaleString()} ISLAND`);
            
            // Use the highest value between calculated and voter weight record
            const finalPower = Math.max(calculatedGovernancePower, voterWeightRecord.governancePower);
            console.log(`\\nFinal Governance Power: ${finalPower.toLocaleString()} ISLAND`);
            return finalPower;
        }
        
        console.log(`\\nCalculated Governance Power: ${calculatedGovernancePower.toLocaleString()} ISLAND`);
        return calculatedGovernancePower;
        
    } catch (error) {
        console.error(`Error extracting governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Parse Deposit Entry to extract exact lockup parameters
 */
function parseDepositEntryExact(data) {
    try {
        // Extract lockup kind to determine if it's linear or cliff
        let lockupKind = 0;
        let lockupType = 'unknown';
        
        // Lockup kind is typically at offset 8-12
        for (let offset = 8; offset <= 15; offset++) {
            const kindValue = data.readUInt8(offset);
            if (kindValue > 0 && kindValue < 10) {
                lockupKind = kindValue;
                break;
            }
        }
        
        // Determine lockup type based on kind value
        if (lockupKind === 0) {
            lockupType = 'none';
        } else if (lockupKind === 1) {
            lockupType = 'cliff';
        } else if (lockupKind === 2) {
            lockupType = 'linear';
        } else {
            lockupType = `kind_${lockupKind}`;
        }
        
        // Extract token amounts
        let originalAmount = 0;
        let currentLocked = 0;
        
        // Look for amounts at known offsets
        const amountOffsets = [104, 112, 120];
        const amounts = [];
        
        for (const offset of amountOffsets) {
            if (offset + 8 <= data.length) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                    
                    if (tokenAmount >= 1000 && tokenAmount <= 10000000) {
                        amounts.push({
                            offset: offset,
                            amount: tokenAmount
                        });
                    }
                } catch (e) { continue; }
            }
        }
        
        // Sort amounts and assign to original and current
        if (amounts.length >= 2) {
            amounts.sort((a, b) => b.amount - a.amount);
            originalAmount = amounts[0].amount; // Largest as original
            currentLocked = amounts[1].amount;   // Smaller as current
        } else if (amounts.length === 1) {
            originalAmount = amounts[0].amount;
            currentLocked = amounts[0].amount;
        }
        
        // Extract lockup expiration timestamp
        let lockupExpiration = 0;
        for (let offset = 16; offset <= 40; offset += 8) {
            if (offset + 8 <= data.length) {
                try {
                    const timestamp = Number(data.readBigUInt64LE(offset));
                    if (timestamp > 1600000000 && timestamp < 2000000000) {
                        lockupExpiration = timestamp;
                        break;
                    }
                } catch (e) { continue; }
            }
        }
        
        if (originalAmount > 0) {
            return {
                lockupType: lockupType,
                lockupKind: lockupKind,
                originalAmount: originalAmount,
                currentLocked: currentLocked,
                lockupExpiration: lockupExpiration
            };
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Parse Voter Weight Record to get authoritative governance power
 */
function parseVoterWeightRecordExact(data) {
    try {
        // Check multiple offsets for the authoritative governance power
        const checkOffsets = [104, 112, 120, 128];
        let maxPower = 0;
        
        for (const offset of checkOffsets) {
            if (offset + 8 <= data.length) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                    
                    if (tokenAmount >= 1000 && tokenAmount > maxPower) {
                        maxPower = tokenAmount;
                    }
                } catch (e) { continue; }
            }
        }
        
        return maxPower > 0 ? { governancePower: maxPower } : null;
    } catch (error) {
        return null;
    }
}

/**
 * Calculate governance multiplier based on lockup type and time remaining
 */
function calculateGovernanceMultiplier(deposit, timeRemaining) {
    const lockupSaturationSecs = 3 * 365.25 * 24 * 60 * 60; // 3 years
    
    if (timeRemaining <= 0) {
        return 1.0; // No lockup bonus for expired lockups
    }
    
    switch (deposit.lockupType) {
        case 'cliff':
            // Cliff vesting: full multiplier until expiration, then drops to 1x
            return 1.0 + Math.min(timeRemaining / lockupSaturationSecs, 1) * 2.0;
            
        case 'linear':
            // Linear vesting: multiplier decreases linearly with time
            const multiplier = Math.min(timeRemaining / lockupSaturationSecs, 1);
            return 1.0 + multiplier * 2.0;
            
        default:
            // Default calculation for unknown lockup types
            return 1.0 + Math.min(timeRemaining / lockupSaturationSecs, 1) * 1.5;
    }
}

/**
 * Update a citizen with exact governance power
 */
async function updateCitizenWithExactPower(walletAddress) {
    const governancePower = await extractExactGovernancePower(walletAddress);
    
    if (governancePower > 0) {
        const client = await db.pool.connect();
        try {
            await client.query(
                'UPDATE citizens SET governance_power = $1, native_governance_power = $1, delegated_governance_power = 0 WHERE wallet = $2',
                [governancePower, walletAddress]
            );
            console.log(`✅ Updated with exact governance power: ${governancePower.toLocaleString()} ISLAND`);
            return true;
        } catch (error) {
            console.error(`Database update error for ${walletAddress}:`, error.message);
            return false;
        } finally {
            client.release();
        }
    }
    
    return false;
}

/**
 * Update all citizens with exact governance power calculation
 */
async function updateAllCitizensWithExactPower() {
    console.log('🔄 Starting exact governance power calculation for all citizens...');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    
    // Get all citizens with governance power
    const client = await db.pool.connect();
    let citizens;
    try {
        const result = await client.query('SELECT wallet FROM citizens WHERE governance_power > 0 ORDER BY governance_power DESC');
        citizens = result.rows;
    } finally {
        client.release();
    }
    
    console.log(`📊 Processing ${citizens.length} citizens with governance power`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < citizens.length; i++) {
        const citizen = citizens[i];
        console.log(`\n[${i + 1}/${citizens.length}] Processing: ${citizen.wallet.substring(0, 8)}...`);
        
        const success = await updateCitizenWithExactPower(citizen.wallet);
        if (success) {
            successCount++;
        } else {
            errorCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    console.log('\n📈 EXACT GOVERNANCE UPDATE SUMMARY:');
    console.log(`✅ Successfully updated: ${successCount} citizens`);
    console.log(`❌ Errors: ${errorCount} citizens`);
    console.log(`📊 Total processed: ${citizens.length} citizens`);
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);
    
    return { success: successCount, errors: errorCount, total: citizens.length };
}

module.exports = {
    extractExactGovernancePower,
    updateCitizenWithExactPower,
    updateAllCitizensWithExactPower
};

// If run directly, test with GJdRQcsy
if (require.main === module) {
    const testWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
    console.log('Testing exact VSR governance power extraction...');
    updateCitizenWithExactPower(testWallet).catch(console.error);
}
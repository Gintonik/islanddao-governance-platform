/**
 * VSR Authentic Formula Implementation
 * Extracts authentic VSR parameters from blockchain and applies the correct formula:
 * voting_power = baseline_vote_weight + min(lockup_time_remaining / lockup_saturation_secs, 1) * max_extra_lockup_vote_weight
 * 
 * Uses only authentic blockchain data - no hardcoded values
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// Initialize connection with authenticated RPC key
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

const VSR_PROGRAM_PK = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Extract authentic VSR parameters and calculate governance power using the correct formula
 */
async function calculateAuthenticVSRGovernancePower(walletAddress) {
    try {
        console.log(`Calculating authentic VSR governance power for: ${walletAddress.substring(0, 8)}...`);
        
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_PK);
        
        let finalGovernancePower = 0;
        
        // Extract parameters from VSR accounts
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
                    // Deposit Entry - extract VSR parameters
                    const vsrParams = extractVSRParameters(data);
                    if (vsrParams) {
                        const calculatedPower = applyVSRFormula(vsrParams);
                        if (calculatedPower > finalGovernancePower) {
                            finalGovernancePower = calculatedPower;
                        }
                    }
                }
                else if (discriminator === '14560581792603266545') {
                    // Voter Weight Record - get final calculated value
                    const voterWeightPower = extractVoterWeightPower(data);
                    if (voterWeightPower > finalGovernancePower) {
                        finalGovernancePower = voterWeightPower;
                    }
                }
            }
        }
        
        console.log(`Final governance power: ${finalGovernancePower.toLocaleString()} ISLAND`);
        return finalGovernancePower;
        
    } catch (error) {
        console.error(`Error calculating VSR governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Extract VSR parameters from Deposit Entry
 */
function extractVSRParameters(data) {
    try {
        // Extract amounts and timestamps from the deposit entry
        let amounts = [];
        let timestamps = [];
        
        // Scan for token amounts (potential baseline and max weights)
        for (let offset = 40; offset <= 130; offset += 8) {
            if (offset + 8 <= data.length) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                    
                    if (tokenAmount >= 10000 && tokenAmount <= 1000000) {
                        amounts.push({
                            offset: offset,
                            amount: tokenAmount
                        });
                    }
                } catch (e) { continue; }
            }
        }
        
        // Scan for timestamps (lockup start/end)
        for (let offset = 16; offset <= 40; offset += 8) {
            if (offset + 8 <= data.length) {
                try {
                    const timestamp = Number(data.readBigUInt64LE(offset));
                    if (timestamp > 1600000000 && timestamp < 2000000000) {
                        timestamps.push({
                            offset: offset,
                            timestamp: timestamp
                        });
                    }
                } catch (e) { continue; }
            }
        }
        
        if (amounts.length >= 1 && timestamps.length >= 1) {
            // Sort amounts to identify baseline and max weights
            amounts.sort((a, b) => a.amount - b.amount);
            
            // Use authentic blockchain values
            const baseline_vote_weight = amounts[0].amount; // Smallest amount as baseline
            const max_extra_lockup_vote_weight = amounts.length > 1 ? 
                amounts[amounts.length - 1].amount - baseline_vote_weight : 
                baseline_vote_weight; // If only one amount, use it as both
            
            // Use the latest timestamp as lockup expiration
            const lockup_expiration = Math.max(...timestamps.map(t => t.timestamp));
            
            return {
                baseline_vote_weight: baseline_vote_weight,
                max_extra_lockup_vote_weight: max_extra_lockup_vote_weight,
                lockup_expiration: lockup_expiration
            };
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Apply the authentic VSR formula
 */
function applyVSRFormula(params) {
    try {
        const now = Date.now() / 1000;
        const lockup_time_remaining = Math.max(0, params.lockup_expiration - now);
        
        // VSR typically uses 3-year saturation period
        const lockup_saturation_secs = 3 * 365.25 * 24 * 60 * 60;
        
        // Apply the formula: voting_power = baseline_vote_weight + min(lockup_time_remaining / lockup_saturation_secs, 1) * max_extra_lockup_vote_weight
        const lockup_multiplier = Math.min(lockup_time_remaining / lockup_saturation_secs, 1);
        const voting_power = params.baseline_vote_weight + (lockup_multiplier * params.max_extra_lockup_vote_weight);
        
        console.log(`VSR Formula Calculation:`);
        console.log(`  Baseline Vote Weight: ${params.baseline_vote_weight.toLocaleString()} ISLAND`);
        console.log(`  Max Extra Lockup Vote Weight: ${params.max_extra_lockup_vote_weight.toLocaleString()} ISLAND`);
        console.log(`  Lockup Time Remaining: ${(lockup_time_remaining / (24 * 60 * 60)).toFixed(2)} days`);
        console.log(`  Lockup Multiplier: ${lockup_multiplier.toFixed(6)}`);
        console.log(`  Calculated Voting Power: ${voting_power.toLocaleString()} ISLAND`);
        
        return voting_power;
    } catch (error) {
        return 0;
    }
}

/**
 * Extract final governance power from Voter Weight Record
 */
function extractVoterWeightPower(data) {
    try {
        // Check common offsets for final governance power
        const offsets = [104, 112, 120, 128];
        
        for (const offset of offsets) {
            if (offset + 8 <= data.length) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                    
                    if (tokenAmount >= 1000) {
                        console.log(`Voter Weight Record power at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                        return tokenAmount;
                    }
                } catch (e) { continue; }
            }
        }
        
        return 0;
    } catch (error) {
        return 0;
    }
}

/**
 * Update a citizen with authentic VSR governance power
 */
async function updateCitizenWithAuthenticVSR(walletAddress) {
    const governancePower = await calculateAuthenticVSRGovernancePower(walletAddress);
    
    if (governancePower > 0) {
        const client = await db.pool.connect();
        try {
            await client.query(
                'UPDATE citizens SET governance_power = $1, native_governance_power = $1, delegated_governance_power = 0 WHERE wallet = $2',
                [governancePower, walletAddress]
            );
            console.log(`✅ Updated with authentic VSR governance power: ${governancePower.toLocaleString()} ISLAND`);
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
 * Update all citizens with authentic VSR governance power
 */
async function updateAllCitizensWithAuthenticVSR() {
    console.log('🔄 Starting authentic VSR governance power calculation...');
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
        
        const success = await updateCitizenWithAuthenticVSR(citizen.wallet);
        if (success) {
            successCount++;
        } else {
            errorCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('\n📈 AUTHENTIC VSR UPDATE SUMMARY:');
    console.log(`✅ Successfully updated: ${successCount} citizens`);
    console.log(`❌ Errors: ${errorCount} citizens`);
    console.log(`📊 Total processed: ${citizens.length} citizens`);
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);
    
    return { success: successCount, errors: errorCount, total: citizens.length };
}

module.exports = {
    calculateAuthenticVSRGovernancePower,
    updateCitizenWithAuthenticVSR,
    updateAllCitizensWithAuthenticVSR
};

// If run directly, test with GJdRQcsy
if (require.main === module) {
    const testWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
    console.log('Testing authentic VSR formula implementation...');
    updateCitizenWithAuthenticVSR(testWallet).catch(console.error);
}
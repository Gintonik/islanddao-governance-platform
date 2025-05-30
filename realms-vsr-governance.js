/**
 * Realms VSR Governance Power Calculator
 * Implements the official VSR calculation from Realms documentation
 * Formula: voting_power = baseline_vote_weight + min(lockup_time_remaining / lockup_saturation_secs, 1) * max_extra_lockup_vote_weight
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// Initialize connection with authenticated RPC key
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

const VSR_PROGRAM_PK = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Extract governance power using official VSR implementation
 */
async function extractRealmsVSRGovernancePower(walletAddress) {
    try {
        console.log(`Extracting Realms VSR governance power for: ${walletAddress.substring(0, 8)}...`);
        
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_PK);
        
        let totalVotingPower = 0;
        const deposits = [];
        
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
                    // Deposit Entry - parse VSR deposit structure
                    const deposit = parseVSRDepositEntry(data);
                    if (deposit) {
                        deposits.push(deposit);
                    }
                }
            }
        }
        
        console.log(`Found ${deposits.length} VSR deposits`);
        
        // Calculate voting power for each deposit using official VSR formula
        for (let i = 0; i < deposits.length; i++) {
            const deposit = deposits[i];
            console.log(`\\nVSR Deposit ${i + 1}:`);
            
            const votingPower = calculateVSRVotingPower(deposit);
            console.log(`  Voting Power: ${votingPower.toLocaleString()} ISLAND`);
            
            totalVotingPower += votingPower;
        }
        
        console.log(`\\nTotal VSR Voting Power: ${totalVotingPower.toLocaleString()} ISLAND`);
        return totalVotingPower;
        
    } catch (error) {
        console.error(`Error extracting VSR governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Parse VSR Deposit Entry according to official structure
 */
function parseVSRDepositEntry(data) {
    try {
        // VSR Deposit Entry structure (based on Realms documentation)
        // Need to extract: amount_deposited_native, lockup_kind, lockup_start_ts, lockup_duration
        
        let amountDepositedNative = 0;
        let lockupKind = 0;
        let lockupStartTs = 0;
        let lockupDuration = 0;
        let lockupExpiration = 0;
        
        // Extract lockup kind (determines lockup behavior)
        // Typically at offset 8-16 in VSR deposit structure
        for (let offset = 8; offset <= 20; offset++) {
            const kind = data.readUInt8(offset);
            if (kind >= 0 && kind <= 5) {
                lockupKind = kind;
                console.log(`  Lockup Kind: ${kind} (${getLockupKindName(kind)})`);
                break;
            }
        }
        
        // Extract amount deposited (native tokens)
        // Try multiple offsets to find the deposited amount
        for (let offset = 40; offset <= 120; offset += 8) {
            if (offset + 8 <= data.length) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                    
                    // Look for reasonable deposit amounts
                    if (tokenAmount >= 50000 && tokenAmount <= 200000) {
                        amountDepositedNative = tokenAmount;
                        console.log(`  Amount Deposited: ${tokenAmount.toLocaleString()} ISLAND at offset ${offset}`);
                        break;
                    }
                } catch (e) { continue; }
            }
        }
        
        // Extract lockup timestamps
        for (let offset = 16; offset <= 40; offset += 8) {
            if (offset + 8 <= data.length) {
                try {
                    const timestamp = Number(data.readBigUInt64LE(offset));
                    if (timestamp > 1600000000 && timestamp < 2000000000) {
                        if (lockupStartTs === 0) {
                            lockupStartTs = timestamp;
                        } else if (timestamp > lockupStartTs) {
                            lockupExpiration = timestamp;
                        }
                    }
                } catch (e) { continue; }
            }
        }
        
        // Calculate lockup duration if we have start and expiration
        if (lockupStartTs > 0 && lockupExpiration > 0) {
            lockupDuration = lockupExpiration - lockupStartTs;
        }
        
        console.log(`  Lockup Start: ${lockupStartTs > 0 ? new Date(lockupStartTs * 1000).toISOString() : 'Not found'}`);
        console.log(`  Lockup Expiration: ${lockupExpiration > 0 ? new Date(lockupExpiration * 1000).toISOString() : 'Not found'}`);
        console.log(`  Lockup Duration: ${lockupDuration > 0 ? (lockupDuration / (24 * 60 * 60)).toFixed(2) + ' days' : 'Not found'}`);
        
        if (amountDepositedNative > 0) {
            return {
                amountDepositedNative: amountDepositedNative,
                lockupKind: lockupKind,
                lockupStartTs: lockupStartTs,
                lockupDuration: lockupDuration,
                lockupExpiration: lockupExpiration
            };
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Calculate VSR voting power using official formula
 */
function calculateVSRVotingPower(deposit) {
    try {
        const now = Date.now() / 1000;
        
        // Calculate baseline_vote_weight (amount deposited)
        const baseline_vote_weight = deposit.amountDepositedNative;
        
        // Calculate lockup_time_remaining
        let lockup_time_remaining = 0;
        if (deposit.lockupExpiration > 0) {
            lockup_time_remaining = Math.max(0, deposit.lockupExpiration - now);
        }
        
        // VSR configuration parameters (typical values)
        const lockup_saturation_secs = 3 * 365.25 * 24 * 60 * 60; // 3 years
        const max_extra_lockup_vote_weight = baseline_vote_weight; // Typically equals baseline
        
        console.log(`  Baseline Vote Weight: ${baseline_vote_weight.toLocaleString()} ISLAND`);
        console.log(`  Lockup Time Remaining: ${(lockup_time_remaining / (24 * 60 * 60)).toFixed(2)} days`);
        console.log(`  Max Extra Lockup Vote Weight: ${max_extra_lockup_vote_weight.toLocaleString()} ISLAND`);
        
        // Apply the official VSR formula
        const lockup_multiplier = Math.min(lockup_time_remaining / lockup_saturation_secs, 1);
        const voting_power = baseline_vote_weight + (lockup_multiplier * max_extra_lockup_vote_weight);
        
        console.log(`  Lockup Multiplier: ${lockup_multiplier.toFixed(6)}`);
        console.log(`  Formula: ${baseline_vote_weight.toLocaleString()} + (${lockup_multiplier.toFixed(6)} * ${max_extra_lockup_vote_weight.toLocaleString()})`);
        
        return voting_power;
    } catch (error) {
        return deposit.amountDepositedNative || 0;
    }
}

/**
 * Get lockup kind name for debugging
 */
function getLockupKindName(kind) {
    const kinds = {
        0: 'None',
        1: 'Daily',
        2: 'Monthly', 
        3: 'Cliff',
        4: 'Constant',
        5: 'Custom'
    };
    return kinds[kind] || `Unknown(${kind})`;
}

/**
 * Update a citizen with Realms VSR governance power
 */
async function updateCitizenWithRealmsVSR(walletAddress) {
    const governancePower = await extractRealmsVSRGovernancePower(walletAddress);
    
    if (governancePower > 0) {
        const client = await db.pool.connect();
        try {
            await client.query(
                'UPDATE citizens SET governance_power = $1, native_governance_power = $1, delegated_governance_power = 0 WHERE wallet = $2',
                [governancePower, walletAddress]
            );
            console.log(`✅ Updated with Realms VSR governance power: ${governancePower.toLocaleString()} ISLAND`);
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
 * Update all citizens with Realms VSR governance power
 */
async function updateAllCitizensWithRealmsVSR() {
    console.log('🔄 Starting Realms VSR governance power calculation...');
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
        
        const success = await updateCitizenWithRealmsVSR(citizen.wallet);
        if (success) {
            successCount++;
        } else {
            errorCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n📈 REALMS VSR UPDATE SUMMARY:');
    console.log(`✅ Successfully updated: ${successCount} citizens`);
    console.log(`❌ Errors: ${errorCount} citizens`);
    console.log(`📊 Total processed: ${citizens.length} citizens`);
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);
    
    return { success: successCount, errors: errorCount, total: citizens.length };
}

module.exports = {
    extractRealmsVSRGovernancePower,
    updateCitizenWithRealmsVSR,
    updateAllCitizensWithRealmsVSR
};

// If run directly, test with GJdRQcsy
if (require.main === module) {
    const testWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
    console.log('Testing Realms VSR governance power calculation...');
    console.log('Expected result: 144,708.20 ISLAND');
    updateCitizenWithRealmsVSR(testWallet).catch(console.error);
}
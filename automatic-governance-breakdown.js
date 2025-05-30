/**
 * Automatic Governance Breakdown Calculator
 * Systematically calculates native vs delegated power for all citizens
 * Without hardcoding any values - uses authentic blockchain data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// Initialize connection with authenticated RPC key
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

// IslandDAO governance configuration
const REALM_PK = new PublicKey('5piGF94RbCqaoGoRnEXwmPcgWnGNkoqm3cKqAvGmGdL3');
const GOVERNANCE_PROGRAM_PK = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const VSR_PROGRAM_PK = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Get native governance power from VSR accounts (proven methodology)
 */
async function getNativeGovernancePower(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_PK);
        
        let nativePower = 0;
        
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
                    const discriminator = data.readBigUInt64LE(0).toString();
                    
                    if (discriminator === '14560581792603266545' && data.length >= 120) {
                        try {
                            // Native power at offset 112
                            const rawAmount = data.readBigUInt64LE(112);
                            const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                            
                            if (tokenAmount >= 1000 && tokenAmount > nativePower) {
                                nativePower = tokenAmount;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    break;
                }
            }
        }
        
        return nativePower;
        
    } catch (error) {
        console.error(`Error getting native power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Find delegation records where governance power is delegated TO a specific wallet
 * Returns array of delegator wallet addresses
 */
async function findDelegationRecords(targetWalletAddress) {
    try {
        const targetWalletPubkey = new PublicKey(targetWalletAddress);
        const targetWalletBuffer = targetWalletPubkey.toBuffer();
        const realmBuffer = REALM_PK.toBuffer();
        
        // Get governance program accounts for delegation records
        const allGovAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_PK);
        
        const delegators = [];
        
        for (const account of allGovAccounts) {
            const data = account.account.data;
            
            if (data.length < 150) continue; // Skip accounts too small for Token Owner Records
            
            try {
                // Check if this account is for IslandDAO realm
                const accountRealmBuffer = data.subarray(1, 33);
                if (!accountRealmBuffer.equals(realmBuffer)) continue;
                
                // Look for target wallet in delegate field (around offset 113-130)
                for (let offset = 113; offset <= 130; offset += 1) {
                    if (offset + 32 <= data.length) {
                        const delegateBuffer = data.subarray(offset, offset + 32);
                        if (delegateBuffer.equals(targetWalletBuffer)) {
                            // Found delegation TO our target wallet
                            const delegatorBuffer = data.subarray(65, 97); // governing_token_owner field
                            const delegatorPubkey = new PublicKey(delegatorBuffer);
                            const delegatorAddress = delegatorPubkey.toString();
                            
                            // Avoid duplicates and self-delegation
                            if (!delegators.includes(delegatorAddress) && delegatorAddress !== targetWalletAddress) {
                                delegators.push(delegatorAddress);
                            }
                            break;
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return delegators;
        
    } catch (error) {
        console.error(`Error finding delegations for ${targetWalletAddress}:`, error.message);
        return [];
    }
}

/**
 * Get delegated governance power by summing power from delegator wallets
 */
async function getDelegatedGovernancePower(targetWalletAddress) {
    try {
        // Find all wallets that delegate TO the target wallet
        const delegators = await findDelegationRecords(targetWalletAddress);
        
        if (delegators.length === 0) {
            return 0;
        }
        
        console.log(`Found ${delegators.length} delegators for ${targetWalletAddress.substring(0, 8)}...`);
        
        let totalDelegatedPower = 0;
        
        // Sum governance power from each delegator
        for (const delegatorAddress of delegators) {
            const delegatorPower = await getNativeGovernancePower(delegatorAddress);
            console.log(`  Delegator ${delegatorAddress.substring(0, 8)}...: ${delegatorPower.toLocaleString()} ISLAND`);
            totalDelegatedPower += delegatorPower;
        }
        
        return totalDelegatedPower;
        
    } catch (error) {
        console.error(`Error getting delegated power for ${targetWalletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Calculate governance breakdown for a single citizen
 * Returns native, delegated, and total power
 */
async function calculateGovernanceBreakdown(walletAddress) {
    console.log(`Calculating breakdown for: ${walletAddress.substring(0, 8)}...`);
    
    // Get native power from VSR accounts
    const nativePower = await getNativeGovernancePower(walletAddress);
    
    // Get total power from VSR accounts  
    const totalPower = await getTotalGovernancePower(walletAddress);
    
    // Calculate delegated power
    const delegatedPower = Math.max(0, totalPower - nativePower);
    
    console.log(`Native: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`Total: ${totalPower.toLocaleString()} ISLAND`);
    console.log(`Delegated: ${delegatedPower.toLocaleString()} ISLAND`);
    
    return {
        native: nativePower,
        delegated: delegatedPower,
        total: totalPower
    };
}

/**
 * Update a single citizen with automatic governance breakdown
 */
async function updateCitizenGovernanceBreakdown(walletAddress) {
    const breakdown = await calculateGovernanceBreakdown(walletAddress);
    
    if (breakdown.total > 0) {
        const client = await db.pool.connect();
        try {
            await client.query(
                'UPDATE citizens SET governance_power = $1, native_governance_power = $2, delegated_governance_power = $3 WHERE wallet = $4',
                [breakdown.total, breakdown.native, breakdown.delegated, walletAddress]
            );
            console.log(`✅ Updated ${walletAddress.substring(0, 8)}... with automatic breakdown`);
            return true;
        } catch (error) {
            console.error(`Database update error for ${walletAddress}:`, error.message);
            return false;
        } finally {
            client.release();
        }
    } else {
        console.log(`❌ No governance power found for ${walletAddress.substring(0, 8)}...`);
        return false;
    }
}

/**
 * Update all citizens with automatic governance breakdown
 * This is the systematic approach for database refresh
 */
async function updateAllCitizensGovernanceBreakdown() {
    console.log('🔄 Starting automatic governance breakdown for all citizens...');
    console.log('📅 Timestamp:', new Date().toISOString());
    
    // Get all citizens with any governance power
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
        
        const success = await updateCitizenGovernanceBreakdown(citizen.wallet);
        if (success) {
            successCount++;
        } else {
            errorCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n📈 AUTOMATIC BREAKDOWN UPDATE SUMMARY:');
    console.log(`✅ Successfully updated: ${successCount} citizens`);
    console.log(`❌ Errors: ${errorCount} citizens`);
    console.log(`📊 Total processed: ${citizens.length} citizens`);
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);
    
    return { success: successCount, errors: errorCount, total: citizens.length };
}

module.exports = {
    getNativeGovernancePower,
    getTotalGovernancePower,
    calculateGovernanceBreakdown,
    updateCitizenGovernanceBreakdown,
    updateAllCitizensGovernanceBreakdown
};

// If run directly, update all citizens
if (require.main === module) {
    updateAllCitizensGovernanceBreakdown().catch(console.error);
}
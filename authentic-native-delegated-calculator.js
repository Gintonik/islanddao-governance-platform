/**
 * Authentic Native/Delegated Governance Power Calculator
 * Based on Dean's List DAO leaderboard methodology
 * https://github.com/dean-s-list/deanslist-platform/blob/leaderboard/libs/api/leaderboard/data-access/src/lib/api-leaderboard-voting-power.service.ts
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getGovernanceAccounts, pubkeyFilter, booleanFilter } = require('@solana/spl-governance');
const db = require('./db');

// Initialize connection with dedicated RPC key
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e';
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`);

// IslandDAO realm configuration
const REALM_PK = new PublicKey('5piGF94RbCqaoGoRnEXwmPcgWnGNkoqm3cKqAvGmGdL3');
const GOVERNANCE_PROGRAM_PK = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const VSR_PROGRAM_PK = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Get native governance power from VSR accounts (like getLockTokensVotingPowerPerWallet)
 */
async function getNativeGovernancePower(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        // Get all VSR program accounts
        const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_PK);
        
        let nativePower = 0;
        
        // Search through VSR accounts for this wallet's native power
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            // Look for wallet reference in the account data
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
                    const discriminator = data.readBigUInt64LE(0).toString();
                    
                    // Focus on Voter Weight Records (14560581792603266545)
                    if (discriminator === '14560581792603266545' && data.length >= 120) {
                        try {
                            // Native power is typically at offset 112 in VSR accounts
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
        console.error(`Error getting native governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get delegated governance power (power delegated TO this wallet from others)
 * Based on getDelegatedVotingPower methodology
 */
async function getDelegatedGovernancePower(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        
        // Find Token Owner Records where this wallet is the delegate
        const realmFilter = pubkeyFilter(1, REALM_PK);
        const hasDelegateFilter = booleanFilter(1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6, true);
        const delegatedToUserFilter = pubkeyFilter(1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6 + 1, walletPubkey);
        
        if (!realmFilter || !delegatedToUserFilter) {
            return 0;
        }
        
        // Get governance accounts where power is delegated to this wallet
        const govAccounts = await getGovernanceAccounts(
            connection, 
            GOVERNANCE_PROGRAM_PK, 
            'TokenOwnerRecord',
            [realmFilter, hasDelegateFilter, delegatedToUserFilter]
        );
        
        if (!govAccounts || govAccounts.length === 0) {
            return 0;
        }
        
        // Calculate total delegated power from all delegators
        let totalDelegatedPower = 0;
        
        for (const govAccount of govAccounts) {
            const delegatorWallet = govAccount.account.governingTokenOwner.toString();
            
            // Get the native power of each delegator
            const delegatorNativePower = await getNativeGovernancePower(delegatorWallet);
            totalDelegatedPower += delegatorNativePower;
        }
        
        return totalDelegatedPower;
        
    } catch (error) {
        console.error(`Error getting delegated governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get complete governance power breakdown (native + delegated)
 */
async function getCompleteGovernancePowerBreakdown(walletAddress) {
    console.log(`Getting complete governance breakdown for: ${walletAddress.substring(0, 8)}...`);
    
    try {
        // Get native power (from their own tokens)
        const nativePower = await getNativeGovernancePower(walletAddress);
        
        // Get delegated power (from others delegating to this wallet)
        const delegatedPower = await getDelegatedGovernancePower(walletAddress);
        
        const totalPower = nativePower + delegatedPower;
        
        console.log(`Native: ${nativePower.toLocaleString()} ISLAND`);
        console.log(`Delegated: ${delegatedPower.toLocaleString()} ISLAND`);
        console.log(`Total: ${totalPower.toLocaleString()} ISLAND`);
        
        return {
            native: nativePower,
            delegated: delegatedPower,
            total: totalPower
        };
        
    } catch (error) {
        console.error(`Error getting governance breakdown for ${walletAddress}:`, error.message);
        return { native: 0, delegated: 0, total: 0 };
    }
}

/**
 * Update a citizen with authentic native/delegated governance power
 */
async function updateCitizenWithAuthenticBreakdown(walletAddress) {
    const breakdown = await getCompleteGovernancePowerBreakdown(walletAddress);
    
    if (breakdown.total > 0) {
        const client = await db.pool.connect();
        try {
            await client.query(
                'UPDATE citizens SET governance_power = $1, native_governance_power = $2, delegated_governance_power = $3 WHERE wallet = $4',
                [breakdown.total, breakdown.native, breakdown.delegated, walletAddress]
            );
            console.log(`✅ Updated ${walletAddress.substring(0, 8)}... with authentic breakdown`);
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
 * Update all citizens with authentic native/delegated breakdown
 */
async function updateAllCitizensWithAuthenticBreakdown() {
    console.log('🔄 Starting authentic native/delegated governance power update...');
    
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
        
        const success = await updateCitizenWithAuthenticBreakdown(citizen.wallet);
        if (success) {
            successCount++;
        } else {
            errorCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n📈 AUTHENTIC BREAKDOWN UPDATE SUMMARY:');
    console.log(`✅ Successfully updated: ${successCount} citizens`);
    console.log(`❌ Errors: ${errorCount} citizens`);
    console.log(`📊 Total processed: ${citizens.length} citizens`);
    
    return { success: successCount, errors: errorCount, total: citizens.length };
}

module.exports = {
    getNativeGovernancePower,
    getDelegatedGovernancePower,
    getCompleteGovernancePowerBreakdown,
    updateCitizenWithAuthenticBreakdown,
    updateAllCitizensWithAuthenticBreakdown
};

// If run directly, test with a specific wallet
if (require.main === module) {
    async function testBreakdown() {
        const testWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
        console.log('Testing authentic native/delegated breakdown...');
        await getCompleteGovernancePowerBreakdown(testWallet);
    }
    
    testBreakdown().catch(console.error);
}
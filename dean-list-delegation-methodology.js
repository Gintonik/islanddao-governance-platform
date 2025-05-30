/**
 * Dean's List Delegation Methodology Implementation
 * Based on the exact approach from their leaderboard code
 * https://github.com/dean-s-list/deanslist-platform/blob/leaderboard/libs/api/leaderboard/data-access/src/lib/api-leaderboard-voting-power.service.ts
 */

const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize connection with dedicated RPC key
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e';
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`);

// IslandDAO configuration (same as Dean's List uses)
const REALM_PK = new PublicKey('5piGF94RbCqaoGoRnEXwmPcgWnGNkoqm3cKqAvGmGdL3');
const GOVERNANCE_PROGRAM_PK = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const VSR_PROGRAM_PK = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Find Token Owner Records where power is delegated TO a specific wallet
 * This replicates Dean's List getGovAccounts() function
 */
async function findDelegationRecords(targetWalletAddress) {
    try {
        console.log(`Finding delegation records for: ${targetWalletAddress.substring(0, 8)}...`);
        
        const targetWalletPubkey = new PublicKey(targetWalletAddress);
        const targetWalletBuffer = targetWalletPubkey.toBuffer();
        const realmBuffer = REALM_PK.toBuffer();
        
        // Get all governance program accounts
        const allGovAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_PK);
        console.log(`Scanning ${allGovAccounts.length} governance accounts...`);
        
        const delegationRecords = [];
        
        for (const account of allGovAccounts) {
            const data = account.account.data;
            
            // Token Owner Record structure (based on Dean's List filters):
            // Offset 1: realm (32 bytes)
            // Offset 33: governing token mint (32 bytes) 
            // Offset 65: governing token owner (32 bytes) - this is the delegator
            // Offset 97: (other fields)
            // Around offset 113+: delegate field (32 bytes) - this should be our target wallet
            
            try {
                // Check if this account is for our realm
                const accountRealmBuffer = data.subarray(1, 33);
                if (!accountRealmBuffer.equals(realmBuffer)) {
                    continue; // Not our realm
                }
                
                // Look for our target wallet as the delegate
                // Dean's List uses offset: 1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6 + 1 = 122
                const delegateOffset = 122;
                
                if (data.length >= delegateOffset + 32) {
                    const delegateBuffer = data.subarray(delegateOffset, delegateOffset + 32);
                    
                    if (delegateBuffer.equals(targetWalletBuffer)) {
                        // Found a delegation TO our target wallet!
                        const delegatorBuffer = data.subarray(65, 97);
                        const delegatorPubkey = new PublicKey(delegatorBuffer);
                        const delegatorAddress = delegatorPubkey.toString();
                        
                        console.log(`Found delegation from: ${delegatorAddress.substring(0, 8)}...`);
                        
                        delegationRecords.push({
                            account: account.pubkey.toString(),
                            delegator: delegatorAddress,
                            delegate: targetWalletAddress
                        });
                    }
                }
            } catch (error) {
                // Skip malformed accounts
                continue;
            }
        }
        
        console.log(`Found ${delegationRecords.length} delegation records`);
        return delegationRecords;
        
    } catch (error) {
        console.error(`Error finding delegation records:`, error.message);
        return [];
    }
}

/**
 * Get governance power for a specific wallet from VSR accounts
 * This replicates Dean's List getGovPower() function
 */
async function getWalletGovernancePower(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        // Get all VSR program accounts
        const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_PK);
        
        let maxPower = 0;
        
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            // Look for wallet reference
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
                    const discriminator = data.readBigUInt64LE(0).toString();
                    
                    // Focus on Voter Weight Records
                    if (discriminator === '14560581792603266545' && data.length >= 120) {
                        try {
                            // Get native power from offset 112
                            const rawAmount = data.readBigUInt64LE(112);
                            const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                            
                            if (tokenAmount >= 1000 && tokenAmount > maxPower) {
                                maxPower = tokenAmount;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    break;
                }
            }
        }
        
        return maxPower;
        
    } catch (error) {
        console.error(`Error getting governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Calculate delegated voting power using Dean's List methodology
 * This replicates getDelegatedVotingPower() function
 */
async function calculateDelegatedPower(targetWalletAddress) {
    console.log(`\\n=== DEAN'S LIST DELEGATION METHODOLOGY ===`);
    console.log(`Target wallet: ${targetWalletAddress.substring(0, 8)}...`);
    
    // Step 1: Find all Token Owner Records where power is delegated TO this wallet
    const delegationRecords = await findDelegationRecords(targetWalletAddress);
    
    if (delegationRecords.length === 0) {
        console.log(`No delegations found to this wallet`);
        return { delegated: 0, delegators: [] };
    }
    
    console.log(`\\nStep 2: Calculate power of each delegator`);
    
    let totalDelegatedPower = 0;
    const delegatorDetails = [];
    
    for (const record of delegationRecords) {
        console.log(`\\nChecking delegator: ${record.delegator.substring(0, 8)}...`);
        
        const delegatorPower = await getWalletGovernancePower(record.delegator);
        console.log(`Delegator power: ${delegatorPower.toLocaleString()} ISLAND`);
        
        totalDelegatedPower += delegatorPower;
        
        delegatorDetails.push({
            wallet: record.delegator,
            power: delegatorPower
        });
    }
    
    console.log(`\\n=== DELEGATION SUMMARY ===`);
    console.log(`Total delegators: ${delegationRecords.length}`);
    console.log(`Total delegated power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
    
    return {
        delegated: totalDelegatedPower,
        delegators: delegatorDetails
    };
}

/**
 * Get complete governance breakdown using Dean's List methodology
 */
async function getCompleteGovernanceBreakdown(walletAddress) {
    console.log(`\\n=== COMPLETE GOVERNANCE BREAKDOWN ===`);
    console.log(`Wallet: ${walletAddress.substring(0, 8)}...`);
    
    // Get native power (wallet's own VSR power)
    console.log(`\\nStep 1: Getting native governance power...`);
    const nativePower = await getWalletGovernancePower(walletAddress);
    console.log(`Native power: ${nativePower.toLocaleString()} ISLAND`);
    
    // Get delegated power (power delegated TO this wallet)
    console.log(`\\nStep 2: Getting delegated governance power...`);
    const delegationResult = await calculateDelegatedPower(walletAddress);
    
    const totalPower = nativePower + delegationResult.delegated;
    
    console.log(`\\n=== FINAL BREAKDOWN ===`);
    console.log(`Native: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`Delegated: ${delegationResult.delegated.toLocaleString()} ISLAND`);
    console.log(`Total: ${totalPower.toLocaleString()} ISLAND`);
    
    if (delegationResult.delegators.length > 0) {
        console.log(`\\nDelegators:`);
        delegationResult.delegators.forEach((delegator, index) => {
            console.log(`${index + 1}. ${delegator.wallet.substring(0, 8)}... (${delegator.power.toLocaleString()} ISLAND)`);
        });
    }
    
    return {
        native: nativePower,
        delegated: delegationResult.delegated,
        total: totalPower,
        delegators: delegationResult.delegators
    };
}

module.exports = {
    findDelegationRecords,
    getWalletGovernancePower,
    calculateDelegatedPower,
    getCompleteGovernanceBreakdown
};

// If run directly, test with specific wallets
if (require.main === module) {
    async function testDelegationMethodology() {
        console.log('Testing Dean List delegation methodology...');
        
        const testWallets = [
            'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
            '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'
        ];
        
        for (const wallet of testWallets) {
            await getCompleteGovernanceBreakdown(wallet);
            console.log('\\n' + '='.repeat(80) + '\\n');
        }
    }
    
    testDelegationMethodology().catch(console.error);
}
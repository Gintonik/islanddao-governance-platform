/**
 * Delegation Sum Methodology
 * Based on Dean's List approach for summing delegated governance power
 * Prepared for when we can detect delegation relationships
 */

const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize connection with dedicated RPC key
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e';
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`);

const VSR_PROGRAM_PK = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Get governance power for a specific wallet from VSR accounts
 * This is the same proven methodology we've been using successfully
 */
async function getWalletGovernancePower(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        // Get all VSR program accounts (we know this works)
        const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_PK);
        
        let maxPower = 0;
        
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            // Look for wallet reference (proven methodology)
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
                    const discriminator = data.readBigUInt64LE(0).toString();
                    
                    // Focus on Voter Weight Records (this works)
                    if (discriminator === '14560581792603266545' && data.length >= 120) {
                        try {
                            // Get native power from offset 112 (proven to work)
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
 * Sum delegated power from known delegator addresses
 * This implements the Dean's List summing methodology
 */
async function sumDelegatedPowerFromDelegators(delegatorAddresses) {
    console.log(`Calculating delegated power from ${delegatorAddresses.length} delegators...`);
    
    let totalDelegatedPower = 0;
    const delegatorDetails = [];
    
    for (const delegatorAddress of delegatorAddresses) {
        console.log(`Getting power for delegator: ${delegatorAddress.substring(0, 8)}...`);
        
        const delegatorPower = await getWalletGovernancePower(delegatorAddress);
        console.log(`Delegator power: ${delegatorPower.toLocaleString()} ISLAND`);
        
        if (delegatorPower > 0) {
            totalDelegatedPower += delegatorPower;
            delegatorDetails.push({
                wallet: delegatorAddress,
                power: delegatorPower
            });
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\nDelegation Sum Results:`);
    console.log(`Total delegators: ${delegatorAddresses.length}`);
    console.log(`Delegators with power: ${delegatorDetails.length}`);
    console.log(`Total delegated power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
    
    return {
        totalDelegated: totalDelegatedPower,
        delegatorCount: delegatorDetails.length,
        delegators: delegatorDetails
    };
}

/**
 * Calculate complete governance breakdown with known delegators
 * This combines native power + summed delegated power
 */
async function calculateCompleteGovernanceWithDelegators(targetWallet, delegatorAddresses) {
    console.log(`\n=== COMPLETE GOVERNANCE CALCULATION ===`);
    console.log(`Target wallet: ${targetWallet.substring(0, 8)}...`);
    console.log(`Known delegators: ${delegatorAddresses.length}`);
    
    // Step 1: Get native power (proven methodology)
    console.log(`\nStep 1: Getting native governance power...`);
    const nativePower = await getWalletGovernancePower(targetWallet);
    console.log(`Native power: ${nativePower.toLocaleString()} ISLAND`);
    
    // Step 2: Sum delegated power (Dean's List methodology)
    console.log(`\nStep 2: Summing delegated power from known delegators...`);
    const delegationResult = await sumDelegatedPowerFromDelegators(delegatorAddresses);
    
    const totalPower = nativePower + delegationResult.totalDelegated;
    
    console.log(`\n=== FINAL GOVERNANCE BREAKDOWN ===`);
    console.log(`Native Power: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`Delegated Power: ${delegationResult.totalDelegated.toLocaleString()} ISLAND`);
    console.log(`Total Power: ${totalPower.toLocaleString()} ISLAND`);
    
    if (delegationResult.delegators.length > 0) {
        console.log(`\nDelegator Breakdown:`);
        delegationResult.delegators.forEach((delegator, index) => {
            console.log(`${index + 1}. ${delegator.wallet.substring(0, 8)}... - ${delegator.power.toLocaleString()} ISLAND`);
        });
    }
    
    return {
        native: nativePower,
        delegated: delegationResult.totalDelegated,
        total: totalPower,
        delegators: delegationResult.delegators
    };
}

/**
 * Test with known delegator addresses from the image
 * This will validate our summing methodology
 */
async function testWithKnownDelegators() {
    console.log('Testing delegation sum with known delegator addresses...');
    
    const targetWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
    
    // Delegator addresses from the image (partial addresses - need full addresses)
    // These are examples based on the image pattern
    const knownDelegatorPrefixes = [
        '253Do...yhkb2',
        'HMsn...KMvWT', 
        '3zxtS...eRsof',
        'Dt2Yp...X9SxW'
    ];
    
    console.log(`Target: ${targetWallet.substring(0, 8)}...`);
    console.log(`Known delegator prefixes from image:`);
    knownDelegatorPrefixes.forEach((prefix, i) => {
        console.log(`${i + 1}. ${prefix}`);
    });
    
    console.log(`\nWaiting for full delegator addresses to test summing methodology...`);
    
    // Once we have full addresses, we can test like this:
    // const fullDelegatorAddresses = ['full_address_1', 'full_address_2', ...];
    // const result = await calculateCompleteGovernanceWithDelegators(targetWallet, fullDelegatorAddresses);
    // return result;
}

module.exports = {
    getWalletGovernancePower,
    sumDelegatedPowerFromDelegators,
    calculateCompleteGovernanceWithDelegators,
    testWithKnownDelegators
};

// If run directly, test the methodology
if (require.main === module) {
    testWithKnownDelegators().catch(console.error);
}
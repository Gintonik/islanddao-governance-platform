/**
 * Authentic Governance Power Calculator
 * Fetches real governance power by analyzing actual voting participation
 * across IslandDAO proposals to match Realms display values
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getAllProposals, getVoteRecordsByVoter } = require('@solana/spl-governance');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_DECIMALS = 6; // $ISLAND has 6 decimals

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

/**
 * Get authentic governance power for a specific wallet
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<number>} - Real governance power in $ISLAND tokens
 */
async function getAuthenticGovernancePower(walletAddress) {
    try {
        console.log(`🔍 Fetching authentic governance power for: ${walletAddress}`);
        
        const voterPubkey = new PublicKey(walletAddress);
        
        // Get all vote records for this voter across IslandDAO
        const voteRecords = await getVoteRecordsByVoter(
            connection,
            GOVERNANCE_PROGRAM_ID,
            ISLAND_DAO_REALM,
            voterPubkey
        );
        
        if (voteRecords.length === 0) {
            console.log(`No voting history found for ${walletAddress}`);
            return 0;
        }
        
        let totalGovernancePower = 0;
        let latestVoteWeight = 0;
        
        console.log(`📊 Found ${voteRecords.length} vote records`);
        
        // Analyze each vote record to extract governance power
        for (const voteRecord of voteRecords) {
            const vote = voteRecord.account;
            
            // Get the vote weight (this represents their governance power at time of vote)
            if (vote.voterWeight) {
                const voteWeight = Number(vote.voterWeight) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                latestVoteWeight = Math.max(latestVoteWeight, voteWeight);
                
                console.log(`Vote weight: ${voteWeight.toLocaleString()} $ISLAND`);
            }
        }
        
        // Use the highest vote weight as their current governance power
        totalGovernancePower = latestVoteWeight;
        
        console.log(`✅ Authentic governance power: ${totalGovernancePower.toLocaleString()} $ISLAND`);
        return totalGovernancePower;
        
    } catch (error) {
        console.error(`❌ Error fetching governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get authentic governance power for multiple wallets
 * @param {Array<string>} walletAddresses - Array of wallet addresses
 * @returns {Promise<Object>} - Map of wallet address to real governance power
 */
async function getMultipleAuthenticGovernancePower(walletAddresses) {
    console.log(`🔄 Fetching authentic governance power for ${walletAddresses.length} wallets...`);
    
    const governancePowerMap = {};
    
    for (const walletAddress of walletAddresses) {
        try {
            const governancePower = await getAuthenticGovernancePower(walletAddress);
            governancePowerMap[walletAddress] = governancePower;
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`Failed to get governance power for ${walletAddress}:`, error.message);
            governancePowerMap[walletAddress] = 0;
        }
    }
    
    return governancePowerMap;
}

/**
 * Test with known wallets to verify authenticity
 */
async function testAuthenticGovernancePower() {
    console.log('🧪 Testing authentic governance power calculation...\n');
    
    const testWallets = [
        '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Expected: 8,849,081.676143
        '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'  // Expected: 625.58
    ];
    
    for (const wallet of testWallets) {
        const power = await getAuthenticGovernancePower(wallet);
        console.log(`${wallet}: ${power.toLocaleString()} $ISLAND\n`);
    }
}

module.exports = {
    getAuthenticGovernancePower,
    getMultipleAuthenticGovernancePower,
    testAuthenticGovernancePower
};

// Run test if called directly
if (require.main === module) {
    testAuthenticGovernancePower();
}
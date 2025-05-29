/**
 * VSR Governance Power Calculator for IslandDAO
 * Based on the Voter Stake Registry plugin structure
 * Reference: https://github.com/Mythic-Project/new-voter-ui/tree/main/app/plugin/VoterStakeRegistry
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// IslandDAO configuration from our previous search
const ISLAND_DAO_CONFIG = {
    realmId: '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds',
    programId: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
    communityMint: 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a'
};

// VSR Plugin Program ID (commonly used)
const VSR_PLUGIN_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

/**
 * Find Voter account PDA for a wallet in the VSR plugin
 */
function findVoterPDA(walletAddress, realmId) {
    const walletPubkey = new PublicKey(walletAddress);
    const realmPubkey = new PublicKey(realmId);
    
    const [voterPDA] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('voter'),
            realmPubkey.toBuffer(),
            walletPubkey.toBuffer()
        ],
        VSR_PLUGIN_PROGRAM_ID
    );
    
    return voterPDA;
}

/**
 * Calculate voting power from VSR Voter account data
 * Based on the off-chain calculation pattern from utils.ts
 */
function calculateVotingPowerFromVoterData(voterAccountData) {
    try {
        // VSR Voter account structure (simplified)
        // This follows the pattern from the GitHub repository you referenced
        
        let offset = 8; // Skip discriminator
        
        // Read deposits array length
        const depositsLength = voterAccountData.readUInt32LE(offset);
        offset += 4;
        
        let totalVotingPower = 0;
        
        // Process each deposit
        for (let i = 0; i < depositsLength; i++) {
            // Deposit structure (simplified based on VSR plugin)
            const amount = voterAccountData.readBigUInt64LE(offset);
            offset += 8;
            
            const lockupKind = voterAccountData.readUInt8(offset);
            offset += 1;
            
            // Skip other fields based on lockup kind
            if (lockupKind === 0) { // None
                offset += 16; // Skip periods and start_ts
            } else if (lockupKind === 1) { // Constant
                offset += 24; // Skip start_ts, end_ts, periods
            } else if (lockupKind === 2) { // Cliff
                offset += 24; // Skip start_ts, end_ts, periods
            }
            
            // Convert amount to token units (ISLAND has 6 decimals)
            const tokenAmount = Number(amount) / Math.pow(10, 6);
            
            // Add to total voting power
            // For VSR, voting power can include multipliers based on lockup
            // For now, we'll use the base amount
            totalVotingPower += tokenAmount;
        }
        
        return totalVotingPower;
        
    } catch (error) {
        console.error('Error calculating voting power:', error.message);
        return 0;
    }
}

/**
 * Get VSR governance power for a specific wallet
 */
async function getVSRGovernancePower(walletAddress) {
    try {
        console.log(`🔍 Getting VSR governance power for wallet: ${walletAddress}`);
        
        // Find the Voter PDA for this wallet
        const voterPDA = findVoterPDA(walletAddress, ISLAND_DAO_CONFIG.realmId);
        console.log(`  Voter PDA: ${voterPDA.toString()}`);
        
        // Fetch the Voter account data
        const voterAccount = await connection.getAccountInfo(voterPDA);
        
        if (!voterAccount) {
            console.log(`  ❌ No Voter account found for wallet`);
            return 0;
        }
        
        console.log(`  ✅ Found Voter account with ${voterAccount.data.length} bytes`);
        
        // Calculate voting power from the Voter account data
        const votingPower = calculateVotingPowerFromVoterData(voterAccount.data);
        
        console.log(`  💰 Voting power: ${votingPower.toLocaleString()} ISLAND`);
        
        return votingPower;
        
    } catch (error) {
        console.error(`❌ Error getting VSR governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get VSR governance power for multiple wallets
 */
async function getMultipleVSRGovernancePower(walletAddresses) {
    console.log(`🔍 Getting VSR governance power for ${walletAddresses.length} wallets`);
    
    const results = {};
    
    for (let i = 0; i < walletAddresses.length; i++) {
        const wallet = walletAddresses[i];
        console.log(`\n📊 Processing wallet ${i + 1}/${walletAddresses.length}: ${wallet}`);
        
        const power = await getVSRGovernancePower(wallet);
        results[wallet] = power;
        
        // Add small delay to avoid rate limiting
        if (i < walletAddresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

/**
 * Test with the known wallet that has 625.58 ISLAND deposited
 */
async function testVSRGovernancePower() {
    const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    
    console.log('🧪 Testing VSR governance power calculation');
    console.log(`Target wallet: ${targetWallet}`);
    console.log('Expected result: ~625.58 ISLAND');
    console.log('');
    
    const power = await getVSRGovernancePower(targetWallet);
    
    console.log(`\n📊 Result: ${power.toLocaleString()} ISLAND`);
    
    if (Math.abs(power - 625.58) < 0.1) {
        console.log('🎯 SUCCESS! Matches expected deposit amount!');
    } else if (power > 0) {
        console.log('✅ Found governance power, but amount differs from expected');
    } else {
        console.log('❌ No governance power found');
    }
    
    return power;
}

// Export functions for use in other modules
module.exports = {
    getVSRGovernancePower,
    getMultipleVSRGovernancePower,
    findVoterPDA,
    calculateVotingPowerFromVoterData
};

// Run test if this file is executed directly
if (require.main === module) {
    testVSRGovernancePower().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    });
}
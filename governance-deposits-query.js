/**
 * Query governance deposits using the deposit_governing_tokens logic
 * If users can deposit/withdraw, we can read their deposited amounts
 * This represents their governance power in the realm
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getTokenOwnerRecordAddress, getTokenOwnerRecord } = require('@solana/spl-governance');

const REALM_ADDRESS = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const COMMUNITY_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

/**
 * Get governance power by checking deposited tokens for a specific wallet
 */
async function getGovernancePowerFromDeposits(walletAddress) {
    try {
        console.log(`🔍 Checking governance deposits for: ${walletAddress}`);
        
        const walletPubkey = new PublicKey(walletAddress);
        
        // Get the TokenOwnerRecord address for this wallet and community mint
        const tokenOwnerRecordAddress = await getTokenOwnerRecordAddress(
            GOVERNANCE_PROGRAM_ID,
            REALM_ADDRESS,
            COMMUNITY_MINT,
            walletPubkey
        );
        
        console.log(`Token Owner Record PDA: ${tokenOwnerRecordAddress.toBase58()}`);
        
        // Try to get the TokenOwnerRecord account
        try {
            const tokenOwnerRecord = await getTokenOwnerRecord(
                connection,
                tokenOwnerRecordAddress
            );
            
            if (tokenOwnerRecord && tokenOwnerRecord.account.governingTokenDepositAmount) {
                const depositAmount = tokenOwnerRecord.account.governingTokenDepositAmount.toNumber();
                const governancePower = depositAmount / Math.pow(10, 6); // 6 decimals for $ISLAND
                
                console.log(`✅ Found governance deposit: ${depositAmount} lamports`);
                console.log(`✅ Governance power: ${governancePower.toLocaleString()} $ISLAND`);
                
                return governancePower;
            } else {
                console.log(`❌ No governance deposits found for ${walletAddress}`);
                return 0;
            }
            
        } catch (recordError) {
            console.log(`❌ TokenOwnerRecord not found: ${recordError.message}`);
            return 0;
        }
        
    } catch (error) {
        console.error(`❌ Error checking governance deposits for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Check governance deposits for multiple citizens
 */
async function checkGovernanceDepositsForCitizens() {
    try {
        console.log('🔄 Checking governance deposits for all citizens...');
        
        const { getAllCitizens } = require('./db.js');
        const citizens = await getAllCitizens();
        
        console.log(`Found ${citizens.length} citizens to check`);
        
        const results = [];
        
        for (const citizen of citizens) {
            try {
                const governancePower = await getGovernancePowerFromDeposits(citizen.wallet_address);
                
                if (governancePower > 0) {
                    results.push({
                        wallet: citizen.wallet_address,
                        governancePower: governancePower
                    });
                    
                    console.log(`${citizen.wallet_address}: ${governancePower.toLocaleString()} $ISLAND`);
                }
                
                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`Failed to check ${citizen.wallet_address}:`, error.message);
            }
        }
        
        console.log(`\n📊 Found ${results.length} citizens with governance power`);
        
        // Sort by governance power
        results.sort((a, b) => b.governancePower - a.governancePower);
        
        console.log('\n🏆 Top governance power holders among citizens:');
        for (const result of results.slice(0, 10)) {
            console.log(`${result.wallet}: ${result.governancePower.toLocaleString()} $ISLAND`);
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Error checking governance deposits for citizens:', error.message);
        return [];
    }
}

/**
 * Test with known wallets
 */
async function testGovernanceDeposits() {
    console.log('🧪 Testing governance deposit queries...\n');
    
    const testWallets = [
        '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Expected: 8,849,081.676143
        '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'  // Expected: 625.58
    ];
    
    for (const wallet of testWallets) {
        const power = await getGovernancePowerFromDeposits(wallet);
        console.log(`${wallet}: ${power.toLocaleString()} $ISLAND\n`);
    }
    
    // Also check all citizens
    console.log('\n🌐 Checking all citizens...');
    await checkGovernanceDepositsForCitizens();
}

module.exports = {
    getGovernancePowerFromDeposits,
    checkGovernanceDepositsForCitizens,
    testGovernanceDeposits
};

// Run test if called directly
if (require.main === module) {
    testGovernanceDeposits();
}
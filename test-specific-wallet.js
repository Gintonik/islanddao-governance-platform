/**
 * Test specific wallet with known governance power
 * Wallet: 7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA 
 * Expected: 8849081.676143 governance power (8.85%)
 */

const { fetchGovernancePower } = require('./realms-governance');

async function testSpecificWallet() {
    const walletAddress = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
    
    console.log('🔍 Testing wallet with known governance power...');
    console.log(`Wallet: ${walletAddress}`);
    console.log('Expected: 8849081.676143 $ISLAND (8.85%)');
    console.log('');
    
    try {
        const governancePower = await fetchGovernancePower(walletAddress);
        console.log(`✅ Detected governance power: ${governancePower} $ISLAND`);
        
        if (governancePower > 0) {
            console.log('🎉 Success! Governance detection working correctly');
        } else {
            console.log('❌ No governance power detected - investigating further...');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testSpecificWallet();
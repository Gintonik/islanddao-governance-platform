/**
 * Test governance power with correct ISLAND token mint
 * Token mint: 1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy
 * Test wallet: 7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA (8.85M ISLAND)
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getTokenOwnerRecordForRealm } = require('@solana/spl-governance');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function testCorrectMint() {
    const walletAddress = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
    
    console.log('🔍 Testing with correct ISLAND token mint...');
    console.log(`Wallet: ${walletAddress}`);
    console.log(`ISLAND mint: ${ISLAND_TOKEN_MINT.toBase58()}`);
    console.log('Expected: 8849081.676143 $ISLAND');
    console.log('');
    
    try {
        const walletPubkey = new PublicKey(walletAddress);
        
        // Get token owner record using correct ISLAND mint
        const tokenOwnerRecord = await getTokenOwnerRecordForRealm(
            connection,
            GOVERNANCE_PROGRAM_ID,
            ISLAND_DAO_REALM,
            ISLAND_TOKEN_MINT,
            walletPubkey
        );
        
        if (tokenOwnerRecord && tokenOwnerRecord.account.governingTokenDepositAmount) {
            const governancePowerLamports = tokenOwnerRecord.account.governingTokenDepositAmount.toNumber();
            const governancePower = governancePowerLamports / Math.pow(10, 6);
            
            console.log(`✅ SUCCESS! Detected governance power: ${governancePower} $ISLAND`);
            console.log(`🎯 Matches expected: ${governancePower === 8849081.676143 ? 'YES' : 'CLOSE'}`);
        } else {
            console.log('❌ No governance power detected');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testCorrectMint();
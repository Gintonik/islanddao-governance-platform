/**
 * Find the Token Owner Record PDA for a specific wallet
 * This is where the governance program stores the user's voting power
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getTokenOwnerRecordAddress } = require('@solana/spl-governance');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');
const TARGET_WALLET = new PublicKey('7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function findTokenOwnerRecord() {
    try {
        console.log('🔍 Finding Token Owner Record PDA for wallet...');
        console.log(`Wallet: ${TARGET_WALLET.toBase58()}`);
        console.log(`Expected governance power: 8849081.676143 $ISLAND`);
        console.log('');
        
        // Derive the Token Owner Record PDA using SPL Governance SDK
        const tokenOwnerRecordPDA = await getTokenOwnerRecordAddress(
            GOVERNANCE_PROGRAM_ID,
            ISLAND_DAO_REALM,
            ISLAND_TOKEN_MINT,
            TARGET_WALLET
        );
        
        console.log(`📍 Derived Token Owner Record PDA: ${tokenOwnerRecordPDA.toBase58()}`);
        
        // Get the account data
        const accountInfo = await connection.getAccountInfo(tokenOwnerRecordPDA);
        
        if (accountInfo) {
            console.log(`✅ Found Token Owner Record account!`);
            console.log(`   Data length: ${accountInfo.data.length} bytes`);
            console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
            
            // Parse the governance power from different possible offsets
            const data = accountInfo.data;
            console.log('\n🔍 Searching for governance power in account data...');
            
            for (let offset = 80; offset <= data.length - 8; offset += 8) {
                try {
                    const amount = data.readBigUInt64LE(offset);
                    const tokens = Number(amount) / Math.pow(10, 6);
                    
                    // Look for the expected value or significant amounts
                    if (tokens > 1000) { // Filter for meaningful amounts
                        console.log(`   Offset ${offset}: ${tokens} $ISLAND`);
                        
                        if (Math.abs(tokens - 8849081.676143) < 1) {
                            console.log(`   🎯 FOUND EXACT MATCH! ${tokens} $ISLAND`);
                            return { pda: tokenOwnerRecordPDA, tokens, offset };
                        }
                    }
                } catch (e) {
                    // Continue searching
                }
            }
        } else {
            console.log('❌ No Token Owner Record found for this wallet');
        }
        
    } catch (error) {
        console.error('❌ Error finding Token Owner Record:', error.message);
    }
}

findTokenOwnerRecord();
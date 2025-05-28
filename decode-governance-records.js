/**
 * Decode governance token owner records to find wallet mappings
 * Look for the wallet with 8849081.676143 ISLAND tokens
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const TARGET_WALLET = new PublicKey('7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function decodeGovernanceRecords() {
    try {
        console.log('🔍 Decoding governance records to find wallet mappings...');
        console.log(`Target wallet: ${TARGET_WALLET.toBase58()}`);
        console.log(`Expected tokens: 8849081.676143 $ISLAND`);
        console.log('');
        
        // Get all governance accounts for IslandDAO
        const governanceAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 1,
                        bytes: ISLAND_DAO_REALM.toBase58()
                    }
                }
            ]
        });
        
        console.log(`Found ${governanceAccounts.length} governance accounts`);
        
        for (const account of governanceAccounts) {
            const data = account.account.data;
            
            // Token owner records are typically 280+ bytes
            if (data.length >= 200) {
                try {
                    // Try different offsets to find wallet address and token amount
                    // TokenOwnerRecord structure varies, let's try multiple positions
                    
                    for (let walletOffset of [33, 41, 49, 57, 65]) {
                        for (let amountOffset of [89, 97, 105, 113, 121]) {
                            try {
                                if (data.length >= walletOffset + 32 && data.length >= amountOffset + 8) {
                                    const walletBytes = data.slice(walletOffset, walletOffset + 32);
                                    const walletPubkey = new PublicKey(walletBytes);
                                    
                                    const depositAmount = data.readBigUInt64LE(amountOffset);
                                    const tokens = Number(depositAmount) / Math.pow(10, 6);
                                    
                                    // Look for our target wallet or the expected token amount
                                    if (walletPubkey.equals(TARGET_WALLET) || Math.abs(tokens - 8849081.676143) < 1) {
                                        console.log(`\n🎯 MATCH FOUND!`);
                                        console.log(`   Account: ${account.pubkey.toBase58()}`);
                                        console.log(`   Wallet: ${walletPubkey.toBase58()}`);
                                        console.log(`   Tokens: ${tokens} $ISLAND`);
                                        console.log(`   Wallet offset: ${walletOffset}, Amount offset: ${amountOffset}`);
                                        
                                        if (walletPubkey.equals(TARGET_WALLET)) {
                                            console.log(`   ✅ TARGET WALLET CONFIRMED!`);
                                            return { account: account.pubkey, wallet: walletPubkey, tokens };
                                        }
                                    }
                                }
                            } catch (e) {
                                // Continue trying different offsets
                            }
                        }
                    }
                } catch (e) {
                    // Continue to next account
                }
            }
        }
        
        console.log('\n❌ Target wallet not found in governance records');
        
    } catch (error) {
        console.error('❌ Error decoding governance records:', error.message);
    }
}

decodeGovernanceRecords();
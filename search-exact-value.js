/**
 * Search for the exact governance power value in all governance accounts
 * Looking for 8849081.676143 $ISLAND tokens
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const TARGET_AMOUNT = 8849081.676143;

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function searchExactValue() {
    try {
        console.log('🔍 Searching for exact governance power value...');
        console.log(`Target amount: ${TARGET_AMOUNT} $ISLAND`);
        console.log('');
        
        // Get all governance accounts
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
        
        console.log(`Searching through ${governanceAccounts.length} governance accounts...`);
        
        for (const account of governanceAccounts) {
            const data = account.account.data;
            
            // Search through all 8-byte positions for the target amount
            for (let offset = 0; offset <= data.length - 8; offset++) {
                try {
                    const amount = data.readBigUInt64LE(offset);
                    const tokens = Number(amount) / Math.pow(10, 6);
                    
                    // Check if this matches our target (within small tolerance)
                    if (Math.abs(tokens - TARGET_AMOUNT) < 0.001) {
                        console.log(`\n🎯 EXACT MATCH FOUND!`);
                        console.log(`   Account: ${account.pubkey.toBase58()}`);
                        console.log(`   Amount: ${tokens} $ISLAND`);
                        console.log(`   Offset: ${offset} bytes`);
                        console.log(`   Raw value: ${amount.toString()}`);
                        
                        // Try to find wallet address in this account
                        console.log('\n🔍 Looking for wallet address in this account...');
                        for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
                            try {
                                const walletBytes = data.slice(walletOffset, walletOffset + 32);
                                const walletPubkey = new PublicKey(walletBytes);
                                console.log(`   Possible wallet at offset ${walletOffset}: ${walletPubkey.toBase58()}`);
                            } catch (e) {
                                // Continue searching
                            }
                        }
                        
                        return { account: account.pubkey, tokens, offset };
                    }
                } catch (e) {
                    // Continue searching
                }
            }
        }
        
        console.log('\n❌ Exact value not found in governance accounts');
        
    } catch (error) {
        console.error('❌ Error searching for exact value:', error.message);
    }
}

searchExactValue();
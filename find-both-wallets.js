/**
 * Find governance power for both known wallets to understand the mapping pattern
 * Wallet 1: 7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA = 8,849,081.676143 ISLAND
 * Wallet 2: 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4 = 625.58 ISLAND
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const WALLET_1 = new PublicKey('7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA');
const AMOUNT_1 = 8849081.676143;

const WALLET_2 = new PublicKey('4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4');
const AMOUNT_2 = 625.58;

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function findBothWallets() {
    try {
        console.log('🔍 Finding governance accounts for both known wallets...');
        console.log(`Wallet 1: ${WALLET_1.toBase58()} = ${AMOUNT_1} ISLAND`);
        console.log(`Wallet 2: ${WALLET_2.toBase58()} = ${AMOUNT_2} ISLAND`);
        console.log('');
        
        // Get governance accounts
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
        
        const matches = [];
        
        for (const account of governanceAccounts) {
            const data = account.account.data;
            
            // Search for amounts that match our targets
            for (let offset = 80; offset <= data.length - 8; offset += 8) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    
                    // Try different decimal interpretations
                    const decimals = [0, 3, 6, 9];
                    
                    for (const decimal of decimals) {
                        const tokens = Number(rawAmount) / Math.pow(10, decimal);
                        
                        // Check for matches with tolerance
                        if (Math.abs(tokens - AMOUNT_1) < 1000) {
                            console.log(`\n🎯 WALLET 1 MATCH FOUND!`);
                            console.log(`   Account: ${account.pubkey.toBase58()}`);
                            console.log(`   Amount: ${tokens} ISLAND`);
                            console.log(`   Offset: ${offset}, Decimals: ${decimal}`);
                            matches.push({ wallet: WALLET_1, account: account.pubkey, tokens, offset, decimal });
                        }
                        
                        if (Math.abs(tokens - AMOUNT_2) < 10) {
                            console.log(`\n🎯 WALLET 2 MATCH FOUND!`);
                            console.log(`   Account: ${account.pubkey.toBase58()}`);
                            console.log(`   Amount: ${tokens} ISLAND`);
                            console.log(`   Offset: ${offset}, Decimals: ${decimal}`);
                            matches.push({ wallet: WALLET_2, account: account.pubkey, tokens, offset, decimal });
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }
        }
        
        if (matches.length > 0) {
            console.log(`\n✅ Found ${matches.length} matches! Now I can build the mapping system.`);
        } else {
            console.log('\n❌ No matches found - need to investigate further');
        }
        
        return matches;
        
    } catch (error) {
        console.error('❌ Error finding wallets:', error.message);
    }
}

findBothWallets();
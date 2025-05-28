/**
 * Query VSR (Voter Stake Registry) for IslandDAO governance power
 * This is likely where the 8.85M ISLAND tokens are actually stored
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const VSR_PROGRAM = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const TARGET_WALLET = new PublicKey('7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA');
const TARGET_AMOUNT = 8849081.676143;

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function queryVSRGovernance() {
    try {
        console.log('🔍 Querying VSR for IslandDAO governance power...');
        console.log(`Target wallet: ${TARGET_WALLET.toBase58()}`);
        console.log(`Expected: ${TARGET_AMOUNT} ISLAND`);
        console.log('');
        
        // Look for VSR accounts related to IslandDAO realm
        const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM, {
            filters: [
                {
                    memcmp: {
                        offset: 8, // Skip discriminator
                        bytes: ISLAND_DAO_REALM.toBase58()
                    }
                }
            ]
        });
        
        console.log(`✅ Found ${vsrAccounts.length} VSR accounts for IslandDAO`);
        
        for (const account of vsrAccounts) {
            const data = account.account.data;
            
            // Search for the target wallet address in VSR accounts
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                try {
                    const walletBytes = data.slice(offset, offset + 32);
                    const walletPubkey = new PublicKey(walletBytes);
                    
                    if (walletPubkey.equals(TARGET_WALLET)) {
                        console.log(`\n🎯 FOUND TARGET WALLET!`);
                        console.log(`   VSR Account: ${account.pubkey.toBase58()}`);
                        console.log(`   Wallet found at offset: ${offset}`);
                        
                        // Look for governance power amounts near this wallet
                        for (let amountOffset = Math.max(0, offset - 100); amountOffset <= Math.min(data.length - 8, offset + 100); amountOffset += 8) {
                            try {
                                const amount = data.readBigUInt64LE(amountOffset);
                                const tokens = Number(amount) / Math.pow(10, 6);
                                
                                if (tokens > 1000) {
                                    console.log(`     Offset ${amountOffset}: ${tokens} ISLAND`);
                                    
                                    if (Math.abs(tokens - TARGET_AMOUNT) < 1) {
                                        console.log(`     🎉 EXACT MATCH! ${tokens} ISLAND`);
                                        return { account: account.pubkey, tokens, offset: amountOffset };
                                    }
                                }
                            } catch (e) {
                                // Continue searching
                            }
                        }
                    }
                } catch (e) {
                    // Continue searching
                }
            }
        }
        
        console.log('\n❌ Target wallet not found in VSR accounts');
        
    } catch (error) {
        console.error('❌ Error querying VSR:', error.message);
    }
}

queryVSRGovernance();
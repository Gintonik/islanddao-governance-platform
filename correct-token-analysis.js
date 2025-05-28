/**
 * Correct analysis accounting for ISLAND token economics:
 * - Total supply: 100M tokens
 * - Max in governance: ~60M tokens
 * - Target wallet: 8.85M tokens (8.85% of total supply)
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const TARGET_AMOUNT = 8849081.676143; // 8.85M tokens

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function correctTokenAnalysis() {
    try {
        console.log('🔍 Analyzing with correct ISLAND token economics...');
        console.log('Total supply: 100M ISLAND');
        console.log('Max in governance: ~60M ISLAND');
        console.log(`Target: ${TARGET_AMOUNT} ISLAND (8.85% of supply)`);
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
        
        for (const account of governanceAccounts) {
            const data = account.account.data;
            console.log(`\n📄 Account: ${account.pubkey.toBase58()}`);
            
            // Try different decimal interpretations
            const decimals = [6, 9, 3, 0]; // Common token decimal places
            
            for (let offset = 80; offset <= data.length - 8; offset += 8) {
                try {
                    const rawAmount = data.readBigUInt64LE(offset);
                    
                    for (const decimal of decimals) {
                        const tokens = Number(rawAmount) / Math.pow(10, decimal);
                        
                        // Look for realistic amounts (between 1K and 60M)
                        if (tokens >= 1000 && tokens <= 60000000) {
                            console.log(`   Offset ${offset}, ${decimal} decimals: ${tokens.toFixed(6)} ISLAND`);
                            
                            // Check if this matches our target
                            if (Math.abs(tokens - TARGET_AMOUNT) < 1000) {
                                console.log(`   🎯 POTENTIAL MATCH! ${tokens.toFixed(6)} ISLAND`);
                            }
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error in analysis:', error.message);
    }
}

correctTokenAnalysis();
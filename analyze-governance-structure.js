/**
 * Deep analysis of IslandDAO governance structure
 * Try to understand how the 8.85M ISLAND tokens are actually stored
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');
const TARGET_WALLET = new PublicKey('7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function analyzeGovernanceStructure() {
    try {
        console.log('🔍 Deep analysis of IslandDAO governance structure');
        console.log(`Target: ${TARGET_WALLET.toBase58()} with 8,849,081.676143 ISLAND`);
        console.log('');
        
        // 1. Try different PDA derivation methods
        console.log('1. Testing different Token Owner Record derivations...');
        
        const seeds = [
            ['governance', ISLAND_DAO_REALM.toBuffer(), ISLAND_TOKEN_MINT.toBuffer(), TARGET_WALLET.toBuffer()],
            ['token-owner-record', ISLAND_DAO_REALM.toBuffer(), ISLAND_TOKEN_MINT.toBuffer(), TARGET_WALLET.toBuffer()],
            [Buffer.from('governance'), ISLAND_DAO_REALM.toBuffer(), ISLAND_TOKEN_MINT.toBuffer(), TARGET_WALLET.toBuffer()],
            [Buffer.from('token_owner_record'), ISLAND_DAO_REALM.toBuffer(), ISLAND_TOKEN_MINT.toBuffer(), TARGET_WALLET.toBuffer()]
        ];
        
        for (let i = 0; i < seeds.length; i++) {
            try {
                const [pda] = await PublicKey.findProgramAddress(seeds[i], GOVERNANCE_PROGRAM_ID);
                console.log(`   Method ${i + 1}: ${pda.toBase58()}`);
                
                const account = await connection.getAccountInfo(pda);
                if (account) {
                    console.log(`   ✅ Account exists! Data length: ${account.data.length}`);
                    
                    // Look for governance power in this account
                    for (let offset = 0; offset <= account.data.length - 8; offset += 8) {
                        const amount = account.data.readBigUInt64LE(offset);
                        const tokens = Number(amount) / Math.pow(10, 6);
                        if (tokens > 1000000) { // Large amounts
                            console.log(`     Offset ${offset}: ${tokens} ISLAND`);
                        }
                    }
                }
            } catch (e) {
                // Continue
            }
        }
        
        // 2. Check if governance uses a different program entirely
        console.log('\n2. Checking for VSR (Voter Stake Registry) or other governance programs...');
        
        // VSR is commonly used by Realms for advanced governance
        const VSR_PROGRAM = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
        
        try {
            const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM);
            console.log(`   Found ${vsrAccounts.length} VSR accounts`);
            
            if (vsrAccounts.length > 0) {
                console.log('   🎯 VSR program might be handling governance!');
            }
        } catch (e) {
            console.log('   No VSR accounts found');
        }
        
        // 3. Check for any accounts owned by the target wallet
        console.log(`\n3. Checking accounts owned by ${TARGET_WALLET.toBase58()}...`);
        
        const ownedAccounts = await connection.getParsedProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: TARGET_WALLET.toBase58()
                    }
                }
            ]
        });
        
        console.log(`   Found ${ownedAccounts.length} accounts`);
        
        for (const account of ownedAccounts) {
            console.log(`   Account: ${account.pubkey.toBase58()}`);
        }
        
    } catch (error) {
        console.error('❌ Error in analysis:', error.message);
    }
}

analyzeGovernanceStructure();
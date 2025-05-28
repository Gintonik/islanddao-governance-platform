/**
 * Test governance access using public Solana RPC
 * This will help us determine if we can access IslandDAO governance data
 * without requiring special API permissions
 */

const { Connection, PublicKey } = require('@solana/web3.js');

// Try with public RPC first
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

async function testGovernanceAccess() {
    try {
        console.log('🔍 Testing governance data access...');
        
        // Test 1: Check if we can access the realm account
        console.log('1. Testing realm account access...');
        const realmAccount = await connection.getAccountInfo(ISLAND_DAO_REALM);
        if (realmAccount) {
            console.log('✅ Realm account accessible');
            console.log(`   Data length: ${realmAccount.data.length} bytes`);
        } else {
            console.log('❌ Cannot access realm account');
        }
        
        // Test 2: Try to get program accounts for governance
        console.log('2. Testing governance program accounts...');
        const governanceAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: ISLAND_DAO_REALM.toBase58()
                    }
                }
            ]
        });
        
        console.log(`✅ Found ${governanceAccounts.length} governance accounts for IslandDAO`);
        
        // Test 3: Test with a sample citizen wallet
        const sampleWallet = new PublicKey('37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA');
        
        // Derive token owner record PDA
        const [tokenOwnerRecordPDA] = await PublicKey.findProgramAddress(
            [
                Buffer.from('governance'),
                ISLAND_DAO_REALM.toBuffer(),
                ISLAND_DAO_REALM.toBuffer(), // Using realm as token mint for test
                sampleWallet.toBuffer(),
            ],
            GOVERNANCE_PROGRAM_ID
        );
        
        console.log('3. Testing sample wallet governance record...');
        console.log(`   Derived PDA: ${tokenOwnerRecordPDA.toBase58()}`);
        
        const tokenOwnerRecord = await connection.getAccountInfo(tokenOwnerRecordPDA);
        if (tokenOwnerRecord) {
            console.log('✅ Found governance record for sample wallet');
            console.log(`   Data length: ${tokenOwnerRecord.data.length} bytes`);
        } else {
            console.log('ℹ️  No governance record found for sample wallet (expected if no tokens deposited)');
        }
        
    } catch (error) {
        console.error('❌ Error testing governance access:', error.message);
    }
}

testGovernanceAccess();
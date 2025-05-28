/**
 * Find governance program accounts for IslandDAO
 * Look for token deposits in the governance program
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function findGovernanceAccounts() {
    try {
        console.log('🔍 Searching for governance program accounts...');
        console.log(`Realm: ${ISLAND_DAO_REALM.toBase58()}`);
        console.log(`Governance Program: ${GOVERNANCE_PROGRAM_ID.toBase58()}`);
        console.log(`ISLAND Token: ${ISLAND_TOKEN_MINT.toBase58()}`);
        console.log('');
        
        // Get all accounts owned by the governance program for this realm
        const governanceAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 1, // Skip account discriminator
                        bytes: ISLAND_DAO_REALM.toBase58()
                    }
                }
            ]
        });
        
        console.log(`✅ Found ${governanceAccounts.length} governance accounts for IslandDAO`);
        
        // Look for token owner records specifically
        for (let i = 0; i < Math.min(governanceAccounts.length, 10); i++) {
            const account = governanceAccounts[i];
            console.log(`\n📄 Account ${i + 1}: ${account.pubkey.toBase58()}`);
            console.log(`   Owner: ${account.account.owner.toBase58()}`);
            console.log(`   Data length: ${account.account.data.length} bytes`);
            
            // Try to decode if it's a token owner record (they're usually around 150+ bytes)
            if (account.account.data.length > 100) {
                try {
                    // Token owner records have governance token deposit amount at specific offsets
                    const data = account.account.data;
                    if (data.length >= 105) {
                        const depositAmount = data.readBigUInt64LE(97); // Common offset for deposit amount
                        if (depositAmount > 0) {
                            const tokens = Number(depositAmount) / Math.pow(10, 6);
                            console.log(`   🎯 FOUND TOKENS: ${tokens} $ISLAND`);
                        }
                    }
                } catch (e) {
                    // Continue if parsing fails
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error finding governance accounts:', error.message);
    }
}

findGovernanceAccounts();
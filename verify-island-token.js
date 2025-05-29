/**
 * Verify the correct ISLAND token mint for IslandDAO governance
 * Let's check what token mint is actually used in the realm
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getRealm } = require('@solana/spl-governance');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function verifyIslandTokenMint() {
    try {
        console.log('🔍 Verifying ISLAND token mint for IslandDAO governance...');
        console.log(`Realm: ${ISLAND_DAO_REALM.toBase58()}`);
        
        // Get the realm account to see what token mints are configured
        const realm = await getRealm(connection, ISLAND_DAO_REALM);
        
        console.log('\n📋 Realm Configuration:');
        console.log(`Realm Name: "${realm.account.name}"`);
        console.log(`Community Mint: ${realm.account.communityMint?.toBase58() || 'None'}`);
        console.log(`Council Mint: ${realm.account.councilMint?.toBase58() || 'None'}`);
        
        // Check if the community mint is what we expect
        const currentTokenMint = '1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy';
        const realmCommunityMint = realm.account.communityMint?.toBase58();
        
        console.log('\n🎯 Token Mint Verification:');
        console.log(`Expected ISLAND mint: ${currentTokenMint}`);
        console.log(`Realm community mint: ${realmCommunityMint}`);
        console.log(`Match: ${currentTokenMint === realmCommunityMint ? '✅ YES' : '❌ NO'}`);
        
        if (currentTokenMint !== realmCommunityMint) {
            console.log('\n⚠️ Token mint mismatch detected!');
            console.log('The token mint we\'re using might not be the correct one for IslandDAO governance.');
            
            if (realmCommunityMint) {
                console.log(`\n🔄 Let's use the realm's actual community mint: ${realmCommunityMint}`);
                
                // Try to get token info for the realm's community mint
                try {
                    const mintInfo = await connection.getParsedAccountInfo(realm.account.communityMint);
                    if (mintInfo.value?.data) {
                        const parsed = mintInfo.value.data.parsed;
                        console.log(`Token decimals: ${parsed.info.decimals}`);
                        console.log(`Token supply: ${parsed.info.supply}`);
                        console.log(`Mint authority: ${parsed.info.mintAuthority || 'None'}`);
                    }
                } catch (error) {
                    console.log(`Error getting mint info: ${error.message}`);
                }
            }
        }
        
        return {
            realmName: realm.account.name,
            communityMint: realmCommunityMint,
            councilMint: realm.account.councilMint?.toBase58(),
            isCorrectMint: currentTokenMint === realmCommunityMint
        };
        
    } catch (error) {
        console.error('❌ Error verifying ISLAND token mint:', error.message);
        return null;
    }
}

// Run the verification
verifyIslandTokenMint();
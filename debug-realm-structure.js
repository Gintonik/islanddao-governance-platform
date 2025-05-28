/**
 * Debug IslandDAO realm structure to understand governance setup
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getRealm } = require('@solana/spl-governance');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

// Use public RPC to avoid rate limits
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

async function debugRealmStructure() {
    try {
        console.log('🔍 Analyzing IslandDAO realm structure...');
        console.log(`Realm: ${ISLAND_DAO_REALM.toBase58()}`);
        console.log('');
        
        // Get realm data
        const realmData = await getRealm(connection, ISLAND_DAO_REALM);
        
        console.log('📋 Realm Information:');
        console.log(`  Community Mint: ${realmData.account.communityMint?.toBase58() || 'None'}`);
        console.log(`  Council Mint: ${realmData.account.config.councilMint?.toBase58() || 'None'}`);
        console.log(`  Authority: ${realmData.account.authority?.toBase58() || 'None'}`);
        console.log(`  Name: ${realmData.account.name}`);
        console.log('');
        
        // Check both community and council mints
        const communityMint = realmData.account.communityMint;
        const councilMint = realmData.account.config.councilMint;
        
        if (communityMint) {
            console.log(`✅ Community mint found: ${communityMint.toBase58()}`);
        }
        
        if (councilMint) {
            console.log(`✅ Council mint found: ${councilMint.toBase58()}`);
        }
        
        return { communityMint, councilMint };
        
    } catch (error) {
        console.error('❌ Error analyzing realm:', error.message);
        return null;
    }
}

debugRealmStructure();
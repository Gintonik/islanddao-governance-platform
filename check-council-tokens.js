/**
 * Check if any citizens have council token deposits in SPL governance
 * Council tokens provide different governance rights than community tokens
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

async function checkCouncilTokensForCitizens() {
    try {
        console.log('🔍 Checking for council token deposits among our citizens');
        console.log(`Realm: ${ISLAND_DAO_REALM}`);
        console.log('');

        // Get all citizens from our database
        const citizens = await db.getAllCitizens();
        console.log(`📊 Checking ${citizens.length} citizens for council tokens`);

        if (citizens.length === 0) {
            console.log('❌ No citizens found in database');
            return [];
        }

        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        
        // First, get the realm account to find the council mint
        console.log('📊 Getting realm configuration...');
        const realmAccount = await connection.getAccountInfo(realmPubkey);
        
        if (!realmAccount) {
            console.log('❌ Could not fetch realm account');
            return [];
        }

        // Parse realm to get council mint
        const realmData = realmAccount.data;
        const authority = new PublicKey(realmData.subarray(1, 33));
        const communityMint = new PublicKey(realmData.subarray(33, 65));
        
        // Use the correct council mint address for IslandDAO
        const councilMint = new PublicKey('6QqMpiCWGuQtGEKTJvhLBTz6GcjpwVS3ywCPwJ6HLoG8');

        console.log(`Community mint: ${communityMint.toString()}`);
        console.log(`Council mint: ${councilMint ? councilMint.toString() : 'None'}`);

        if (!councilMint) {
            console.log('ℹ️ This realm has no council mint configured');
            return [];
        }

        console.log('\n📊 Searching for council token owner records...');

        // Get all Token Owner Records for this realm
        const allTORs = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 1, // Realm reference
                        bytes: realmPubkey.toBase58()
                    }
                },
                {
                    memcmp: {
                        offset: 33, // Governing token mint
                        bytes: councilMint.toBase58()
                    }
                }
            ]
        });

        console.log(`Found ${allTORs.length} council token owner records`);

        if (allTORs.length === 0) {
            console.log('ℹ️ No council token deposits found for this realm');
            return [];
        }

        // Check which of our citizens have council tokens
        const citizensWithCouncil = [];
        
        for (const citizen of citizens) {
            const citizenWalletPubkey = new PublicKey(citizen.wallet_address);
            
            for (const tor of allTORs) {
                try {
                    const torData = tor.account.data;
                    const governingTokenOwner = new PublicKey(torData.subarray(65, 97));
                    
                    if (governingTokenOwner.equals(citizenWalletPubkey)) {
                        // Read the council token deposit amount
                        const depositAmount = torData.readBigUInt64LE(97);
                        const tokenAmount = Number(depositAmount) / Math.pow(10, 6); // Assuming 6 decimals
                        
                        console.log(`\n💼 Council token holder found!`);
                        console.log(`  Citizen: ${citizen.wallet_address}`);
                        console.log(`  Name: ${citizen.name || 'Unknown'}`);
                        console.log(`  Council tokens: ${tokenAmount.toLocaleString()}`);
                        console.log(`  TOR account: ${tor.pubkey.toString()}`);
                        
                        citizensWithCouncil.push({
                            wallet: citizen.wallet_address,
                            name: citizen.name,
                            councilTokens: tokenAmount,
                            torAccount: tor.pubkey.toString(),
                            communityTokens: citizen.governance_power || 0
                        });
                        
                        break;
                    }
                } catch (error) {
                    // Continue checking
                }
            }
        }

        return citizensWithCouncil;

    } catch (error) {
        console.error('❌ Error checking council tokens:', error.message);
        return [];
    }
}

async function displayCouncilTokenSummary() {
    const councilHolders = await checkCouncilTokensForCitizens();
    
    console.log('\n📋 COUNCIL TOKEN SUMMARY');
    console.log('='.repeat(50));
    
    if (councilHolders.length === 0) {
        console.log('No citizens found with council token deposits');
    } else {
        console.log(`Found ${councilHolders.length} citizens with council tokens:`);
        
        councilHolders.forEach((holder, index) => {
            console.log(`\n${index + 1}. ${holder.name || 'Unnamed Citizen'}`);
            console.log(`   Wallet: ${holder.wallet}`);
            console.log(`   Council tokens: ${holder.councilTokens.toLocaleString()}`);
            console.log(`   Community tokens: ${holder.communityTokens.toLocaleString()}`);
        });
        
        const totalCouncilTokens = councilHolders.reduce((sum, holder) => sum + holder.councilTokens, 0);
        console.log(`\nTotal council tokens held: ${totalCouncilTokens.toLocaleString()}`);
    }
    
    return councilHolders;
}

// Run the check
if (require.main === module) {
    displayCouncilTokenSummary().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ Failed to check council tokens:', error.message);
        process.exit(1);
    });
}

module.exports = { checkCouncilTokensForCitizens, displayCouncilTokenSummary };
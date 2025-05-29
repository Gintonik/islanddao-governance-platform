/**
 * Dean's List DAO Governance Query
 * Using the authentic addresses from the DAO parameters screenshot
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getAllTokenOwnerRecords, getTokenOwnerRecord, getRealm } = require('@solana/spl-governance');

// Use the original realm address we know works
const REALM_PUBKEY = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a'); // Known working realm
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

// Community token mint from previous verification
const COMMUNITY_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function queryDeansListGovernance() {
    try {
        console.log('🔍 Querying Dean\'s List DAO governance with authentic addresses...');
        console.log(`Realm: ${REALM_PUBKEY.toBase58()}`);
        console.log(`Community Mint: ${COMMUNITY_MINT.toBase58()}`);
        
        // Try to get the realm with the authentic pubkey
        try {
            const realm = await getRealm(connection, REALM_PUBKEY);
            console.log('\n✅ Realm found!');
            console.log(`Realm Name: "${realm.account.name}"`);
            console.log(`Community Mint: ${realm.account.communityMint?.toBase58() || 'None'}`);
            console.log(`Council Mint: ${realm.account.councilMint?.toBase58() || 'None'}`);
            
            // Get all token owner records for this realm
            const allTokenOwnerRecords = await getAllTokenOwnerRecords(
                connection,
                GOVERNANCE_PROGRAM_ID,
                REALM_PUBKEY
            );
            
            console.log(`\n📊 Found ${allTokenOwnerRecords.length} token owner records`);
            
            const governancePowerData = [];
            
            for (const record of allTokenOwnerRecords) {
                const account = record.account;
                const walletAddress = account.governingTokenOwner.toBase58();
                const tokenMint = account.governingTokenMint.toBase58();
                
                // Check if this is for the community mint
                if (account.governingTokenMint.equals(COMMUNITY_MINT)) {
                    const depositAmount = account.governingTokenDepositAmount?.toNumber() || 0;
                    const governancePower = depositAmount / Math.pow(10, 6); // 6 decimals
                    
                    if (governancePower > 0) {
                        governancePowerData.push({
                            wallet: walletAddress,
                            governancePower: governancePower,
                            depositAmount: depositAmount
                        });
                        
                        console.log(`${walletAddress}: ${governancePower.toLocaleString()} $ISLAND`);
                    }
                }
            }
            
            // Sort by governance power
            governancePowerData.sort((a, b) => b.governancePower - a.governancePower);
            
            console.log('\n🏆 Top governance power holders:');
            for (const data of governancePowerData.slice(0, 10)) {
                console.log(`${data.wallet}: ${data.governancePower.toLocaleString()} $ISLAND`);
            }
            
            // Check our known test wallets
            console.log('\n🎯 Checking known test wallets:');
            const testWallets = [
                '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Expected: 8,849,081.676143
                '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'  // Expected: 625.58
            ];
            
            for (const wallet of testWallets) {
                const found = governancePowerData.find(d => d.wallet === wallet);
                if (found) {
                    console.log(`✅ ${wallet}: ${found.governancePower.toLocaleString()} $ISLAND`);
                } else {
                    console.log(`❌ ${wallet}: Not found in governance records`);
                }
            }
            
            return governancePowerData;
            
        } catch (realmError) {
            console.error(`❌ Error accessing realm: ${realmError.message}`);
            return [];
        }
        
    } catch (error) {
        console.error('❌ Error querying Dean\'s List governance:', error.message);
        return [];
    }
}

// Run the query
queryDeansListGovernance();
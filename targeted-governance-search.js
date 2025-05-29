/**
 * Targeted search for IslandDAO governance using efficient filtering
 * Focus on finding realms that use ISLAND token specifically
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

// Main governance program ID
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

async function findIslandDAOGovernance() {
    try {
        console.log('🔍 Targeted search for IslandDAO governance');
        console.log(`ISLAND Token: ${ISLAND_TOKEN_MINT.toString()}`);
        console.log('');

        // Search for realm accounts that have ISLAND token as community mint
        console.log('📊 Searching for realms with ISLAND token as community mint...');
        
        const realmAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 33, // Community mint offset in realm structure
                        bytes: ISLAND_TOKEN_MINT.toBase58()
                    }
                }
            ]
        });

        console.log(`Found ${realmAccounts.length} realms using ISLAND token`);

        if (realmAccounts.length === 0) {
            console.log('❌ No realms found using ISLAND token');
            return null;
        }

        for (const realm of realmAccounts) {
            console.log(`\n🏛️ Found ISLAND DAO Realm: ${realm.pubkey.toString()}`);
            
            const data = realm.account.data;
            const authority = new PublicKey(data.subarray(1, 33));
            const communityMint = new PublicKey(data.subarray(33, 65));
            
            console.log(`  Authority: ${authority.toString()}`);
            console.log(`  Community Mint: ${communityMint.toString()}`);
            
            // Extract realm name
            let realmName = 'IslandDAO';
            try {
                if (data.length > 97) {
                    const nameLength = data.readUInt32LE(97);
                    if (nameLength > 0 && nameLength < 100) {
                        const nameBytes = data.subarray(97 + 4, 97 + 4 + nameLength);
                        realmName = nameBytes.toString('utf8');
                    }
                }
            } catch (error) {
                // Use default name
            }
            
            console.log(`  Name: ${realmName}`);

            // Create IslandDAO configuration
            const islandDAOConfig = {
                symbol: "ISLAND",
                displayName: realmName,
                programId: GOVERNANCE_PROGRAM_ID.toString(),
                realmId: realm.pubkey.toString(),
                communityMint: communityMint.toString(),
                authority: authority.toString(),
                website: "https://app.realms.today/dao/IslandDAO"
            };

            console.log('\n🎯 IslandDAO Configuration:');
            console.log(JSON.stringify(islandDAOConfig, null, 2));

            // Now search for Token Owner Records for this specific realm
            console.log('\n🔍 Searching for Token Owner Records...');
            
            const tokenOwnerRecords = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
                filters: [
                    {
                        memcmp: {
                            offset: 1, // Realm reference offset in TokenOwnerRecord
                            bytes: realm.pubkey.toBase58()
                        }
                    }
                ]
            });

            console.log(`Found ${tokenOwnerRecords.length} Token Owner Records for this realm`);

            // Search for the target wallet
            const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
            const targetWalletPubkey = new PublicKey(targetWallet);
            
            console.log(`\n🎯 Searching for target wallet: ${targetWallet}`);

            for (const record of tokenOwnerRecords) {
                try {
                    const recordData = record.account.data;
                    
                    // Token Owner Record structure:
                    // 0: account type (1 byte)
                    // 1-32: realm (32 bytes)
                    // 33-64: governing token mint (32 bytes)
                    // 65-96: governing token owner (32 bytes)
                    // 97-104: governing token deposit amount (8 bytes)
                    
                    const governingTokenOwner = new PublicKey(recordData.subarray(65, 97));
                    
                    if (governingTokenOwner.equals(targetWalletPubkey)) {
                        console.log(`\n💰 FOUND TARGET WALLET RECORD: ${record.pubkey.toString()}`);
                        
                        // Read the deposit amount
                        const depositAmount = recordData.readBigUInt64LE(97);
                        const tokenAmount = Number(depositAmount) / Math.pow(10, 6); // ISLAND has 6 decimals
                        
                        console.log(`  Deposited amount: ${tokenAmount.toLocaleString()} ISLAND`);
                        
                        if (Math.abs(tokenAmount - 625.58) < 0.1) {
                            console.log(`  🎯 MATCHES EXPECTED DEPOSIT AMOUNT!`);
                        }
                        
                        return {
                            config: islandDAOConfig,
                            targetWalletRecord: {
                                account: record.pubkey.toString(),
                                wallet: targetWallet,
                                depositedAmount: tokenAmount
                            }
                        };
                    }
                } catch (error) {
                    // Continue searching
                }
            }

            return { config: islandDAOConfig };
        }

        return null;

    } catch (error) {
        console.error('❌ Error in targeted governance search:', error.message);
        return null;
    }
}

// Run the targeted search
findIslandDAOGovernance().then((result) => {
    if (result) {
        console.log('\n✅ Successfully found IslandDAO governance configuration!');
        if (result.targetWalletRecord) {
            console.log('✅ Also found the target wallet with deposit amount!');
        }
    } else {
        console.log('\n❌ Could not find IslandDAO governance configuration');
    }
    process.exit(0);
});
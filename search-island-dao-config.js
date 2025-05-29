/**
 * Search for IslandDAO configuration similar to MetaplexDAO structure
 * Looking for realmId, communityMint, programId, etc.
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

async function findIslandDAOConfig() {
    try {
        console.log('🔍 Searching for IslandDAO configuration like MetaplexDAO');
        console.log('Looking for: realmId, communityMint, programId, displayName');
        console.log('');

        // First, let's get all Realm accounts from SPL Governance
        console.log('📊 Getting all Realm accounts from SPL Governance...');
        
        const realmAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    dataSize: 290  // Standard size for Realm accounts
                }
            ]
        });

        console.log(`Found ${realmAccounts.length} total Realm accounts`);
        console.log('');

        // Search through each realm to find IslandDAO
        for (let i = 0; i < realmAccounts.length; i++) {
            const realm = realmAccounts[i];
            const data = realm.account.data;
            
            console.log(`Realm ${i + 1}/${realmAccounts.length}: ${realm.pubkey.toString()}`);
            
            try {
                // Parse realm structure
                const accountType = data.readUInt8(0);
                
                if (accountType === 1) { // Realm account type
                    const authority = new PublicKey(data.subarray(1, 33));
                    const communityMint = new PublicKey(data.subarray(33, 65));
                    
                    console.log(`  Authority: ${authority.toString()}`);
                    console.log(`  Community Mint: ${communityMint.toString()}`);
                    
                    // Check if this uses ISLAND token
                    if (communityMint.equals(ISLAND_TOKEN_MINT)) {
                        console.log(`  🎯 FOUND ISLAND DAO REALM!`);
                        console.log(`  realmId: "${realm.pubkey.toString()}"`);
                        console.log(`  communityMint: "${communityMint.toString()}"`);
                        console.log(`  programId: "${GOVERNANCE_PROGRAM_ID.toString()}"`);
                        
                        // Try to extract realm name
                        if (data.length > 97) {
                            try {
                                const nameLength = data.readUInt32LE(97);
                                if (nameLength > 0 && nameLength < 100) {
                                    const nameBytes = data.subarray(97 + 4, 97 + 4 + nameLength);
                                    const realmName = nameBytes.toString('utf8');
                                    console.log(`  displayName: "${realmName}"`);
                                }
                            } catch (error) {
                                console.log(`  displayName: "IslandDAO" (extracted from context)`);
                            }
                        }
                        
                        // Generate the complete config like MetaplexDAO
                        const islandDAOConfig = {
                            symbol: "IslandDAO",
                            displayName: "Island DAO", 
                            programId: GOVERNANCE_PROGRAM_ID.toString(),
                            realmId: realm.pubkey.toString(),
                            communityMint: communityMint.toString(),
                            website: "https://app.realms.today/dao/IslandDAO"
                        };
                        
                        console.log('\n🎯 IslandDAO Configuration:');
                        console.log(JSON.stringify(islandDAOConfig, null, 2));
                        
                        // Now search for Token Owner Records in this realm
                        console.log('\n🔍 Searching for Token Owner Records...');
                        
                        const tokenOwnerRecords = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
                            filters: [
                                {
                                    memcmp: {
                                        offset: 1,  // Skip account type
                                        bytes: realm.pubkey.toBase58()
                                    }
                                }
                            ]
                        });
                        
                        console.log(`Found ${tokenOwnerRecords.length} Token Owner Records`);
                        
                        // Search for our target wallet
                        const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
                        const targetWalletPubkey = new PublicKey(targetWallet);
                        const targetWalletBuffer = targetWalletPubkey.toBuffer();
                        
                        console.log(`\n🎯 Searching for target wallet: ${targetWallet}`);
                        
                        for (const record of tokenOwnerRecords) {
                            const recordData = record.account.data;
                            
                            // Check if this record contains our target wallet
                            for (let j = 0; j <= recordData.length - 32; j++) {
                                if (recordData.subarray(j, j + 32).equals(targetWalletBuffer)) {
                                    console.log(`\n💰 FOUND TARGET WALLET RECORD: ${record.pubkey.toString()}`);
                                    console.log(`  Wallet found at offset: ${j}`);
                                    console.log(`  Record data length: ${recordData.length} bytes`);
                                    
                                    // Search for deposit amounts
                                    console.log(`  Searching for deposit amounts:`);
                                    
                                    const possibleOffsets = [73, 81, 89, 97, 105, 113, 121];
                                    
                                    for (const offset of possibleOffsets) {
                                        if (recordData.length >= offset + 8) {
                                            try {
                                                const amount = recordData.readBigUInt64LE(offset);
                                                const tokenAmount = Number(amount) / Math.pow(10, 6);
                                                
                                                if (tokenAmount > 0 && tokenAmount < 10000000) {
                                                    console.log(`    Offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                                                    
                                                    // Check if this matches the expected 625.58
                                                    if (Math.abs(tokenAmount - 625.58) < 0.1) {
                                                        console.log(`      🎯 MATCHES EXPECTED DEPOSIT!`);
                                                        
                                                        return {
                                                            config: islandDAOConfig,
                                                            depositRecord: {
                                                                account: record.pubkey.toString(),
                                                                walletOffset: j,
                                                                depositOffset: offset,
                                                                amount: tokenAmount
                                                            }
                                                        };
                                                    }
                                                }
                                            } catch (error) {
                                                // Continue searching
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                        
                        return { config: islandDAOConfig };
                    }
                }
            } catch (error) {
                console.log(`  Error parsing realm: ${error.message}`);
            }
            
            console.log('');
        }

        console.log('❌ IslandDAO realm not found');
        return null;

    } catch (error) {
        console.error('❌ Error searching for IslandDAO config:', error.message);
        return null;
    }
}

// Run the search
findIslandDAOConfig().then((result) => {
    if (result) {
        console.log('\n✅ Successfully found IslandDAO configuration!');
        if (result.depositRecord) {
            console.log('✅ Also found the target wallet deposit record!');
        }
    } else {
        console.log('\n❌ Could not find IslandDAO configuration');
    }
    process.exit(0);
});
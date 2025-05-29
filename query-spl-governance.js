/**
 * Query SPL Governance to find DAOs using ISLAND token
 * Token address: Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

async function findIslandDAOInGovernance() {
    try {
        console.log(`🔍 Querying SPL Governance for DAOs using ISLAND token`);
        console.log(`ISLAND Token: ${ISLAND_TOKEN_MINT.toString()}`);
        console.log(`SPL Governance Program: ${GOVERNANCE_PROGRAM_ID.toString()}`);
        console.log('');

        // Search for Realm accounts that use the ISLAND token as community mint
        console.log('📊 Searching for Realms using ISLAND token as community mint...');
        
        const realmAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    dataSize: 290  // Typical size for Realm accounts
                },
                {
                    memcmp: {
                        offset: 1 + 32,  // Skip account type (1 byte) + authority (32 bytes) 
                        bytes: ISLAND_TOKEN_MINT.toBase58()
                    }
                }
            ]
        });

        console.log(`Found ${realmAccounts.length} Realm(s) using ISLAND token`);
        console.log('');

        for (let i = 0; i < realmAccounts.length; i++) {
            const realm = realmAccounts[i];
            console.log(`Realm ${i + 1}: ${realm.pubkey.toString()}`);
            console.log(`  Data length: ${realm.account.data.length} bytes`);
            
            // Parse realm data to extract information
            const data = realm.account.data;
            
            try {
                // Realm structure:
                // 0: account_type (1 byte)
                // 1-32: authority (32 bytes) 
                // 33-64: community_mint (32 bytes)
                // 65-96: council_mint (32 bytes, optional)
                // 97+: name and other data
                
                const accountType = data.readUInt8(0);
                console.log(`  Account type: ${accountType}`);
                
                // Read authority
                const authority = new PublicKey(data.subarray(1, 33));
                console.log(`  Authority: ${authority.toString()}`);
                
                // Verify community mint
                const communityMint = new PublicKey(data.subarray(33, 65));
                console.log(`  Community mint: ${communityMint.toString()}`);
                console.log(`  ✅ Matches ISLAND token: ${communityMint.equals(ISLAND_TOKEN_MINT)}`);
                
                // Check for council mint
                const councilMintBytes = data.subarray(65, 97);
                const hasCouncilMint = !councilMintBytes.every(byte => byte === 0);
                
                if (hasCouncilMint) {
                    const councilMint = new PublicKey(councilMintBytes);
                    console.log(`  Council mint: ${councilMint.toString()}`);
                } else {
                    console.log(`  Council mint: None`);
                }
                
                // Try to extract realm name if available
                if (data.length > 97) {
                    try {
                        // Name is usually stored after the mints with a length prefix
                        const nameLength = data.readUInt32LE(97);
                        if (nameLength > 0 && nameLength < 100 && data.length >= 97 + 4 + nameLength) {
                            const nameBytes = data.subarray(97 + 4, 97 + 4 + nameLength);
                            const realmName = nameBytes.toString('utf8');
                            console.log(`  Name: "${realmName}"`);
                        }
                    } catch (error) {
                        console.log(`  Name: Could not parse`);
                    }
                }
                
                // Now find Token Owner Records for this realm
                console.log(`  🔍 Searching for Token Owner Records in this realm...`);
                
                const tokenOwnerRecords = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
                    filters: [
                        {
                            dataSize: 280  // Common size for Token Owner Records
                        },
                        {
                            memcmp: {
                                offset: 1,  // Skip account type
                                bytes: realm.pubkey.toBase58()
                            }
                        }
                    ]
                });
                
                console.log(`  Found ${tokenOwnerRecords.length} Token Owner Records`);
                
                // Sample a few records to show governance activity
                if (tokenOwnerRecords.length > 0) {
                    console.log(`  📋 Sample Token Owner Records:`);
                    
                    for (let j = 0; j < Math.min(5, tokenOwnerRecords.length); j++) {
                        const record = tokenOwnerRecords[j];
                        console.log(`    ${j + 1}. ${record.pubkey.toString()}`);
                        
                        // Try to extract deposit amount
                        const recordData = record.account.data;
                        
                        // Common offsets for governance token deposit amount
                        const possibleOffsets = [73, 81, 89, 97, 105];
                        
                        for (const offset of possibleOffsets) {
                            if (recordData.length >= offset + 8) {
                                try {
                                    const amount = recordData.readBigUInt64LE(offset);
                                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                                    
                                    if (tokenAmount > 0 && tokenAmount < 10000000) {
                                        console.log(`       Offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                                    }
                                } catch (error) {
                                    // Continue
                                }
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.log(`  ❌ Error parsing realm data: ${error.message}`);
            }
            
            console.log('');
        }

        return realmAccounts;

    } catch (error) {
        console.error('❌ Error querying SPL Governance:', error.message);
        return [];
    }
}

// Run the query
findIslandDAOInGovernance().then((realms) => {
    if (realms.length > 0) {
        console.log(`✅ Successfully found ${realms.length} realm(s) using ISLAND token`);
        console.log('Realm addresses:');
        realms.forEach((realm, i) => {
            console.log(`  ${i + 1}. ${realm.pubkey.toString()}`);
        });
    } else {
        console.log('❌ No realms found using ISLAND token');
    }
    process.exit(0);
});
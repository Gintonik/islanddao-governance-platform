/**
 * Search multiple SPL Governance program versions for IslandDAO
 * There are several versions of the governance program deployed
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

// Known SPL Governance program versions
const GOVERNANCE_PROGRAMS = [
    'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw', // Current version
    'GovHgfDPyQ1GwazJTDY2avSVY8GGcpmCapmmCsymRaGe', // Previous version
    'GovMaiHfeYXqbMeCiQrcZVF6F2LzrECNCAzL6KqLVTaV', // Another version
    'Gov1BBjXj5bRLvdCgRBfF2XvRCFkmJjYKvKMWF8oTrJo', // Legacy version
    'GovNrpFJt1QxrY3P1JEjJTQ2BoBr9BnyNJbXkQaKFYXi'  // Experimental
];

async function searchAllGovernancePrograms() {
    try {
        console.log('🔍 Searching multiple SPL Governance program versions for IslandDAO');
        console.log(`Target token: ${ISLAND_TOKEN_MINT.toString()}`);
        console.log('');

        for (let i = 0; i < GOVERNANCE_PROGRAMS.length; i++) {
            const programId = new PublicKey(GOVERNANCE_PROGRAMS[i]);
            console.log(`📊 Checking Governance Program ${i + 1}/${GOVERNANCE_PROGRAMS.length}: ${programId.toString()}`);

            try {
                // Get all accounts for this governance program
                const allAccounts = await connection.getProgramAccounts(programId);
                console.log(`  Found ${allAccounts.length} total accounts`);

                if (allAccounts.length === 0) {
                    console.log('  ⚠️ No accounts found for this program');
                    continue;
                }

                // Filter for Realm accounts (account type 1)
                const realmAccounts = allAccounts.filter(account => {
                    try {
                        return account.account.data.readUInt8(0) === 1;
                    } catch {
                        return false;
                    }
                });

                console.log(`  Found ${realmAccounts.length} Realm accounts`);

                // Search through realm accounts for ISLAND token
                for (const realm of realmAccounts) {
                    try {
                        const data = realm.account.data;
                        const authority = new PublicKey(data.subarray(1, 33));
                        const communityMint = new PublicKey(data.subarray(33, 65));

                        if (communityMint.equals(ISLAND_TOKEN_MINT)) {
                            console.log(`\n  🎯 FOUND ISLAND DAO REALM!`);
                            console.log(`    Program: ${programId.toString()}`);
                            console.log(`    Realm: ${realm.pubkey.toString()}`);
                            console.log(`    Authority: ${authority.toString()}`);
                            console.log(`    Community Mint: ${communityMint.toString()}`);

                            // Extract realm name if available
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

                            console.log(`    Name: ${realmName}`);

                            // Generate complete IslandDAO configuration
                            const islandDAOConfig = {
                                symbol: "ISLAND",
                                displayName: realmName,
                                programId: programId.toString(),
                                realmId: realm.pubkey.toString(),
                                communityMint: communityMint.toString(),
                                authority: authority.toString(),
                                website: "https://app.realms.today/dao/IslandDAO"
                            };

                            console.log('\n🎯 IslandDAO Configuration:');
                            console.log(JSON.stringify(islandDAOConfig, null, 2));

                            // Now search for Token Owner Records
                            console.log('\n🔍 Searching for Token Owner Records...');
                            
                            const tokenOwnerRecords = allAccounts.filter(account => {
                                try {
                                    const accountType = account.account.data.readUInt8(0);
                                    if (accountType === 2) { // Token Owner Record type
                                        // Check if it references our realm
                                        const realmInRecord = new PublicKey(account.account.data.subarray(1, 33));
                                        return realmInRecord.equals(realm.pubkey);
                                    }
                                    return false;
                                } catch {
                                    return false;
                                }
                            });

                            console.log(`Found ${tokenOwnerRecords.length} Token Owner Records for this realm`);

                            // Search for our target wallet
                            const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
                            const targetWalletPubkey = new PublicKey(targetWallet);
                            
                            console.log(`\n🎯 Searching for target wallet: ${targetWallet}`);

                            for (const record of tokenOwnerRecords) {
                                const recordData = record.account.data;
                                
                                try {
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
                    } catch (error) {
                        // Continue searching
                    }
                }

            } catch (error) {
                console.log(`  ❌ Error querying program: ${error.message}`);
            }

            console.log('');
        }

        console.log('❌ IslandDAO not found in any governance program versions');
        return null;

    } catch (error) {
        console.error('❌ Error searching governance programs:', error.message);
        return null;
    }
}

// Run the search
searchAllGovernancePrograms().then((result) => {
    if (result) {
        console.log('\n✅ Successfully found IslandDAO!');
        if (result.targetWalletRecord) {
            console.log('✅ Also found the target wallet with correct deposit amount!');
        }
    } else {
        console.log('\n❌ Could not find IslandDAO in any governance program version');
    }
    process.exit(0);
});
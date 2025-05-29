/**
 * Find the correct VSR plugin program used by IslandDAO
 * Search for different VSR plugin versions and configurations
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

// Known VSR plugin program IDs
const VSR_PROGRAMS = [
    'VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7', // Standard VSR
    'VoteWPk9yyGmkX4KUJpjdpreE6FkCDDPzLu3QERBkmvk', // Alternative VSR
    'VoteMagic2HZRNTs55t5G4fYzf8F9K7TJwNzrPXEJxA', // Custom VSR
];

async function findCorrectVSRPlugin() {
    try {
        console.log('🔍 Finding the correct VSR plugin program for IslandDAO');
        console.log(`Realm: ${ISLAND_DAO_REALM}`);
        console.log(`Target wallet: ${TARGET_WALLET}`);
        console.log('');

        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const targetWalletPubkey = new PublicKey(TARGET_WALLET);

        // Test each VSR program
        for (const programId of VSR_PROGRAMS) {
            console.log(`📊 Testing VSR program: ${programId}`);
            
            try {
                const vsrProgramPubkey = new PublicKey(programId);
                
                // Try different PDA derivation patterns
                const pdaPatterns = [
                    ['voter', realmPubkey.toBuffer(), targetWalletPubkey.toBuffer()],
                    ['voter-record', realmPubkey.toBuffer(), targetWalletPubkey.toBuffer()],
                    ['voter', targetWalletPubkey.toBuffer(), realmPubkey.toBuffer()],
                    ['deposit', realmPubkey.toBuffer(), targetWalletPubkey.toBuffer()],
                ];
                
                for (let i = 0; i < pdaPatterns.length; i++) {
                    const pattern = pdaPatterns[i];
                    
                    try {
                        const [pda] = PublicKey.findProgramAddressSync(pattern, vsrProgramPubkey);
                        console.log(`  Pattern ${i + 1}: ${pda.toString()}`);
                        
                        const account = await connection.getAccountInfo(pda);
                        
                        if (account) {
                            console.log(`  ✅ Found account! Data length: ${account.data.length} bytes`);
                            console.log(`  Owner: ${account.owner.toString()}`);
                            
                            // Check if the owner matches the VSR program
                            if (account.owner.equals(vsrProgramPubkey)) {
                                console.log(`  🎯 FOUND MATCHING VSR ACCOUNT!`);
                                
                                return {
                                    programId,
                                    pda: pda.toString(),
                                    pattern: pattern.map(p => p instanceof Buffer ? p.toString() : p),
                                    accountData: account.data
                                };
                            }
                        } else {
                            console.log(`  ❌ No account found`);
                        }
                    } catch (error) {
                        console.log(`  ❌ PDA derivation failed: ${error.message}`);
                    }
                }
                
            } catch (error) {
                console.log(`  ❌ Error testing program: ${error.message}`);
            }
            
            console.log('');
        }

        // If no VSR accounts found, search for any accounts owned by VSR programs
        console.log('🔍 Searching for any accounts owned by VSR programs...');
        
        for (const programId of VSR_PROGRAMS) {
            console.log(`📊 Searching accounts owned by ${programId}`);
            
            try {
                const vsrProgramPubkey = new PublicKey(programId);
                
                // Search for accounts that contain our wallet address
                const accounts = await connection.getProgramAccounts(vsrProgramPubkey, {
                    filters: [
                        {
                            memcmp: {
                                offset: 0,
                                bytes: targetWalletPubkey.toBase58()
                            }
                        }
                    ]
                });
                
                console.log(`  Found ${accounts.length} accounts containing wallet address`);
                
                if (accounts.length > 0) {
                    for (const account of accounts) {
                        console.log(`  Account: ${account.pubkey.toString()}`);
                        console.log(`  Data length: ${account.account.data.length} bytes`);
                        
                        return {
                            programId,
                            pda: account.pubkey.toString(),
                            pattern: 'search result',
                            accountData: account.account.data
                        };
                    }
                }
                
                // Try searching at different offsets
                const offsets = [8, 32, 40, 64, 72];
                
                for (const offset of offsets) {
                    try {
                        const accountsAtOffset = await connection.getProgramAccounts(vsrProgramPubkey, {
                            filters: [
                                {
                                    memcmp: {
                                        offset,
                                        bytes: targetWalletPubkey.toBase58()
                                    }
                                }
                            ]
                        });
                        
                        if (accountsAtOffset.length > 0) {
                            console.log(`  Found ${accountsAtOffset.length} accounts at offset ${offset}`);
                            
                            for (const account of accountsAtOffset) {
                                console.log(`    Account: ${account.pubkey.toString()}`);
                                console.log(`    Data length: ${account.account.data.length} bytes`);
                                
                                return {
                                    programId,
                                    pda: account.pubkey.toString(),
                                    pattern: `offset ${offset}`,
                                    accountData: account.account.data
                                };
                            }
                        }
                    } catch (error) {
                        // Continue searching
                    }
                }
                
            } catch (error) {
                console.log(`  ❌ Error searching program accounts: ${error.message}`);
            }
        }

        console.log('❌ No VSR accounts found for the target wallet');
        return null;

    } catch (error) {
        console.error('❌ Error finding VSR plugin:', error.message);
        return null;
    }
}

// Run the search
findCorrectVSRPlugin().then((result) => {
    if (result) {
        console.log('\n✅ Found VSR account!');
        console.log(`Program: ${result.programId}`);
        console.log(`Account: ${result.pda}`);
        console.log(`Pattern: ${result.pattern}`);
        console.log(`Data length: ${result.accountData.length} bytes`);
    } else {
        console.log('\n❌ Could not find VSR account for the target wallet');
        console.log('IslandDAO might be using a different governance mechanism');
    }
    process.exit(0);
});
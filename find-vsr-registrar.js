/**
 * Find the correct VSR registrar for IslandDAO
 * Search VSR program accounts to find the registrar that manages ISLAND governance
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

async function findVSRRegistrar() {
    try {
        console.log('Searching for VSR registrar accounts...');
        
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // Get all VSR program accounts
        const vsrAccounts = await connection.getProgramAccounts(vsrProgramPubkey, {
            commitment: 'confirmed'
        });
        
        console.log(`Found ${vsrAccounts.length} VSR program accounts`);
        
        const registrars = [];
        
        for (const account of vsrAccounts) {
            try {
                const data = account.account.data;
                
                // Look for accounts that reference our realm or token mint
                for (let offset = 0; offset <= data.length - 32; offset++) {
                    const pubkeyBytes = data.subarray(offset, offset + 32);
                    
                    try {
                        const pubkey = new PublicKey(pubkeyBytes);
                        
                        // Check if this references our realm or mint
                        if (pubkey.equals(realmPubkey) || pubkey.equals(mintPubkey)) {
                            registrars.push({
                                account: account.pubkey.toString(),
                                referencesRealm: pubkey.equals(realmPubkey),
                                referencesMint: pubkey.equals(mintPubkey),
                                dataLength: data.length,
                                offset: offset
                            });
                            break;
                        }
                    } catch (error) {
                        // Continue
                    }
                }
            } catch (error) {
                // Continue
            }
        }
        
        console.log(`Found ${registrars.length} potential registrar accounts:`);
        
        for (const registrar of registrars) {
            console.log(`  ${registrar.account}`);
            console.log(`    References realm: ${registrar.referencesRealm}`);
            console.log(`    References mint: ${registrar.referencesMint}`);
            console.log(`    Data length: ${registrar.dataLength} bytes`);
            console.log('');
        }
        
        // Test each potential registrar with our known wallet
        const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        
        for (const registrar of registrars) {
            console.log(`Testing registrar ${registrar.account} with known wallet...`);
            
            try {
                const walletPubkey = new PublicKey(knownWallet);
                const registrarPubkey = new PublicKey(registrar.account);
                
                const [voterPDA] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("voter"),
                        registrarPubkey.toBuffer(),
                        walletPubkey.toBuffer()
                    ],
                    vsrProgramPubkey
                );
                
                const voterAccount = await connection.getAccountInfo(voterPDA);
                if (voterAccount && voterAccount.data) {
                    console.log(`  ✅ Found voter account: ${voterPDA.toString()}`);
                    console.log(`  Data length: ${voterAccount.data.length} bytes`);
                    
                    // Try to parse governance power
                    const offsets = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96];
                    
                    for (const offset of offsets) {
                        if (voterAccount.data.length >= offset + 8) {
                            try {
                                const lamports = voterAccount.data.readBigUInt64LE(offset);
                                const tokenAmount = Number(lamports) / Math.pow(10, 6);
                                
                                if (tokenAmount > 1 && tokenAmount < 100000000) {
                                    console.log(`    Potential power at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                                    
                                    if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                        console.log(`    🎯 MATCHES EXPECTED AMOUNT!`);
                                        console.log(`    Correct registrar: ${registrar.account}`);
                                        console.log(`    Correct offset: ${offset}`);
                                        return {
                                            registrar: registrar.account,
                                            voterPDA: voterPDA.toString(),
                                            powerOffset: offset,
                                            expectedPower: tokenAmount
                                        };
                                    }
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    }
                } else {
                    console.log(`  ❌ No voter account found`);
                }
            } catch (error) {
                console.log(`  Error testing registrar: ${error.message}`);
            }
            
            console.log('');
        }
        
        return null;
        
    } catch (error) {
        console.error('Error finding VSR registrar:', error.message);
        return null;
    }
}

if (require.main === module) {
    findVSRRegistrar()
        .then((result) => {
            if (result) {
                console.log('SUCCESS! Found correct VSR configuration:');
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log('Could not find matching VSR registrar configuration');
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('Search failed:', error.message);
            process.exit(1);
        });
}

module.exports = { findVSRRegistrar };
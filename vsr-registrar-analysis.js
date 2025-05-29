/**
 * VSR Registrar Analysis for IslandDAO
 * Find the correct registrar by analyzing VSR program account structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

async function findIslandDAORegistrar() {
    try {
        console.log('Finding IslandDAO VSR registrar...');
        
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // The VSR registrar PDA is typically derived from: ["registrar", realm, community_mint]
        const [registrarPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("registrar"),
                realmPubkey.toBuffer(),
                mintPubkey.toBuffer()
            ],
            vsrProgramPubkey
        );
        
        console.log(`Expected registrar PDA: ${registrarPDA.toString()}`);
        
        // Check if this registrar exists
        const registrarAccount = await connection.getAccountInfo(registrarPDA);
        
        if (registrarAccount) {
            console.log(`✅ Found registrar account!`);
            console.log(`Data length: ${registrarAccount.data.length} bytes`);
            console.log(`Owner: ${registrarAccount.owner.toString()}`);
            
            // Now test with our known wallet
            const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
            const walletPubkey = new PublicKey(knownWallet);
            
            // Derive voter PDA using this registrar
            const [voterPDA] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("voter"),
                    registrarPDA.toBuffer(),
                    walletPubkey.toBuffer()
                ],
                vsrProgramPubkey
            );
            
            console.log(`\nTesting voter PDA: ${voterPDA.toString()}`);
            
            const voterAccount = await connection.getAccountInfo(voterPDA);
            
            if (voterAccount) {
                console.log(`✅ Found voter account!`);
                console.log(`Data length: ${voterAccount.data.length} bytes`);
                
                // Parse VSR voter account for governance power
                // VSR voter accounts typically have deposits at specific offsets
                console.log('\nAnalyzing voter account data...');
                
                for (let offset = 0; offset < voterAccount.data.length - 8; offset += 8) {
                    try {
                        const value = voterAccount.data.readBigUInt64LE(offset);
                        const tokenAmount = Number(value) / Math.pow(10, 6);
                        
                        // Look for amounts in the expected range for ISLAND governance
                        if (tokenAmount > 1000 && tokenAmount < 50000) {
                            console.log(`Offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                            
                            // Check if this matches our expected amount
                            if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                console.log(`🎯 FOUND MATCHING AMOUNT! ${tokenAmount} ISLAND at offset ${offset}`);
                                
                                return {
                                    registrar: registrarPDA.toString(),
                                    voter: voterPDA.toString(),
                                    powerOffset: offset,
                                    amount: tokenAmount
                                };
                            }
                        }
                    } catch (error) {
                        // Continue checking other offsets
                    }
                }
                
                // If no exact match, show all reasonable amounts
                console.log('\nAll potential governance amounts found:');
                for (let offset = 0; offset < voterAccount.data.length - 8; offset += 8) {
                    try {
                        const value = voterAccount.data.readBigUInt64LE(offset);
                        const tokenAmount = Number(value) / Math.pow(10, 6);
                        
                        if (tokenAmount > 0.1 && tokenAmount < 1000000) {
                            console.log(`  Offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                        }
                    } catch (error) {
                        // Continue
                    }
                }
                
                return {
                    registrar: registrarPDA.toString(),
                    voter: voterPDA.toString(),
                    powerOffset: null,
                    amount: 0
                };
                
            } else {
                console.log(`❌ No voter account found for wallet ${knownWallet}`);
            }
            
        } else {
            console.log(`❌ Registrar account not found at expected PDA`);
            
            // Alternative: Search for registrar by looking at VSR accounts
            console.log('\nSearching VSR accounts for IslandDAO references...');
            
            const vsrAccounts = await connection.getProgramAccounts(vsrProgramPubkey, {
                filters: [
                    {
                        dataSize: { min: 100, max: 500 } // Registrars are typically this size
                    }
                ]
            });
            
            console.log(`Found ${vsrAccounts.length} VSR accounts to check`);
            
            for (const account of vsrAccounts.slice(0, 10)) { // Check first 10
                const data = account.account.data;
                
                // Look for realm reference in the data
                for (let i = 0; i <= data.length - 32; i++) {
                    try {
                        const pubkey = new PublicKey(data.subarray(i, i + 32));
                        if (pubkey.equals(realmPubkey)) {
                            console.log(`Found realm reference in account: ${account.pubkey.toString()}`);
                            
                            // Test this as a potential registrar
                            const [testVoterPDA] = PublicKey.findProgramAddressSync(
                                [
                                    Buffer.from("voter"),
                                    account.pubkey.toBuffer(),
                                    new PublicKey(knownWallet).toBuffer()
                                ],
                                vsrProgramPubkey
                            );
                            
                            const testVoterAccount = await connection.getAccountInfo(testVoterPDA);
                            if (testVoterAccount) {
                                console.log(`  ✅ This registrar has voter accounts!`);
                                return {
                                    registrar: account.pubkey.toString(),
                                    voter: testVoterPDA.toString(),
                                    powerOffset: null,
                                    amount: 0
                                };
                            }
                        }
                    } catch (error) {
                        // Continue
                    }
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error finding registrar:', error.message);
        return null;
    }
}

if (require.main === module) {
    findIslandDAORegistrar()
        .then((result) => {
            if (result) {
                console.log('\n✅ SUCCESS! Found VSR configuration:');
                console.log(`Registrar: ${result.registrar}`);
                console.log(`Voter account: ${result.voter}`);
                if (result.powerOffset !== null) {
                    console.log(`Power offset: ${result.powerOffset}`);
                    console.log(`Amount: ${result.amount.toLocaleString()} ISLAND`);
                }
            } else {
                console.log('\n❌ Could not find VSR registrar configuration');
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = { findIslandDAORegistrar };
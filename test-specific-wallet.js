/**
 * Test specific wallet governance power using known transaction patterns
 * Based on the transaction showing 12,625.580931 ISLAND governance deposit
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';

async function testSpecificWalletGovernance() {
    const walletAddress = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    console.log(`Testing governance power for wallet: ${walletAddress}`);
    
    try {
        // Try different VSR registrar derivations
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        const walletPubkey = new PublicKey(walletAddress);
        
        // Option 1: Using realm as registrar
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const [voterPDA1] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("voter"),
                realmPubkey.toBuffer(),
                walletPubkey.toBuffer()
            ],
            vsrProgramPubkey
        );
        
        console.log(`Checking voter PDA (realm as registrar): ${voterPDA1.toString()}`);
        const voterAccount1 = await connection.getAccountInfo(voterPDA1);
        
        if (voterAccount1) {
            console.log(`Found account! Data length: ${voterAccount1.data.length} bytes`);
            console.log(`Owner: ${voterAccount1.owner.toString()}`);
            
            // Parse for governance power
            if (voterAccount1.data.length >= 8) {
                for (let offset = 0; offset < voterAccount1.data.length - 8; offset += 8) {
                    try {
                        const value = voterAccount1.data.readBigUInt64LE(offset);
                        const tokenAmount = Number(value) / Math.pow(10, 6);
                        
                        if (tokenAmount > 10000 && tokenAmount < 20000) {
                            console.log(`Potential governance power at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                            
                            if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                console.log(`🎯 FOUND EXACT MATCH! ${tokenAmount} ISLAND`);
                                return { amount: tokenAmount, offset, account: voterPDA1.toString() };
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        } else {
            console.log('No voter account found with realm as registrar');
        }
        
        // Option 2: Try to find actual registrar by checking program accounts
        console.log('\nSearching for actual VSR registrar...');
        
        // Get VSR accounts that might be registrars (smaller data size, likely configuration accounts)
        const vsrAccounts = await connection.getProgramAccounts(vsrProgramPubkey, {
            filters: [
                {
                    dataSize: 200 // Registrars are typically around this size
                }
            ]
        });
        
        console.log(`Found ${vsrAccounts.length} potential registrar accounts`);
        
        for (const account of vsrAccounts.slice(0, 5)) { // Test first 5 to avoid timeout
            try {
                console.log(`Testing registrar: ${account.pubkey.toString()}`);
                
                const [voterPDA] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("voter"),
                        account.pubkey.toBuffer(),
                        walletPubkey.toBuffer()
                    ],
                    vsrProgramPubkey
                );
                
                const voterAccount = await connection.getAccountInfo(voterPDA);
                
                if (voterAccount && voterAccount.data.length > 0) {
                    console.log(`  Found voter account: ${voterPDA.toString()}`);
                    console.log(`  Data length: ${voterAccount.data.length} bytes`);
                    
                    // Check for governance power
                    for (let offset = 0; offset < voterAccount.data.length - 8; offset += 8) {
                        try {
                            const value = voterAccount.data.readBigUInt64LE(offset);
                            const tokenAmount = Number(value) / Math.pow(10, 6);
                            
                            if (tokenAmount > 10000 && tokenAmount < 20000) {
                                console.log(`  Potential power at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                                
                                if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                    console.log(`  🎯 FOUND EXACT MATCH! ${tokenAmount} ISLAND`);
                                    return { 
                                        amount: tokenAmount, 
                                        offset, 
                                        account: voterPDA.toString(),
                                        registrar: account.pubkey.toString()
                                    };
                                }
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                console.log(`  Error testing registrar: ${error.message}`);
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error testing wallet governance:', error.message);
        return null;
    }
}

if (require.main === module) {
    testSpecificWalletGovernance()
        .then((result) => {
            if (result) {
                console.log('\n✅ SUCCESS! Found governance power configuration:');
                console.log(`Amount: ${result.amount.toLocaleString()} ISLAND`);
                console.log(`Account: ${result.account}`);
                if (result.registrar) {
                    console.log(`Registrar: ${result.registrar}`);
                }
                console.log(`Data offset: ${result.offset}`);
            } else {
                console.log('\n❌ Could not find governance power for this wallet');
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('Test failed:', error.message);
            process.exit(1);
        });
}

module.exports = { testSpecificWalletGovernance };
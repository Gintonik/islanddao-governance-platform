/**
 * Find Realms Deposits by searching for the specific amount
 * Target: 625.58 $ISLAND deposited by 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_DECIMALS = 6;

// Target wallet and amount from Realms interface
const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
const TARGET_AMOUNT = 625.58;

async function findRealmsDeposits() {
    try {
        console.log(`🎯 Searching for exact deposit amount: ${TARGET_AMOUNT} $ISLAND`);
        console.log(`Target wallet: ${TARGET_WALLET}`);
        console.log('');

        // Convert target amount to lamports for exact matching
        const targetLamports = BigInt(Math.round(TARGET_AMOUNT * Math.pow(10, ISLAND_TOKEN_DECIMALS)));
        console.log(`Target in lamports: ${targetLamports.toString()}`);
        console.log('');

        // Search with different possible realm configurations
        const possibleRealms = [
            'H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz', // Current
            'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a', // ISLAND token mint
            'IslandDAO', // Might be a different format
        ];

        for (const realmId of possibleRealms) {
            console.log(`🔍 Trying realm: ${realmId}`);
            
            try {
                const realmPubkey = new PublicKey(realmId);
                
                // Search for accounts that reference this realm
                const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
                    filters: [
                        {
                            memcmp: {
                                offset: 1,
                                bytes: realmPubkey.toBase58()
                            }
                        }
                    ]
                });
                
                console.log(`  Found ${accounts.length} accounts for this realm`);
                
                // Search through accounts for our target amount
                for (const account of accounts) {
                    const data = account.account.data;
                    
                    // Search for the exact target amount
                    for (let offset = 0; offset <= data.length - 8; offset += 8) {
                        try {
                            const amount = data.readBigUInt64LE(offset);
                            
                            // Check if this matches our target (within small tolerance)
                            if (amount === targetLamports || 
                                Math.abs(Number(amount) - Number(targetLamports)) <= 1000) {
                                
                                const tokenAmount = Number(amount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                                console.log(`  🎯 FOUND MATCH!`);
                                console.log(`    Account: ${account.pubkey.toString()}`);
                                console.log(`    Offset: ${offset}`);
                                console.log(`    Amount: ${tokenAmount} $ISLAND`);
                                console.log(`    Raw: ${amount.toString()}`);
                                
                                // Check if this account also contains the wallet address
                                const walletPubkey = new PublicKey(TARGET_WALLET);
                                const walletBuffer = walletPubkey.toBuffer();
                                
                                for (let j = 0; j <= data.length - 32; j++) {
                                    if (data.subarray(j, j + 32).equals(walletBuffer)) {
                                        console.log(`    ✅ CONFIRMED: Contains target wallet at offset ${j}`);
                                        console.log(`    📍 This is the governance deposit account!`);
                                        
                                        return {
                                            realm: realmId,
                                            account: account.pubkey.toString(),
                                            depositOffset: offset,
                                            walletOffset: j,
                                            amount: tokenAmount,
                                            dataLength: data.length
                                        };
                                    }
                                }
                            }
                        } catch (error) {
                            // Continue searching
                        }
                    }
                }
                
            } catch (error) {
                console.log(`  ❌ Invalid realm ID: ${realmId}`);
            }
            
            console.log('');
        }

        // Alternative approach: Search without realm filter
        console.log('🔍 Alternative approach: Searching all governance accounts for target amount...');
        
        // Get a limited number of accounts to avoid timeout
        const allAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    dataSize: 280 // Common size for Token Owner Records
                }
            ]
        });
        
        console.log(`Found ${allAccounts.length} accounts with size 280`);
        
        for (let i = 0; i < Math.min(allAccounts.length, 100); i++) {
            const account = allAccounts[i];
            const data = account.account.data;
            
            // Search for exact amount
            for (let offset = 0; offset <= data.length - 8; offset += 8) {
                try {
                    const amount = data.readBigUInt64LE(offset);
                    
                    if (amount === targetLamports) {
                        const tokenAmount = Number(amount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                        console.log(`🎯 Found exact amount in account: ${account.pubkey.toString()}`);
                        console.log(`  Amount: ${tokenAmount} $ISLAND at offset ${offset}`);
                        
                        // Check for wallet
                        const walletPubkey = new PublicKey(TARGET_WALLET);
                        const walletBuffer = walletPubkey.toBuffer();
                        
                        for (let j = 0; j <= data.length - 32; j++) {
                            if (data.subarray(j, j + 32).equals(walletBuffer)) {
                                console.log(`  ✅ FOUND THE DEPOSIT ACCOUNT!`);
                                return {
                                    account: account.pubkey.toString(),
                                    depositOffset: offset,
                                    walletOffset: j,
                                    amount: tokenAmount,
                                    dataLength: data.length
                                };
                            }
                        }
                    }
                } catch (error) {
                    // Continue
                }
            }
        }

        console.log('❌ Could not locate the governance deposit account');
        return null;

    } catch (error) {
        console.error('❌ Error searching for deposits:', error.message);
        return null;
    }
}

// Run the search
findRealmsDeposits().then((result) => {
    if (result) {
        console.log('\n✅ SUCCESS! Found the governance deposit structure:');
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log('\n❌ Could not find the deposit structure');
    }
    process.exit(0);
});
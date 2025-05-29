/**
 * Search for all governance-related accounts specifically for IslandDAO
 * Look for any programs that might store the governance deposits
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a';
const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

async function searchIslandGovernanceAccounts() {
    try {
        console.log('🔍 Comprehensive search for IslandDAO governance accounts');
        console.log(`Realm: ${ISLAND_DAO_REALM}`);
        console.log(`Target wallet: ${TARGET_WALLET}`);
        console.log('Expected deposit: ~625.58 ISLAND');
        console.log('');

        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const targetWalletPubkey = new PublicKey(TARGET_WALLET);

        // Search for any accounts that reference our realm
        console.log('📊 Searching for accounts that reference the IslandDAO realm...');
        
        // Use Helius DAS API to search more comprehensively
        try {
            const response = await fetch('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'searchAssets',
                    params: {
                        ownerAddress: TARGET_WALLET,
                        tokenType: 'fungible',
                        displayOptions: {
                            showFungibleTokens: true
                        }
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`Found ${data.result?.items?.length || 0} assets for target wallet`);
                
                // Look for ISLAND token holdings
                const islandAssets = data.result?.items?.filter(item => 
                    item.id === ISLAND_TOKEN_MINT || 
                    item.content?.metadata?.symbol === 'ISLAND'
                );
                
                if (islandAssets && islandAssets.length > 0) {
                    console.log('💰 Found ISLAND token holdings:');
                    islandAssets.forEach(asset => {
                        console.log(`  Amount: ${asset.token_info?.balance || 'Unknown'}`);
                        console.log(`  Decimals: ${asset.token_info?.decimals || 'Unknown'}`);
                    });
                }
            }
        } catch (error) {
            console.log('Error using Helius DAS API:', error.message);
        }

        // Search for Token Owner Records using the main governance program
        console.log('\n📊 Searching for Token Owner Records in main governance...');
        
        const governanceProgramId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
        
        try {
            // Search for TOR accounts that reference our realm and wallet
            const torAccounts = await connection.getProgramAccounts(governanceProgramId, {
                filters: [
                    { dataSize: 105 }, // Standard TOR size
                    {
                        memcmp: {
                            offset: 1, // Realm reference
                            bytes: realmPubkey.toBase58()
                        }
                    }
                ]
            });

            console.log(`Found ${torAccounts.length} Token Owner Records for this realm`);

            for (const tor of torAccounts) {
                try {
                    const data = tor.account.data;
                    const governingTokenOwner = new PublicKey(data.subarray(65, 97));
                    
                    if (governingTokenOwner.equals(targetWalletPubkey)) {
                        console.log(`\n💰 FOUND TARGET WALLET TOR: ${tor.pubkey.toString()}`);
                        
                        // Read deposit amount
                        const depositAmount = data.readBigUInt64LE(97);
                        const tokenAmount = Number(depositAmount) / Math.pow(10, 6);
                        
                        console.log(`  Deposited amount: ${tokenAmount} ISLAND`);
                        
                        if (tokenAmount > 0) {
                            return {
                                type: 'TokenOwnerRecord',
                                account: tor.pubkey.toString(),
                                wallet: TARGET_WALLET,
                                amount: tokenAmount
                            };
                        }
                    }
                } catch (error) {
                    // Continue searching
                }
            }
        } catch (error) {
            console.log('Error searching Token Owner Records:', error.message);
        }

        // Search for any governance accounts that have our target amount
        console.log('\n📊 Searching for accounts with the target deposit amount...');
        
        // Convert 625.58 to different possible on-chain representations
        const targetAmount = 625.58;
        const targetAmountLamports = BigInt(Math.floor(targetAmount * Math.pow(10, 6)));
        
        console.log(`Looking for amount: ${targetAmount} ISLAND (${targetAmountLamports} lamports)`);

        // Search through all governance programs for accounts containing this amount
        const allGovernancePrograms = [
            'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
            'VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7',
            'VoteWPk9yyGmkX4KUJpjdpreE6FkCDDPzLu3QERBkmvk'
        ];

        for (const programIdStr of allGovernancePrograms) {
            if (programIdStr === 'VoteWPk9yyGmkX4KUJpjdpreE6FkCDDPzLu3QERBkmvk') continue; // Invalid key

            console.log(`\n📊 Searching program: ${programIdStr}`);
            
            try {
                const programId = new PublicKey(programIdStr);
                const accounts = await connection.getProgramAccounts(programId);
                
                console.log(`  Found ${accounts.length} total accounts`);
                
                for (const account of accounts) {
                    const data = account.account.data;
                    
                    // Search for our target amount at different offsets
                    for (let offset = 0; offset <= data.length - 8; offset += 8) {
                        try {
                            const amount = data.readBigUInt64LE(offset);
                            
                            if (amount === targetAmountLamports) {
                                console.log(`\n🎯 FOUND TARGET AMOUNT!`);
                                console.log(`  Account: ${account.pubkey.toString()}`);
                                console.log(`  Program: ${programIdStr}`);
                                console.log(`  Offset: ${offset}`);
                                console.log(`  Amount: ${Number(amount) / Math.pow(10, 6)} ISLAND`);
                                
                                // Check if this account also contains our wallet address
                                for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset++) {
                                    if (data.subarray(walletOffset, walletOffset + 32).equals(targetWalletPubkey.toBuffer())) {
                                        console.log(`  ✅ WALLET ADDRESS ALSO FOUND AT OFFSET ${walletOffset}!`);
                                        
                                        return {
                                            type: 'GovernanceDeposit',
                                            program: programIdStr,
                                            account: account.pubkey.toString(),
                                            wallet: TARGET_WALLET,
                                            amount: targetAmount,
                                            amountOffset: offset,
                                            walletOffset: walletOffset
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
                console.log(`  Error searching program: ${error.message}`);
            }
        }

        console.log('\n❌ Could not find the governance deposit account');
        console.log('The deposit might be:');
        console.log('1. In a custom VSR plugin not in our search list');
        console.log('2. Stored with different amount precision');
        console.log('3. In a wrapped or derived account structure');
        
        return null;

    } catch (error) {
        console.error('❌ Error in comprehensive governance search:', error.message);
        return null;
    }
}

// Run the comprehensive search
searchIslandGovernanceAccounts().then((result) => {
    if (result) {
        console.log('\n✅ Successfully found governance deposit account!');
        console.log('This can be used to fetch authentic governance power for all citizens.');
    } else {
        console.log('\n❌ Could not locate the governance deposit mechanism');
        console.log('API access to IslandDAO governance data may be required.');
    }
    process.exit(0);
});
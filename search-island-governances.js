/**
 * Search the 5 IslandDAO governance accounts for deposited amounts
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const ISLAND_TOKEN_DECIMALS = 6;

// The 5 IslandDAO governance accounts
const ISLAND_GOVERNANCES = [
    'CLgzSdeNcf9CYHiAdmXaPaCw2vYBeiqEeZcgguqirVM9',
    'bDgqY2Qt4y2jSsRNvD7FETkRJJNiYZT1Q3UnAYYzUCo',
    'BtJaNZrZZmagHGzCU2VazSJWzBS9KY7tG41enBrT2NtU',
    '6Vjsy1KabnHtSuHZcXuuCQFWoBML9JscSy3L4NGjqmhM',
    'EUxUMEjcxZ9VxpP1gyJQtq9xHdWTvtLHowjN7JNJEsg7'
];

// Target wallet we know has 625.58 deposited
const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
const TARGET_AMOUNT = 625.58;

async function searchIslandGovernances() {
    try {
        console.log(`🔍 Searching IslandDAO governance accounts for deposits`);
        console.log(`Target wallet: ${TARGET_WALLET}`);
        console.log(`Expected deposit: ${TARGET_AMOUNT} $ISLAND`);
        console.log('');

        const targetLamports = BigInt(Math.round(TARGET_AMOUNT * Math.pow(10, ISLAND_TOKEN_DECIMALS)));
        console.log(`Target in lamports: ${targetLamports.toString()}`);
        console.log('');

        for (let i = 0; i < ISLAND_GOVERNANCES.length; i++) {
            const governanceId = ISLAND_GOVERNANCES[i];
            console.log(`🏛️ Governance ${i + 1}/5: ${governanceId}`);
            
            try {
                // Get account info for this governance
                const governanceAccount = await connection.getAccountInfo(new PublicKey(governanceId));
                
                if (!governanceAccount) {
                    console.log(`  ❌ Governance account not found`);
                    continue;
                }
                
                console.log(`  📊 Data length: ${governanceAccount.data.length} bytes`);
                
                // Search for deposited amounts in this governance account
                const data = governanceAccount.data;
                let foundAmounts = [];
                
                for (let offset = 0; offset <= data.length - 8; offset += 8) {
                    try {
                        const amount = data.readBigUInt64LE(offset);
                        const tokenAmount = Number(amount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                        
                        // Check for our target amount
                        if (Math.abs(tokenAmount - TARGET_AMOUNT) < 0.1) {
                            console.log(`    🎯 FOUND TARGET! Offset ${offset}: ${tokenAmount} $ISLAND`);
                            foundAmounts.push({ offset, amount: tokenAmount, raw: amount.toString() });
                        }
                        
                        // Log other significant amounts
                        if (tokenAmount > 10 && tokenAmount < 1000000) {
                            foundAmounts.push({ offset, amount: tokenAmount, raw: amount.toString() });
                        }
                    } catch (error) {
                        // Continue searching
                    }
                }
                
                if (foundAmounts.length > 0) {
                    console.log(`  💰 Found ${foundAmounts.length} potential deposits:`);
                    foundAmounts.forEach(item => {
                        console.log(`    Offset ${item.offset}: ${item.amount.toLocaleString()} $ISLAND`);
                    });
                }
                
                // Also search for wallet references
                const walletPubkey = new PublicKey(TARGET_WALLET);
                const walletBuffer = walletPubkey.toBuffer();
                let walletFound = false;
                
                for (let j = 0; j <= data.length - 32; j++) {
                    if (data.subarray(j, j + 32).equals(walletBuffer)) {
                        console.log(`  👤 Found wallet reference at offset ${j}`);
                        walletFound = true;
                        break;
                    }
                }
                
                if (!walletFound) {
                    console.log(`  ❌ Target wallet not referenced in this governance`);
                }
                
            } catch (error) {
                console.log(`  ❌ Error checking governance: ${error.message}`);
            }
            
            console.log('');
        }
        
        console.log('🔍 Now searching for Token Owner Records in these governances...');
        
        // Alternative approach: Search for Token Owner Records in these governance contexts
        const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
        
        for (const governanceId of ISLAND_GOVERNANCES) {
            console.log(`🔎 Searching Token Owner Records for governance: ${governanceId}`);
            
            try {
                // Search for accounts that reference this governance
                const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
                    filters: [
                        {
                            memcmp: {
                                offset: 1,
                                bytes: governanceId
                            }
                        }
                    ]
                });
                
                console.log(`  Found ${accounts.length} related accounts`);
                
                for (const account of accounts) {
                    const data = account.account.data;
                    
                    // Check if this account contains our target wallet
                    const walletPubkey = new PublicKey(TARGET_WALLET);
                    const walletBuffer = walletPubkey.toBuffer();
                    let containsWallet = false;
                    
                    for (let j = 0; j <= data.length - 32; j++) {
                        if (data.subarray(j, j + 32).equals(walletBuffer)) {
                            containsWallet = true;
                            break;
                        }
                    }
                    
                    if (containsWallet) {
                        console.log(`    🎯 Found account with target wallet: ${account.pubkey.toString()}`);
                        console.log(`    📊 Data length: ${data.length} bytes`);
                        
                        // Search for deposit amounts in this account
                        for (let offset = 0; offset <= data.length - 8; offset += 8) {
                            try {
                                const amount = data.readBigUInt64LE(offset);
                                const tokenAmount = Number(amount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                                
                                if (Math.abs(tokenAmount - TARGET_AMOUNT) < 0.01) {
                                    console.log(`      💰 FOUND DEPOSIT! Offset ${offset}: ${tokenAmount} $ISLAND`);
                                    return {
                                        governance: governanceId,
                                        account: account.pubkey.toString(),
                                        offset: offset,
                                        amount: tokenAmount
                                    };
                                }
                                
                                if (tokenAmount > 0.1 && tokenAmount < 1000000) {
                                    console.log(`      Offset ${offset}: ${tokenAmount.toLocaleString()} $ISLAND`);
                                }
                            } catch (error) {
                                // Continue
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.log(`  ❌ Error searching Token Owner Records: ${error.message}`);
            }
            
            console.log('');
        }

        console.log('❌ Could not find the target deposit in any governance account');
        return null;

    } catch (error) {
        console.error('❌ Error searching Island governances:', error.message);
        return null;
    }
}

// Run the search
searchIslandGovernances().then((result) => {
    if (result) {
        console.log('\n✅ SUCCESS! Found the governance deposit:');
        console.log(JSON.stringify(result, null, 2));
    }
    process.exit(0);
});
/**
 * Detailed search in the governance with most accounts (357 accounts)
 * Focus on governance: 6Vjsy1KabnHtSuHZcXuuCQFWoBML9JscSy3L4NGjqmhM
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_DECIMALS = 6;

// Focus on the governance with most accounts
const TARGET_GOVERNANCE = '6Vjsy1KabnHtSuHZcXuuCQFWoBML9JscSy3L4NGjqmhM';
const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
const TARGET_AMOUNT = 625.58;

async function searchDetailedGovernance() {
    try {
        console.log(`🔍 Detailed search in governance: ${TARGET_GOVERNANCE}`);
        console.log(`Looking for wallet: ${TARGET_WALLET}`);
        console.log(`Expected amount: ${TARGET_AMOUNT} $ISLAND`);
        console.log('');

        // Get all accounts related to this specific governance
        const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 1,
                        bytes: TARGET_GOVERNANCE
                    }
                }
            ]
        });
        
        console.log(`Found ${accounts.length} accounts in this governance`);
        console.log('');

        const walletPubkey = new PublicKey(TARGET_WALLET);
        const walletBuffer = walletPubkey.toBuffer();
        const targetLamports = Math.round(TARGET_AMOUNT * Math.pow(10, ISLAND_TOKEN_DECIMALS));

        // Search through each account
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            const data = account.account.data;
            
            // Check if this account contains our target wallet
            let containsWallet = false;
            let walletOffset = -1;
            
            for (let j = 0; j <= data.length - 32; j++) {
                if (data.subarray(j, j + 32).equals(walletBuffer)) {
                    containsWallet = true;
                    walletOffset = j;
                    break;
                }
            }
            
            if (containsWallet) {
                console.log(`\n🎯 Account ${i + 1}: ${account.pubkey.toString()}`);
                console.log(`  ✅ Contains target wallet at offset ${walletOffset}`);
                console.log(`  📊 Data length: ${data.length} bytes`);
                
                // Search for amounts in this specific account
                console.log(`  💰 Searching for deposit amounts:`);
                
                for (let offset = 0; offset <= data.length - 8; offset += 8) {
                    try {
                        const amount = data.readBigUInt64LE(offset);
                        const tokenAmount = Number(amount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                        
                        // Check for exact match
                        if (Math.abs(amount - targetLamports) <= 1000) {
                            console.log(`    🎯 EXACT MATCH! Offset ${offset}: ${tokenAmount} $ISLAND`);
                            console.log(`    📍 Raw amount: ${amount}`);
                            
                            return {
                                governance: TARGET_GOVERNANCE,
                                account: account.pubkey.toString(),
                                walletOffset: walletOffset,
                                depositOffset: offset,
                                amount: tokenAmount,
                                rawAmount: amount.toString(),
                                dataLength: data.length
                            };
                        }
                        
                        // Log any reasonable amounts
                        if (tokenAmount > 0.001 && tokenAmount < 100000) {
                            console.log(`    Offset ${offset}: ${tokenAmount.toLocaleString()} $ISLAND`);
                        }
                    } catch (error) {
                        // Continue searching
                    }
                }
                
                // If no exact match, show the account structure
                console.log(`  📋 Account structure analysis:`);
                console.log(`    Account type: ${data.readUInt8(0)}`);
                
                // Try to parse as Token Owner Record structure
                if (data.length >= 105) {
                    try {
                        // Common Token Owner Record offsets
                        const commonOffsets = [73, 81, 89, 97, 105];
                        
                        for (const offset of commonOffsets) {
                            if (data.length >= offset + 8) {
                                const amount = data.readBigUInt64LE(offset);
                                const tokenAmount = Number(amount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                                
                                if (tokenAmount > 0 && tokenAmount < 100000) {
                                    console.log(`    Standard offset ${offset}: ${tokenAmount.toLocaleString()} $ISLAND`);
                                }
                            }
                        }
                    } catch (error) {
                        console.log(`    Error parsing standard structure: ${error.message}`);
                    }
                }
            }
        }

        console.log('\n❌ Could not find the exact deposit amount in any account');
        return null;

    } catch (error) {
        console.error('❌ Error in detailed governance search:', error.message);
        return null;
    }
}

// Run the detailed search
searchDetailedGovernance().then((result) => {
    if (result) {
        console.log('\n✅ SUCCESS! Found the governance deposit structure:');
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log('\n❌ Could not locate the deposit structure');
    }
    process.exit(0);
});
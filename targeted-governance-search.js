/**
 * Targeted search for IslandDAO governance deposits
 * Uses filters to find only IslandDAO-related accounts in SPL Governance
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_DAO_REALM = new PublicKey('H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz');
const ISLAND_TOKEN_DECIMALS = 6;

// Target wallet we know has 625.580931 deposited
const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

async function searchIslandDAOGovernance() {
    try {
        console.log(`🔍 Searching for IslandDAO governance deposits`);
        console.log(`Target wallet: ${TARGET_WALLET}`);
        console.log(`Expected deposit: 625.580931 $ISLAND`);
        console.log('');

        // Filter for accounts that reference the IslandDAO realm
        console.log('📊 Fetching IslandDAO governance accounts...');
        const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 1, // Skip account type byte
                        bytes: ISLAND_DAO_REALM.toBase58()
                    }
                }
            ]
        });
        
        console.log(`Found ${accounts.length} IslandDAO governance accounts`);
        console.log('');

        const targetAmount = 625.580931;
        const walletPubkey = new PublicKey(TARGET_WALLET);

        // Search through filtered accounts
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            const data = account.account.data;
            
            console.log(`Account ${i + 1}/${accounts.length}: ${account.pubkey.toString()}`);
            console.log(`  Data length: ${data.length} bytes`);

            // Check if this account contains our target wallet address
            let containsWallet = false;
            try {
                const walletBuffer = walletPubkey.toBuffer();
                for (let j = 0; j <= data.length - 32; j++) {
                    if (data.subarray(j, j + 32).equals(walletBuffer)) {
                        containsWallet = true;
                        console.log(`  ✅ Contains target wallet at offset ${j}`);
                        break;
                    }
                }
            } catch (error) {
                // Continue if wallet check fails
            }

            if (containsWallet) {
                console.log(`  🎯 ANALYZING ACCOUNT WITH TARGET WALLET:`);
                
                // Search for amounts in this account
                for (let offset = 0; offset <= data.length - 8; offset += 8) {
                    try {
                        const amount = data.readBigUInt64LE(offset);
                        const tokenAmount = Number(amount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                        
                        // Check if this matches our target amount
                        if (Math.abs(tokenAmount - targetAmount) < 0.001) {
                            console.log(`    💰 FOUND TARGET DEPOSIT! Offset ${offset}: ${tokenAmount} $ISLAND`);
                            console.log(`    📍 Account: ${account.pubkey.toString()}`);
                            console.log(`    💾 Raw amount: ${amount.toString()}`);
                            return {
                                account: account.pubkey.toString(),
                                offset: offset,
                                amount: tokenAmount,
                                rawAmount: amount.toString()
                            };
                        }
                        
                        // Log any significant amounts
                        if (tokenAmount > 0.001 && tokenAmount < 1000000) {
                            console.log(`    Offset ${offset}: ${tokenAmount.toLocaleString()} $ISLAND`);
                        }
                    } catch (error) {
                        // Continue if amount parsing fails
                    }
                }
            }

            console.log('');
        }

        console.log('❌ Target deposit amount not found in IslandDAO accounts');
        return null;

    } catch (error) {
        console.error('❌ Error searching IslandDAO governance:', error.message);
        return null;
    }
}

// Run the search
searchIslandDAOGovernance().then((result) => {
    if (result) {
        console.log('✅ Successfully found target governance deposit!');
    }
    process.exit(0);
});
/**
 * Search SPL Governance Program for Authentic Deposited Amounts
 * Searches the entire GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw program
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_DECIMALS = 6;

// Target wallet we know has 625.580931 deposited
const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

async function searchGovernanceProgram() {
    try {
        console.log(`🔍 Searching SPL Governance Program: ${GOVERNANCE_PROGRAM_ID.toString()}`);
        console.log(`Target wallet: ${TARGET_WALLET}`);
        console.log(`Expected deposit: 625.580931 $ISLAND`);
        console.log('');

        // Get all accounts owned by the governance program
        console.log('📊 Fetching all governance program accounts...');
        const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID);
        
        console.log(`Found ${accounts.length} total accounts in governance program`);
        console.log('');

        let foundTargetAmount = false;
        const targetAmount = 625.580931;
        const walletPubkey = new PublicKey(TARGET_WALLET);

        // Search through all accounts
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

            // Search for the target amount (625.580931 tokens)
            // This amount in lamports would be 625580931 (625.580931 * 10^6)
            const targetLamports = BigInt(Math.round(targetAmount * Math.pow(10, ISLAND_TOKEN_DECIMALS)));
            
            // Try different offsets to find token amounts
            for (let offset = 0; offset <= data.length - 8; offset += 8) {
                try {
                    const amount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(amount) / Math.pow(10, ISLAND_TOKEN_DECIMALS);
                    
                    // Check if this matches our target amount (within small tolerance)
                    if (Math.abs(tokenAmount - targetAmount) < 0.001) {
                        console.log(`  🎯 FOUND TARGET AMOUNT! Offset ${offset}: ${tokenAmount} $ISLAND`);
                        console.log(`  📍 Account: ${account.pubkey.toString()}`);
                        console.log(`  💾 Raw amount: ${amount.toString()}`);
                        foundTargetAmount = true;
                    }
                    
                    // Also log any significant amounts for analysis
                    if (tokenAmount > 100 && tokenAmount < 1000000) {
                        console.log(`    Offset ${offset}: ${tokenAmount.toLocaleString()} $ISLAND`);
                    }
                } catch (error) {
                    // Continue if amount parsing fails
                }
            }

            if (containsWallet) {
                console.log(`  📋 This account references our target wallet`);
            }

            console.log('');

            // Add small delay to avoid overwhelming output
            if (i % 10 === 9) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (!foundTargetAmount) {
            console.log('❌ Target amount of 625.580931 $ISLAND not found in any account');
        }

        console.log('🏁 Search completed');

    } catch (error) {
        console.error('❌ Error searching governance program:', error.message);
    }
}

// Run the search
searchGovernanceProgram().then(() => {
    process.exit(0);
});
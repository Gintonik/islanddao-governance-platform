/**
 * Analyze withdraw_governing_tokens instruction to understand governance deposit tracking
 * Using the withdraw transaction to reverse-engineer the deposit structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// The withdraw transaction
const WITHDRAW_TX = '2nwCeqAA9meDYKdWout2u5ncYnpncapdwRp9j8E17hb75EGuhkQ1EeGM2wKCKUJtCJ8onX16Hz6iAZR47jSJMTAD';

async function analyzeWithdrawInstruction() {
    try {
        console.log('Analyzing withdraw_governing_tokens instruction');
        console.log(`Transaction: ${WITHDRAW_TX}`);
        
        const tx = await connection.getTransaction(WITHDRAW_TX, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

        if (!tx) {
            console.log('Transaction not found');
            return null;
        }

        console.log('\nAccounts in withdraw transaction:');
        const accounts = tx.transaction.message.staticAccountKeys;
        accounts.forEach((account, index) => {
            console.log(`  ${index}: ${account.toString()}`);
        });

        console.log('\nToken balance changes:');
        if (tx.meta && tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
            const preBalances = tx.meta.preTokenBalances;
            const postBalances = tx.meta.postTokenBalances;
            
            preBalances.forEach(preBalance => {
                const postBalance = postBalances.find(pb => 
                    pb.accountIndex === preBalance.accountIndex && 
                    pb.mint === preBalance.mint
                );
                
                if (postBalance) {
                    const preAmount = parseFloat(preBalance.uiTokenAmount.uiAmountString || '0');
                    const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmountString || '0');
                    const change = postAmount - preAmount;
                    
                    if (Math.abs(change) > 0.000001) {
                        console.log(`    Account ${preBalance.accountIndex} (${accounts[preBalance.accountIndex].toString()}): ${change > 0 ? '+' : ''}${change.toFixed(6)} ISLAND`);
                        console.log(`      Owner: ${preBalance.owner}`);
                    }
                }
            });
        }

        // The key insight: account index 2 (GivwEisGK5fQ131EsKPYAncai18MX7vqiLMvaTLjyuyx) 
        // lost 12625.580931 tokens, which means this account tracks the deposit
        const depositTrackingAccount = accounts[2]; // GivwEisGK5fQ131EsKPYAncai18MX7vqiLMvaTLjyuyx
        console.log(`\nDeposit tracking account: ${depositTrackingAccount.toString()}`);
        
        return {
            depositTrackingAccount: depositTrackingAccount.toString(),
            withdrawnAmount: 12625.580931,
            walletAddress: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'
        };

    } catch (error) {
        console.error('Error analyzing withdraw instruction:', error.message);
        return null;
    }
}

/**
 * Find similar deposit tracking accounts for our citizens
 * Using the pattern discovered from the withdraw transaction
 */
async function findDepositTrackingAccounts() {
    try {
        console.log('\nSearching for deposit tracking accounts pattern...');
        
        // The deposit tracking account from the withdraw transaction
        const knownDepositAccount = 'GivwEisGK5fQ131EsKPYAncai18MX7vqiLMvaTLjyuyx';
        const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        
        console.log(`Known pattern: Wallet ${knownWallet} -> Deposit account ${knownDepositAccount}`);
        
        // Get all our citizens
        const citizens = await db.getAllCitizens();
        console.log(`\nChecking ${citizens.length} citizens for similar accounts...`);
        
        const results = [];
        
        // For each citizen, we need to find their corresponding deposit tracking account
        // This might require deriving PDAs or searching for accounts that reference their wallet
        
        for (let i = 0; i < citizens.length; i++) {
            const citizen = citizens[i];
            console.log(`\nChecking ${i + 1}/${citizens.length}: ${citizen.name || 'Unknown'} (${citizen.wallet_address})`);
            
            // Try to derive or find the deposit tracking account for this wallet
            const depositAccount = await findDepositAccountForWallet(citizen.wallet_address);
            
            if (depositAccount) {
                console.log(`  Found deposit account: ${depositAccount.account}`);
                console.log(`  Deposit amount: ${depositAccount.amount.toLocaleString()} ISLAND`);
                
                // Update the database
                await db.updateGovernancePower(citizen.wallet_address, depositAccount.amount);
                
                results.push({
                    wallet: citizen.wallet_address,
                    name: citizen.name,
                    depositAccount: depositAccount.account,
                    depositAmount: depositAccount.amount
                });
            } else {
                console.log(`  No deposit account found`);
                // Set to 0 in database
                await db.updateGovernancePower(citizen.wallet_address, 0);
                
                results.push({
                    wallet: citizen.wallet_address,
                    name: citizen.name,
                    depositAccount: null,
                    depositAmount: 0
                });
            }
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const citizensWithDeposits = results.filter(r => r.depositAmount > 0);
        console.log(`\nSync complete: ${citizensWithDeposits.length}/${results.length} citizens have governance deposits`);
        
        if (citizensWithDeposits.length > 0) {
            console.log('\nTop depositors:');
            citizensWithDeposits
                .sort((a, b) => b.depositAmount - a.depositAmount)
                .slice(0, 5)
                .forEach((citizen, index) => {
                    console.log(`  ${index + 1}. ${citizen.name || 'Unknown'}: ${citizen.depositAmount.toLocaleString()} ISLAND`);
                });
        }
        
        return results;
        
    } catch (error) {
        console.error('Error finding deposit tracking accounts:', error.message);
        return [];
    }
}

/**
 * Find deposit account for a specific wallet
 * This might require trying different PDA derivation patterns
 */
async function findDepositAccountForWallet(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        
        // Try different PDA patterns that might be used for deposit tracking
        const programs = [
            'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw', // SPL Governance
            'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ'  // VSR
        ];
        
        const seeds = [
            ['governance', '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds', 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a'],
            ['deposit', walletAddress],
            ['voter', 'Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd'],
        ];
        
        for (const programId of programs) {
            for (const seedPattern of seeds) {
                try {
                    const seeds_with_wallet = [...seedPattern, walletAddress];
                    const seeds_buffers = seeds_with_wallet.map(seed => {
                        if (typeof seed === 'string') {
                            try {
                                return new PublicKey(seed).toBuffer();
                            } catch {
                                return Buffer.from(seed);
                            }
                        }
                        return seed;
                    });
                    
                    const [pda] = PublicKey.findProgramAddressSync(seeds_buffers, new PublicKey(programId));
                    
                    const accountInfo = await connection.getAccountInfo(pda);
                    if (accountInfo) {
                        // Search for deposit amounts in this account
                        const depositAmount = searchForDepositAmount(accountInfo.data);
                        if (depositAmount > 0) {
                            return {
                                account: pda.toString(),
                                amount: depositAmount
                            };
                        }
                    }
                } catch (error) {
                    // Continue trying other patterns
                }
            }
        }
        
        return null;
        
    } catch (error) {
        return null;
    }
}

/**
 * Search for deposit amounts in account data
 */
function searchForDepositAmount(accountData) {
    // Look for reasonable ISLAND token amounts (between 1 and 100,000,000 tokens)
    for (let offset = 0; offset <= accountData.length - 8; offset++) {
        try {
            const value = accountData.readBigUInt64LE(offset);
            const tokenAmount = Number(value) / Math.pow(10, 6);
            
            // Check if this looks like a reasonable deposit amount
            if (tokenAmount >= 1 && tokenAmount <= 100000000) {
                return tokenAmount;
            }
        } catch (error) {
            // Continue searching
        }
    }
    
    return 0;
}

// Run the analysis
if (require.main === module) {
    Promise.resolve()
        .then(() => analyzeWithdrawInstruction())
        .then(() => findDepositTrackingAccounts())
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = {
    analyzeWithdrawInstruction,
    findDepositTrackingAccounts,
    findDepositAccountForWallet
};
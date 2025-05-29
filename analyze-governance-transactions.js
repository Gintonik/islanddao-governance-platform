/**
 * Analyze IslandDAO governance deposit/withdraw transactions
 * Using the actual transaction signatures to understand the mechanism
 */

const { Connection } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// Transaction signatures from user
const WITHDRAW_TX = '2nwCeqAA9meDYKdWout2u5ncYnpncapdwRp9j8E17hb75EGuhkQ1EeGM2wKCKUJtCJ8onX16Hz6iAZR47jSJMTAD';
const DEPOSIT_TX = '53MtCkhPYRSWkniY9846yTXGKgkbuDpGoNiRCtp5Q3i4BVoKAGSrgc1mK8joYMvstUrvTW8FKqUzDoULqEuphW5Z';

async function analyzeGovernanceTransactions() {
    try {
        console.log('🔍 Analyzing IslandDAO governance transactions');
        console.log('Wallet: 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4');
        console.log('');

        // Analyze withdraw transaction
        console.log('📤 WITHDRAW TRANSACTION:');
        console.log(`Signature: ${WITHDRAW_TX}`);
        
        const withdrawTx = await connection.getTransaction(WITHDRAW_TX, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

        if (withdrawTx) {
            console.log('✅ Transaction found');
            console.log(`Block time: ${new Date(withdrawTx.blockTime * 1000).toISOString()}`);
            console.log(`Slot: ${withdrawTx.slot}`);
            
            // Analyze accounts involved
            console.log('\n📊 Accounts involved in withdraw:');
            withdrawTx.transaction.message.staticAccountKeys.forEach((account, index) => {
                console.log(`  ${index}: ${account.toString()}`);
            });

            // Analyze instructions
            console.log('\n📋 Instructions in withdraw:');
            withdrawTx.transaction.message.compiledInstructions.forEach((instruction, index) => {
                const programId = withdrawTx.transaction.message.staticAccountKeys[instruction.programIdIndex];
                console.log(`  ${index}: Program ${programId.toString()}`);
                console.log(`    Accounts: ${instruction.accountKeyIndexes.map(i => withdrawTx.transaction.message.staticAccountKeys[i].toString()).join(', ')}`);
                console.log(`    Data: ${Buffer.from(instruction.data).toString('hex')}`);
            });

            // Check for token balance changes
            if (withdrawTx.meta && withdrawTx.meta.preTokenBalances && withdrawTx.meta.postTokenBalances) {
                console.log('\n💰 Token balance changes in withdraw:');
                
                const preBalances = withdrawTx.meta.preTokenBalances;
                const postBalances = withdrawTx.meta.postTokenBalances;
                
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
                            console.log(`    Account ${preBalance.accountIndex}: ${change > 0 ? '+' : ''}${change.toFixed(6)} tokens`);
                            console.log(`      Mint: ${preBalance.mint}`);
                            console.log(`      Owner: ${preBalance.owner}`);
                        }
                    }
                });
            }
        } else {
            console.log('❌ Withdraw transaction not found');
        }

        console.log('\n' + '='.repeat(60));

        // Analyze deposit transaction
        console.log('\n📥 DEPOSIT TRANSACTION:');
        console.log(`Signature: ${DEPOSIT_TX}`);
        
        const depositTx = await connection.getTransaction(DEPOSIT_TX, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

        if (depositTx) {
            console.log('✅ Transaction found');
            console.log(`Block time: ${new Date(depositTx.blockTime * 1000).toISOString()}`);
            console.log(`Slot: ${depositTx.slot}`);
            
            // Analyze accounts involved
            console.log('\n📊 Accounts involved in deposit:');
            depositTx.transaction.message.staticAccountKeys.forEach((account, index) => {
                console.log(`  ${index}: ${account.toString()}`);
            });

            // Analyze instructions
            console.log('\n📋 Instructions in deposit:');
            depositTx.transaction.message.compiledInstructions.forEach((instruction, index) => {
                const programId = depositTx.transaction.message.staticAccountKeys[instruction.programIdIndex];
                console.log(`  ${index}: Program ${programId.toString()}`);
                console.log(`    Accounts: ${instruction.accountKeyIndexes.map(i => depositTx.transaction.message.staticAccountKeys[i].toString()).join(', ')}`);
                console.log(`    Data: ${Buffer.from(instruction.data).toString('hex')}`);
            });

            // Check for token balance changes
            if (depositTx.meta && depositTx.meta.preTokenBalances && depositTx.meta.postTokenBalances) {
                console.log('\n💰 Token balance changes in deposit:');
                
                const preBalances = depositTx.meta.preTokenBalances;
                const postBalances = depositTx.meta.postTokenBalances;
                
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
                            console.log(`    Account ${preBalance.accountIndex}: ${change > 0 ? '+' : ''}${change.toFixed(6)} tokens`);
                            console.log(`      Mint: ${preBalance.mint}`);
                            console.log(`      Owner: ${preBalance.owner}`);
                        }
                    }
                });
            }

            // Look for accounts that might be governance-related
            console.log('\n🏛️ Potential governance accounts:');
            const uniqueAccounts = [...new Set(depositTx.transaction.message.staticAccountKeys.map(a => a.toString()))];
            
            for (const accountStr of uniqueAccounts) {
                try {
                    const accountInfo = await connection.getAccountInfo(accountStr);
                    if (accountInfo) {
                        console.log(`  ${accountStr}:`);
                        console.log(`    Owner: ${accountInfo.owner.toString()}`);
                        console.log(`    Data length: ${accountInfo.data.length} bytes`);
                        
                        // Check if it's owned by governance program
                        if (accountInfo.owner.toString() === 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw') {
                            console.log(`    🎯 GOVERNANCE ACCOUNT FOUND!`);
                            
                            // Try to parse as Token Owner Record
                            if (accountInfo.data.length >= 105) {
                                try {
                                    const accountType = accountInfo.data.readUInt8(0);
                                    if (accountType === 2) {
                                        const depositAmount = accountInfo.data.readBigUInt64LE(97);
                                        const tokenAmount = Number(depositAmount) / Math.pow(10, 6);
                                        console.log(`    💰 Deposit amount: ${tokenAmount.toLocaleString()} ISLAND`);
                                    }
                                } catch (error) {
                                    console.log(`    ❌ Error parsing: ${error.message}`);
                                }
                            }
                        }
                    }
                } catch (error) {
                    // Continue
                }
            }
        } else {
            console.log('❌ Deposit transaction not found');
        }

        console.log('\n✅ Transaction analysis complete');
        
    } catch (error) {
        console.error('❌ Error analyzing transactions:', error.message);
    }
}

// Run the analysis
analyzeGovernanceTransactions().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
});
/**
 * Efficient Governance Sync
 * Focus on finding governance deposits for specific citizen wallets
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
const fetch = require('node-fetch');

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GOVERNANCE_TOKEN_ACCOUNT = 'AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Check governance transactions for a specific wallet
 */
async function getWalletGovernanceTransactions(walletAddress) {
    try {
        console.log(`Checking governance transactions for: ${walletAddress}`);
        
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getSignaturesForAddress',
                params: [
                    walletAddress,
                    { limit: 50 }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.length > 0) {
            let totalDeposits = 0;
            
            for (const tx of data.result.slice(0, 20)) { // Check recent 20 transactions
                const deposit = await checkTransactionForGovernanceDeposit(tx.signature, walletAddress);
                if (deposit !== 0) {
                    totalDeposits += deposit;
                    console.log(`  Transaction ${tx.signature.slice(0, 12)}...: ${deposit.toLocaleString()} ISLAND`);
                }
            }
            
            if (totalDeposits > 0) {
                console.log(`  Total governance deposit: ${totalDeposits.toLocaleString()} ISLAND`);
            }
            
            return totalDeposits;
        }
        
        return 0;
    } catch (error) {
        console.log(`Error checking transactions for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Check if a transaction involves governance deposits
 */
async function checkTransactionForGovernanceDeposit(signature, walletAddress) {
    try {
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [
                    signature,
                    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.meta) {
            const meta = data.result.meta;
            
            // Check if this transaction involves the governance account
            const accountKeys = data.result.transaction.message.accountKeys || [];
            const hasGovernanceAccount = accountKeys.some(key => 
                (typeof key === 'string' ? key : key.pubkey) === GOVERNANCE_TOKEN_ACCOUNT
            );
            
            if (!hasGovernanceAccount) return 0;
            
            // Analyze token balance changes
            if (meta.preTokenBalances && meta.postTokenBalances) {
                for (const postBalance of meta.postTokenBalances) {
                    if (postBalance.mint === ISLAND_TOKEN_MINT && postBalance.owner === GOVERNANCE_TOKEN_ACCOUNT) {
                        // Find corresponding pre-balance
                        const preBalance = meta.preTokenBalances.find(pre => 
                            pre.accountIndex === postBalance.accountIndex
                        );
                        
                        const preAmount = preBalance ? (preBalance.uiTokenAmount.uiAmount || 0) : 0;
                        const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
                        const change = postAmount - preAmount;
                        
                        // If governance account gained tokens, someone deposited
                        if (change > 0) {
                            return change;
                        }
                    }
                }
            }
        }
        
        return 0;
    } catch (error) {
        return 0;
    }
}

/**
 * Test with known wallet first
 */
async function testKnownWalletGovernance() {
    const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    console.log('Testing governance sync with known wallet...');
    
    const deposits = await getWalletGovernanceTransactions(knownWallet);
    
    if (deposits > 0) {
        console.log(`✅ Found ${deposits.toLocaleString()} ISLAND governance deposits`);
        
        if (Math.abs(deposits - 12625.580931) < 100) {
            console.log('✅ Amount is close to expected value!');
        }
        
        return true;
    } else {
        console.log('❌ No governance deposits found');
        return false;
    }
}

/**
 * Sync governance for all citizens efficiently
 */
async function syncCitizenGovernanceEfficiently() {
    try {
        console.log('Starting efficient governance sync for citizens...');
        
        // Test with known wallet first
        const testSuccess = await testKnownWalletGovernance();
        if (!testSuccess) {
            console.log('Test failed, but continuing with citizen sync...');
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nProcessing ${walletAddresses.length} citizens`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const deposits = await getWalletGovernanceTransactions(walletAddress);
            results[walletAddress] = deposits;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [deposits, walletAddress]
            );
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance deposits: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error in efficient governance sync:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncCitizenGovernanceEfficiently()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncCitizenGovernanceEfficiently, 
    testKnownWalletGovernance 
};
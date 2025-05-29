/**
 * Transaction Analysis Governance Query
 * Analyze actual transactions to understand IslandDAO's governance structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
const fetch = require('node-fetch');

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KNOWN_GOVERNANCE_ACCOUNT = 'AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Get recent transactions for the known governance account
 */
async function getGovernanceTransactions() {
    try {
        console.log('Analyzing governance account transactions...');
        
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getSignaturesForAddress',
                params: [
                    KNOWN_GOVERNANCE_ACCOUNT,
                    { limit: 20 }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.length > 0) {
            console.log(`Found ${data.result.length} recent transactions`);
            
            // Analyze the first few transactions
            for (let i = 0; i < Math.min(3, data.result.length); i++) {
                const txSig = data.result[i].signature;
                console.log(`Analyzing transaction: ${txSig}`);
                
                await analyzeTransaction(txSig);
            }
        }
        
    } catch (error) {
        console.error('Error getting governance transactions:', error.message);
    }
}

/**
 * Analyze a specific transaction to understand governance patterns
 */
async function analyzeTransaction(signature) {
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
        
        if (data.result) {
            const transaction = data.result;
            
            // Look for token transfers involving ISLAND
            if (transaction.meta && transaction.meta.preTokenBalances && transaction.meta.postTokenBalances) {
                const preBalances = transaction.meta.preTokenBalances;
                const postBalances = transaction.meta.postTokenBalances;
                
                for (const balance of postBalances) {
                    if (balance.mint === ISLAND_TOKEN_MINT) {
                        const amount = balance.uiTokenAmount.uiAmount;
                        console.log(`  ISLAND balance: ${amount?.toLocaleString()} in account ${balance.owner}`);
                        
                        // Check if this matches our known amount
                        if (amount && Math.abs(amount - 12625.580931) < 1) {
                            console.log(`  🎯 Found matching amount! Account: ${balance.owner}`);
                        }
                    }
                }
            }
        }
        
    } catch (error) {
        console.log(`Error analyzing transaction ${signature}:`, error.message);
    }
}

/**
 * Search for token accounts that hold ISLAND tokens for governance
 */
async function findGovernanceTokenAccounts() {
    try {
        console.log('Searching for ISLAND token accounts...');
        
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenLargestAccounts',
                params: [ISLAND_TOKEN_MINT]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.value) {
            console.log(`Found ${data.result.value.length} largest ISLAND token accounts:`);
            
            for (const account of data.result.value.slice(0, 10)) {
                const amount = account.uiAmount;
                console.log(`  ${account.address}: ${amount?.toLocaleString()} ISLAND`);
                
                // Check if this could be a governance deposit
                if (amount && amount > 1000 && amount < 100000) {
                    await checkIfGovernanceAccount(account.address, amount);
                }
            }
        }
        
    } catch (error) {
        console.error('Error finding governance token accounts:', error.message);
    }
}

/**
 * Check if an account is related to governance
 */
async function checkIfGovernanceAccount(accountAddress, amount) {
    try {
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [
                    accountAddress,
                    { encoding: 'jsonParsed' }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.value) {
            const account = data.result.value;
            
            if (account.data.parsed && account.data.parsed.info) {
                const owner = account.data.parsed.info.owner;
                console.log(`    Account ${accountAddress} owned by: ${owner}`);
                
                // Check if this matches our known wallet
                if (owner === '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4') {
                    console.log(`    🎯 Found wallet's token account with ${amount.toLocaleString()} ISLAND`);
                }
            }
        }
        
    } catch (error) {
        console.log(`Error checking account ${accountAddress}:`, error.message);
    }
}

/**
 * Alternative approach: Use wallet's token accounts directly
 */
async function getWalletTokenAccountBalance(walletAddress) {
    try {
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    walletAddress,
                    { mint: ISLAND_TOKEN_MINT },
                    { encoding: 'jsonParsed' }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.value) {
            let totalBalance = 0;
            
            for (const account of data.result.value) {
                const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
                totalBalance += balance || 0;
                
                console.log(`${walletAddress} token account: ${balance?.toLocaleString()} ISLAND`);
            }
            
            return totalBalance;
        }
        
        return 0;
    } catch (error) {
        console.log(`Error getting token accounts for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Sync wallet balances as governance proxy
 */
async function syncWalletBalancesAsGovernance() {
    try {
        console.log('Using wallet ISLAND balances as governance power proxy...');
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Checking ${walletAddresses.length} citizen wallets`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const balance = await getWalletTokenAccountBalance(walletAddress);
            results[walletAddress] = balance;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [balance, walletAddress]
            );
            
            if (balance > 0) {
                console.log(`Updated ${walletAddress}: ${balance.toLocaleString()} ISLAND`);
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with ISLAND tokens: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total ISLAND held: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing wallet balances:', error.message);
        return {};
    }
}

/**
 * Test transaction analysis approach
 */
async function testTransactionAnalysis() {
    console.log('Testing transaction analysis approach...');
    
    // Analyze governance transactions
    await getGovernanceTransactions();
    
    // Find large token accounts
    await findGovernanceTokenAccounts();
    
    // Test with known wallet
    const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    const balance = await getWalletTokenAccountBalance(knownWallet);
    
    console.log(`Known wallet ISLAND balance: ${balance.toLocaleString()} ISLAND`);
    
    if (balance > 0) {
        console.log('✅ Found ISLAND tokens in wallet');
        return true;
    }
    
    return false;
}

if (require.main === module) {
    testTransactionAnalysis()
        .then((success) => {
            if (success) {
                console.log('\nProceeding with wallet balance sync...');
                return syncWalletBalancesAsGovernance();
            } else {
                console.log('\nTransaction analysis incomplete');
            }
        })
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncWalletBalancesAsGovernance, 
    testTransactionAnalysis 
};
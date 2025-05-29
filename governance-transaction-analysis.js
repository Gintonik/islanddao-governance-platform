/**
 * Governance Transaction Analysis
 * Analyze actual deposit/withdrawal transactions from the governance account
 * to understand how ISLAND governance deposits are tracked
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
 * Get transaction history for the governance account
 */
async function getGovernanceTransactionHistory() {
    try {
        console.log('Fetching governance transaction history...');
        
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getSignaturesForAddress',
                params: [
                    GOVERNANCE_TOKEN_ACCOUNT,
                    { limit: 100 }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.length > 0) {
            console.log(`Found ${data.result.length} transactions`);
            return data.result;
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching transaction history:', error.message);
        return [];
    }
}

/**
 * Analyze a specific transaction for deposit/withdrawal patterns
 */
async function analyzeGovernanceTransaction(signature) {
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
                    { 
                        encoding: 'jsonParsed', 
                        maxSupportedTransactionVersion: 0,
                        commitment: 'confirmed'
                    }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.meta) {
            const transaction = data.result;
            const meta = transaction.meta;
            
            // Look for token balance changes
            if (meta.preTokenBalances && meta.postTokenBalances) {
                const tokenChanges = analyzeTokenBalanceChanges(
                    meta.preTokenBalances, 
                    meta.postTokenBalances, 
                    signature
                );
                
                if (tokenChanges.length > 0) {
                    return {
                        signature: signature,
                        blockTime: transaction.blockTime,
                        changes: tokenChanges,
                        accounts: extractAccountsFromTransaction(transaction)
                    };
                }
            }
        }
        
        return null;
    } catch (error) {
        console.log(`Error analyzing transaction ${signature}:`, error.message);
        return null;
    }
}

/**
 * Analyze token balance changes to find deposits/withdrawals
 */
function analyzeTokenBalanceChanges(preBalances, postBalances, signature) {
    const changes = [];
    
    // Create maps for easier comparison
    const preBalanceMap = new Map();
    const postBalanceMap = new Map();
    
    preBalances.forEach(balance => {
        if (balance.mint === ISLAND_TOKEN_MINT) {
            preBalanceMap.set(balance.accountIndex, balance.uiTokenAmount.uiAmount || 0);
        }
    });
    
    postBalances.forEach(balance => {
        if (balance.mint === ISLAND_TOKEN_MINT) {
            postBalanceMap.set(balance.accountIndex, {
                amount: balance.uiTokenAmount.uiAmount || 0,
                owner: balance.owner
            });
        }
    });
    
    // Find changes
    for (const [accountIndex, postBalance] of postBalanceMap) {
        const preAmount = preBalanceMap.get(accountIndex) || 0;
        const postAmount = postBalance.amount;
        const change = postAmount - preAmount;
        
        if (Math.abs(change) > 0.001) { // Ignore dust
            changes.push({
                accountIndex: accountIndex,
                owner: postBalance.owner,
                preAmount: preAmount,
                postAmount: postAmount,
                change: change,
                isDeposit: change > 0,
                signature: signature
            });
        }
    }
    
    return changes;
}

/**
 * Extract wallet addresses from transaction
 */
function extractAccountsFromTransaction(transaction) {
    const accounts = [];
    
    if (transaction.transaction && transaction.transaction.message && transaction.transaction.message.accountKeys) {
        transaction.transaction.message.accountKeys.forEach((account, index) => {
            accounts.push({
                index: index,
                pubkey: account.pubkey || account,
                signer: account.signer || false,
                writable: account.writable || false
            });
        });
    }
    
    return accounts;
}

/**
 * Build governance deposit map from transaction analysis
 */
async function buildGovernanceDepositMap() {
    try {
        console.log('Building governance deposit map from transaction analysis...');
        
        const transactions = await getGovernanceTransactionHistory();
        const depositMap = new Map();
        
        console.log(`Analyzing ${Math.min(50, transactions.length)} recent transactions...`);
        
        for (let i = 0; i < Math.min(50, transactions.length); i++) {
            const txSig = transactions[i].signature;
            const txAnalysis = await analyzeGovernanceTransaction(txSig);
            
            if (txAnalysis && txAnalysis.changes.length > 0) {
                console.log(`\nTransaction: ${txSig.slice(0, 12)}...`);
                console.log(`Time: ${new Date(txAnalysis.blockTime * 1000).toISOString()}`);
                
                txAnalysis.changes.forEach(change => {
                    console.log(`  ${change.owner}: ${change.change > 0 ? '+' : ''}${change.change.toLocaleString()} ISLAND`);
                    
                    // Track net deposits per wallet
                    if (change.owner && change.owner !== GOVERNANCE_TOKEN_ACCOUNT) {
                        const currentDeposit = depositMap.get(change.owner) || 0;
                        depositMap.set(change.owner, currentDeposit + change.change);
                    }
                });
                
                // Check if this involves our known wallet
                const knownWalletChange = txAnalysis.changes.find(
                    change => change.owner === '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'
                );
                
                if (knownWalletChange) {
                    console.log(`  🎯 Found known wallet transaction: ${knownWalletChange.change.toLocaleString()} ISLAND`);
                }
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Display final deposit map
        console.log('\n=== Final Governance Deposit Map ===');
        const sortedDeposits = Array.from(depositMap.entries())
            .filter(([wallet, amount]) => Math.abs(amount) > 0.001)
            .sort(([,a], [,b]) => Math.abs(b) - Math.abs(a));
        
        sortedDeposits.forEach(([wallet, amount]) => {
            console.log(`${wallet}: ${amount.toLocaleString()} ISLAND`);
        });
        
        return depositMap;
        
    } catch (error) {
        console.error('Error building governance deposit map:', error.message);
        return new Map();
    }
}

/**
 * Sync governance deposits with citizens
 */
async function syncGovernanceDepositsWithCitizens() {
    try {
        console.log('Syncing governance deposits with citizens...');
        
        const depositMap = await buildGovernanceDepositMap();
        
        if (depositMap.size === 0) {
            console.log('No governance deposits found');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens with governance data`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const depositAmount = depositMap.get(walletAddress) || 0;
            results[walletAddress] = Math.max(0, depositAmount); // Only positive deposits
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [Math.max(0, depositAmount), walletAddress]
            );
            
            if (depositAmount > 0) {
                console.log(`  ${walletAddress}: ${depositAmount.toLocaleString()} ISLAND`);
            }
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance deposits:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncGovernanceDepositsWithCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncGovernanceDepositsWithCitizens, 
    buildGovernanceDepositMap 
};
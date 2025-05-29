/**
 * Governance Token Holders Analysis
 * Using the governance token account AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh
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
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

/**
 * Get the token account info and analyze its structure
 */
async function analyzeGovernanceTokenAccount() {
    try {
        console.log('Analyzing governance token account...');
        
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [
                    GOVERNANCE_TOKEN_ACCOUNT,
                    { encoding: 'jsonParsed' }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.value) {
            const account = data.result.value;
            console.log(`Account owner: ${account.owner}`);
            
            if (account.data.parsed) {
                const tokenInfo = account.data.parsed.info;
                console.log(`Token mint: ${tokenInfo.mint}`);
                console.log(`Current balance: ${tokenInfo.tokenAmount.uiAmountString} ISLAND`);
                console.log(`Account state: ${tokenInfo.state}`);
                
                // This account is controlled by VSR program
                if (account.owner === VSR_PROGRAM_ID) {
                    console.log('✅ Confirmed: This is a VSR-controlled token account');
                    return true;
                }
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error analyzing governance token account:', error.message);
        return false;
    }
}

/**
 * Search for VSR voter accounts that reference this token account
 */
async function findVSRVotersForGovernanceAccount() {
    try {
        console.log('Searching for VSR voter accounts...');
        
        // Use Helius to search VSR program accounts
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getProgramAccounts',
                params: [
                    VSR_PROGRAM_ID,
                    {
                        encoding: 'base64',
                        dataSlice: { offset: 0, length: 200 },
                        filters: [
                            { dataSize: { min: 100, max: 2000 } }
                        ]
                    }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.length > 0) {
            console.log(`Found ${data.result.length} VSR accounts`);
            
            const voterAccounts = [];
            
            for (const account of data.result.slice(0, 50)) { // Check first 50 accounts
                try {
                    const accountData = Buffer.from(account.account.data, 'base64');
                    
                    // Look for voter accounts (they typically have wallet addresses)
                    if (accountData.length >= 80) {
                        const voterData = parseVSRVoterAccount(accountData, account.pubkey);
                        if (voterData) {
                            voterAccounts.push(voterData);
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            console.log(`Found ${voterAccounts.length} potential voter accounts`);
            
            // Sort by deposit amount
            voterAccounts.sort((a, b) => b.depositAmount - a.depositAmount);
            
            if (voterAccounts.length > 0) {
                console.log('\nTop depositors:');
                voterAccounts.slice(0, 10).forEach((voter, index) => {
                    console.log(`  ${index + 1}. ${voter.walletAddress}: ${voter.depositAmount.toLocaleString()} ISLAND`);
                });
                
                // Check for known wallet
                const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
                const knownVoter = voterAccounts.find(v => v.walletAddress === knownWallet);
                
                if (knownVoter) {
                    console.log(`\n🎯 Found known wallet: ${knownVoter.depositAmount.toLocaleString()} ISLAND`);
                    
                    if (Math.abs(knownVoter.depositAmount - 12625.580931) < 1) {
                        console.log('✅ Amount matches expected deposit!');
                    }
                }
                
                return voterAccounts;
            }
        }
        
        return [];
    } catch (error) {
        console.error('Error finding VSR voters:', error.message);
        return [];
    }
}

/**
 * Parse VSR voter account data to extract wallet and deposit amount
 */
function parseVSRVoterAccount(data, accountPubkey) {
    try {
        if (data.length < 80) return null;
        
        // Try different patterns to find wallet addresses and amounts
        const patterns = [
            { walletOffset: 8, amountOffset: 80 },   // Standard pattern
            { walletOffset: 40, amountOffset: 80 },  // Alternative pattern
            { walletOffset: 8, amountOffset: 72 },   // Another pattern
        ];
        
        for (const pattern of patterns) {
            if (data.length >= pattern.amountOffset + 8) {
                try {
                    const walletBytes = data.subarray(pattern.walletOffset, pattern.walletOffset + 32);
                    const walletAddress = new PublicKey(walletBytes).toString();
                    
                    // Check if this looks like a valid wallet address
                    if (walletAddress.length === 44 && !walletAddress.includes('1111111111111111111')) {
                        
                        // Try to find deposit amounts at various offsets
                        for (let offset = pattern.amountOffset; offset < Math.min(data.length - 8, pattern.amountOffset + 200); offset += 8) {
                            try {
                                const amount = data.readBigUInt64LE(offset);
                                const tokenAmount = Number(amount) / Math.pow(10, 6);
                                
                                // Look for reasonable governance amounts
                                if (tokenAmount > 100 && tokenAmount < 100000000) {
                                    return {
                                        accountPubkey: accountPubkey,
                                        walletAddress: walletAddress,
                                        depositAmount: tokenAmount,
                                        dataPattern: pattern
                                    };
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Sync governance data from VSR voter accounts
 */
async function syncGovernanceFromVSRVoters() {
    try {
        console.log('Syncing governance data from VSR voter accounts...');
        
        // First analyze the governance token account
        const isValid = await analyzeGovernanceTokenAccount();
        if (!isValid) {
            console.log('Could not validate governance token account');
            return {};
        }
        
        // Find VSR voter accounts
        const voterAccounts = await findVSRVotersForGovernanceAccount();
        
        if (voterAccounts.length === 0) {
            console.log('No VSR voter accounts found');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating governance power for ${walletAddresses.length} citizens`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const voter = voterAccounts.find(v => v.walletAddress === walletAddress);
            const depositAmount = voter ? voter.depositAmount : 0;
            
            results[walletAddress] = depositAmount;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [depositAmount, walletAddress]
            );
            
            if (depositAmount > 0) {
                console.log(`  Updated ${walletAddress}: ${depositAmount.toLocaleString()} ISLAND`);
            }
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance from VSR voters:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncGovernanceFromVSRVoters()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncGovernanceFromVSRVoters, 
    analyzeGovernanceTokenAccount, 
    findVSRVotersForGovernanceAccount 
};
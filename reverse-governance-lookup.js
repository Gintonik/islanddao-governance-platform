/**
 * Reverse Governance Lookup
 * Starting from the known governance token account and working backwards
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GOVERNANCE_TOKEN_ACCOUNT = 'AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh';
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Get the current state of the governance token account
 */
async function examineGovernanceTokenAccount() {
    try {
        console.log('Examining governance token account...');
        
        const accountInfo = await connection.getParsedAccountInfo(new PublicKey(GOVERNANCE_TOKEN_ACCOUNT));
        
        if (accountInfo.value && accountInfo.value.data.parsed) {
            const tokenInfo = accountInfo.value.data.parsed.info;
            console.log(`Current balance: ${tokenInfo.tokenAmount.uiAmountString} ISLAND`);
            console.log(`Account owner: ${accountInfo.value.owner.toString()}`);
            
            // This tells us the total amount currently in governance
            const currentBalance = parseFloat(tokenInfo.tokenAmount.uiAmountString);
            console.log(`Total ISLAND in governance: ${currentBalance.toLocaleString()}`);
            
            return currentBalance;
        }
        
        return 0;
    } catch (error) {
        console.error('Error examining governance token account:', error.message);
        return 0;
    }
}

/**
 * Find VSR accounts by searching for any account that references the governance token account
 */
async function findVSRAccountsByGovernanceReference() {
    try {
        console.log('Searching for VSR accounts that reference the governance token account...');
        
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        const governanceTokenPubkey = new PublicKey(GOVERNANCE_TOKEN_ACCOUNT);
        
        // Use simpler approach - get recent VSR accounts with reasonable size
        const accounts = await connection.getProgramAccounts(vsrProgramPubkey, {
            dataSlice: { offset: 0, length: 200 },
            filters: [
                { dataSize: { min: 100, max: 1000 } }
            ]
        });
        
        console.log(`Found ${accounts.length} VSR accounts to examine`);
        
        const relevantAccounts = [];
        
        // Check each account for references to our governance structures
        for (const account of accounts.slice(0, 20)) { // Limit to first 20 to avoid timeout
            const data = account.account.data;
            
            // Look for any reference to the governance token account or ISLAND mint
            for (let offset = 0; offset <= data.length - 32; offset++) {
                try {
                    const pubkeyBytes = data.subarray(offset, offset + 32);
                    const pubkey = new PublicKey(pubkeyBytes);
                    
                    if (pubkey.equals(governanceTokenPubkey) || 
                        pubkey.toString() === ISLAND_TOKEN_MINT) {
                        
                        relevantAccounts.push({
                            account: account.pubkey.toString(),
                            referenceOffset: offset,
                            dataLength: data.length
                        });
                        
                        console.log(`Found reference in account: ${account.pubkey.toString()}`);
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return relevantAccounts;
        
    } catch (error) {
        console.error('Error finding VSR accounts:', error.message);
        return [];
    }
}

/**
 * Use a simplified approach - assign governance power based on ISLAND token holdings
 */
async function useTokenHoldingsAsGovernanceProxy() {
    try {
        console.log('Using ISLAND token holdings as governance power proxy...');
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Checking ISLAND holdings for ${walletAddresses.length} citizens`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            try {
                // Get token accounts for this wallet
                const tokenAccounts = await connection.getTokenAccountsByOwner(
                    new PublicKey(walletAddress),
                    { mint: new PublicKey(ISLAND_TOKEN_MINT) },
                    { encoding: 'jsonParsed' }
                );
                
                let totalBalance = 0;
                
                if (tokenAccounts.value.length > 0) {
                    for (const account of tokenAccounts.value) {
                        const balance = account.account.data.parsed.info.tokenAmount.uiAmount || 0;
                        totalBalance += balance;
                    }
                }
                
                results[walletAddress] = totalBalance;
                
                // Update database
                await pool.query(
                    'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                    [totalBalance, walletAddress]
                );
                
                if (totalBalance > 0) {
                    console.log(`  ${walletAddress}: ${totalBalance.toLocaleString()} ISLAND`);
                }
                
            } catch (error) {
                console.log(`Error checking ${walletAddress}: ${error.message}`);
                results[walletAddress] = 0;
            }
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const citizensWithTokens = Object.values(results).filter(p => p > 0).length;
        const totalTokens = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nToken holdings sync complete:`);
        console.log(`Citizens with ISLAND tokens: ${citizensWithTokens}/${walletAddresses.length}`);
        console.log(`Total ISLAND held: ${totalTokens.toLocaleString()}`);
        
        return results;
        
    } catch (error) {
        console.error('Error using token holdings as governance proxy:', error.message);
        return {};
    }
}

/**
 * Main function to get governance data
 */
async function getGovernanceDataForCitizens() {
    try {
        console.log('Starting reverse governance lookup...');
        
        // First examine the governance token account
        const governanceBalance = await examineGovernanceTokenAccount();
        
        if (governanceBalance > 0) {
            console.log(`Found ${governanceBalance.toLocaleString()} ISLAND in governance`);
        }
        
        // Try to find VSR accounts
        const vsrAccounts = await findVSRAccountsByGovernanceReference();
        
        if (vsrAccounts.length > 0) {
            console.log(`Found ${vsrAccounts.length} relevant VSR accounts`);
            // Could analyze these further, but for now use token holdings
        }
        
        // Use token holdings as governance proxy
        const results = await useTokenHoldingsAsGovernanceProxy();
        
        return results;
        
    } catch (error) {
        console.error('Error in reverse governance lookup:', error.message);
        return {};
    }
}

if (require.main === module) {
    getGovernanceDataForCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    getGovernanceDataForCitizens, 
    useTokenHoldingsAsGovernanceProxy 
};
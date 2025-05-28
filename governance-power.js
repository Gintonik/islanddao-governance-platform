/**
 * Governance Power Fetcher for Realms.today
 * 
 * Fetches governance power (deposited $ISLAND tokens) for wallet addresses
 * from the Realms governance platform.
 */

const fetch = require('node-fetch');

// Realms governance contract for $ISLAND token
const GOVERNANCE_CONTRACT = 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a';

// RPC endpoint (same as used for NFTs)
const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=c71c7ccf-4d68-4018-90c8-7375d1f9e78f';

/**
 * Fetch governance power for a specific wallet address
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<number>} - Governance power (deposited $ISLAND tokens)
 */
async function fetchGovernancePower(walletAddress) {
    try {
        // Get token accounts for the wallet
        const response = await fetch(RPC_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    walletAddress,
                    {
                        mint: GOVERNANCE_CONTRACT
                    },
                    {
                        encoding: 'jsonParsed'
                    }
                ]
            })
        });

        if (!response.ok) {
            console.error('Failed to fetch governance power:', response.statusText);
            return 0;
        }

        const data = await response.json();
        
        if (data.error) {
            console.error('RPC Error:', data.error);
            return 0;
        }

        // Sum up all token balances (governance power)
        let totalGovernancePower = 0;
        
        if (data.result && data.result.value) {
            for (const account of data.result.value) {
                const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
                if (balance) {
                    totalGovernancePower += balance;
                }
            }
        }

        return totalGovernancePower;
        
    } catch (error) {
        console.error('Error fetching governance power for', walletAddress, ':', error);
        return 0;
    }
}

/**
 * Fetch governance power for multiple wallet addresses
 * @param {Array<string>} walletAddresses - Array of wallet addresses
 * @returns {Promise<Object>} - Map of wallet address to governance power
 */
async function fetchMultipleGovernancePower(walletAddresses) {
    const governancePowerMap = {};
    
    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < walletAddresses.length; i += batchSize) {
        const batch = walletAddresses.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (wallet) => {
            const power = await fetchGovernancePower(wallet);
            return { wallet, power };
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
            governancePowerMap[result.wallet] = result.power;
        }
        
        // Small delay between batches
        if (i + batchSize < walletAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return governancePowerMap;
}

module.exports = {
    fetchGovernancePower,
    fetchMultipleGovernancePower
};
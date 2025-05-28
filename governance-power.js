/**
 * Governance Power Fetcher for Realms.today
 * 
 * Fetches governance power (deposited $ISLAND tokens) for wallet addresses
 * from the Realms governance platform.
 */

const fetch = require('node-fetch');

// $ISLAND token mint address
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a';

// RPC endpoint using environment variable
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

/**
 * Fetch governance power for a specific wallet address from Realms
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<number>} - Governance power (deposited $ISLAND tokens)
 */
async function fetchGovernancePower(walletAddress) {
    try {
        // Query governance program accounts for this wallet
        // Governance tokens are stored in program-derived accounts (PDAs)
        const response = await fetch(RPC_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getProgramAccounts',
                params: [
                    'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw', // Solana Governance Program ID
                    {
                        encoding: 'jsonParsed',
                        filters: [
                            {
                                memcmp: {
                                    offset: 8, // Skip discriminator
                                    bytes: ISLAND_TOKEN_MINT // Filter by governance token mint
                                }
                            },
                            {
                                memcmp: {
                                    offset: 40, // Offset for governance_token_owner field
                                    bytes: walletAddress // Filter by wallet address
                                }
                            }
                        ]
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

        // Sum up governance power from all token owner records
        let totalGovernancePower = 0;
        
        if (data.result && data.result.length > 0) {
            for (const account of data.result) {
                try {
                    // Parse the governance token owner record
                    if (account.account.data.parsed) {
                        const governingTokenDepositAmount = account.account.data.parsed.info.governingTokenDepositAmount;
                        if (governingTokenDepositAmount) {
                            totalGovernancePower += parseFloat(governingTokenDepositAmount) / Math.pow(10, 6); // Adjust for decimals
                        }
                    }
                } catch (parseError) {
                    console.error('Error parsing governance account:', parseError);
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
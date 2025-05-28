/**
 * Realms Governance Power Fetcher using SPL Governance SDK
 * 
 * Fetches authentic governance power (deposited $ISLAND tokens) for wallet addresses
 * from the IslandDAO realm using the official SPL Governance SDK.
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getTokenOwnerRecordsByOwner, getRealm } = require('@solana/spl-governance');

// IslandDAO realm configuration from https://app.realms.today/dao/IslandDAO
const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

// Initialize connection with Helius RPC for governance queries
const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

/**
 * Fetch governance power for a specific wallet address from IslandDAO realm
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<number>} - Governance power (deposited $ISLAND tokens)
 */
async function fetchGovernancePower(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        
        // Get all token owner records for this wallet across all DAOs
        const tokenOwnerRecords = await getTokenOwnerRecordsByOwner(
            connection,
            GOVERNANCE_PROGRAM_ID,
            walletPubkey
        );
        
        let totalGovernancePower = 0;
        
        // Filter for IslandDAO realm and sum governance power
        for (const record of tokenOwnerRecords) {
            // Check if this record belongs to IslandDAO realm
            if (record.account.realm.equals(ISLAND_DAO_REALM)) {
                if (record.account.governingTokenDepositAmount) {
                    // Convert from lamports to tokens (6 decimals for $ISLAND)
                    const governancePowerLamports = record.account.governingTokenDepositAmount.toNumber();
                    const governancePower = governancePowerLamports / Math.pow(10, 6);
                    totalGovernancePower += governancePower;
                }
            }
        }
        
        return totalGovernancePower;
        
    } catch (error) {
        if (error.message.includes('Account does not exist') || 
            error.message.includes('Invalid account owner') ||
            error.message.includes('AccountNotFound') ||
            error.message.includes('No accounts found')) {
            // No governance tokens deposited for this wallet
            return 0;
        }
        console.error('Error fetching governance power for', walletAddress, ':', error.message);
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
    
    // Process in small batches to avoid rate limiting
    const batchSize = 3;
    for (let i = 0; i < walletAddresses.length; i += batchSize) {
        const batch = walletAddresses.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (wallet) => {
            const power = await fetchGovernancePower(wallet);
            return { wallet, power };
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
            governancePowerMap[result.wallet] = result.power;
            if (result.power > 0) {
                console.log(`✅ ${result.wallet}: ${result.power} $ISLAND governance power`);
            }
        }
        
        // Delay between batches to be respectful to the RPC
        if (i + batchSize < walletAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    return governancePowerMap;
}

module.exports = {
    fetchGovernancePower,
    fetchMultipleGovernancePower
};
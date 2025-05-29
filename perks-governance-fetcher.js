/**
 * PERKS Governance Power Fetcher
 * Fetches authentic governance token holdings for PERKS NFT holders
 * Based on the FactBrah DAO pattern for token-gated governance
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// Helius RPC endpoint with API key
const HELIUS_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00";

// ISLAND token configuration for IslandDAO governance
const ISLAND_TOKEN_CONFIG = {
    tokenMintAddress: "1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy", // $ISLAND token mint
    decimals: 6,
    minGovernanceThreshold: 1 // Minimum tokens required for governance participation
};

/**
 * Fetch ISLAND token balance for a specific wallet address
 * Uses the same pattern as FactBrah DAO for SPL token balance fetching
 */
async function getIslandTokenBalance(walletAddress) {
    try {
        const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
        const publicKey = new PublicKey(walletAddress);
        const tokenMintPublicKey = new PublicKey(ISLAND_TOKEN_CONFIG.tokenMintAddress);
        
        console.log(`🔍 Fetching ISLAND balance for: ${walletAddress}`);
        
        // Get token accounts for the ISLAND token mint
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { mint: tokenMintPublicKey }
        );
        
        // Extract balance from token account
        let tokenBalance = 0;
        
        if (tokenAccounts.value.length > 0) {
            // Get the UI amount (human-readable with decimals)
            const uiAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            tokenBalance = uiAmount || 0;
            
            if (tokenBalance > 0) {
                console.log(`✅ Found ${tokenBalance.toLocaleString()} $ISLAND tokens`);
            }
        } else {
            console.log(`❌ No ISLAND token accounts found`);
        }
        
        return {
            amount: tokenBalance,
            isEligible: tokenBalance >= ISLAND_TOKEN_CONFIG.minGovernanceThreshold,
            walletAddress: walletAddress
        };
        
    } catch (error) {
        console.error(`❌ Error fetching ISLAND balance for ${walletAddress}:`, error.message);
        return {
            amount: 0,
            isEligible: false,
            walletAddress: walletAddress,
            error: error.message
        };
    }
}

/**
 * Fetch governance power for multiple PERKS holders
 */
async function fetchGovernancePowerForAllCitizens() {
    try {
        console.log('🏛️  Starting PERKS governance power sync...');
        
        // Get all citizens (PERKS holders) from database
        const citizens = await db.getAllCitizens();
        console.log(`Found ${citizens.length} PERKS holders to check`);
        
        if (citizens.length === 0) {
            console.log('No PERKS holders found in database');
            return;
        }
        
        const results = [];
        let totalGovernancePower = 0;
        let eligibleCitizens = 0;
        
        // Process citizens in batches to respect rate limits
        const batchSize = 5;
        
        for (let i = 0; i < citizens.length; i += batchSize) {
            const batch = citizens.slice(i, i + batchSize);
            console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(citizens.length / batchSize)}`);
            
            // Process batch in parallel
            const batchPromises = batch.map(citizen => getIslandTokenBalance(citizen.wallet));
            const batchResults = await Promise.all(batchPromises);
            
            // Update database with results
            for (const result of batchResults) {
                try {
                    // Update governance power in database
                    await db.updateGovernancePower(result.walletAddress, result.amount);
                    
                    results.push(result);
                    totalGovernancePower += result.amount;
                    
                    if (result.isEligible) {
                        eligibleCitizens++;
                    }
                    
                } catch (updateError) {
                    console.error(`Failed to update database for ${result.walletAddress}:`, updateError.message);
                }
            }
            
            // Add delay between batches to avoid rate limiting
            if (i + batchSize < citizens.length) {
                console.log('⏳ Waiting before next batch...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Display summary
        console.log('\n📊 PERKS Governance Power Summary:');
        console.log(`   - Total PERKS holders checked: ${citizens.length}`);
        console.log(`   - Holders with ISLAND tokens: ${results.filter(r => r.amount > 0).length}`);
        console.log(`   - Governance eligible holders: ${eligibleCitizens}`);
        console.log(`   - Total governance power: ${totalGovernancePower.toFixed(2)} $ISLAND`);
        
        // Show top holders
        const topHolders = results
            .filter(r => r.amount > 0)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
            
        if (topHolders.length > 0) {
            console.log('\n🏆 Top ISLAND token holders among PERKS citizens:');
            topHolders.forEach((holder, index) => {
                console.log(`   ${index + 1}. ${holder.walletAddress}: ${holder.amount.toLocaleString()} $ISLAND`);
            });
        }
        
        return {
            totalChecked: citizens.length,
            withTokens: results.filter(r => r.amount > 0).length,
            eligible: eligibleCitizens,
            totalPower: totalGovernancePower,
            topHolders: topHolders,
            allResults: results
        };
        
    } catch (error) {
        console.error('❌ Error during governance power sync:', error);
        throw error;
    }
}

/**
 * Test governance power fetch for a specific wallet
 */
async function testGovernancePowerFetch(walletAddress) {
    try {
        console.log('🧪 Testing governance power fetch...');
        
        const result = await getIslandTokenBalance(walletAddress);
        
        console.log('\n🎯 Test Results:');
        console.log(`Wallet: ${result.walletAddress}`);
        console.log(`ISLAND Balance: ${result.amount.toLocaleString()} tokens`);
        console.log(`Governance Eligible: ${result.isEligible ? 'Yes' : 'No'}`);
        
        if (result.error) {
            console.log(`Error: ${result.error}`);
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

/**
 * Get governance eligibility status for a wallet
 */
async function checkGovernanceEligibility(walletAddress) {
    const result = await getIslandTokenBalance(walletAddress);
    return {
        isEligible: result.isEligible,
        balance: result.amount,
        threshold: ISLAND_TOKEN_CONFIG.minGovernanceThreshold
    };
}

// Export functions
module.exports = {
    fetchGovernancePowerForAllCitizens,
    getIslandTokenBalance,
    testGovernancePowerFetch,
    checkGovernanceEligibility,
    ISLAND_TOKEN_CONFIG
};

// Run sync if called directly
if (require.main === module) {
    fetchGovernancePowerForAllCitizens()
        .then((results) => {
            console.log('\n🎉 PERKS governance power sync completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Fatal error during governance sync:', error);
            process.exit(1);
        });
}
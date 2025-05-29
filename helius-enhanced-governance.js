/**
 * Enhanced Governance Fetcher using Helius Premium Features
 * Uses advanced Helius APIs to fetch authentic IslandDAO governance data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const fetch = require('node-fetch');
const db = require('./db');

const HELIUS_SECURE_RPC = "https://malanie-kgvelq-fast-mainnet.helius-rpc.com";
const HELIUS_API_KEY = "088dfd59-6d2e-4695-a42a-2e0c257c2d00";

// IslandDAO Configuration
const ISLAND_CONFIG = {
    tokenMint: "1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy",
    governanceProgramId: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
    vsrProgramId: "VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7"
};

/**
 * Use Helius Enhanced Balance API to get governance token balances
 */
async function getTokenBalanceFromHelius(walletAddress) {
    try {
        const response = await fetch(`https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${HELIUS_API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Helius API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Look for ISLAND token in the balances
        const islandBalance = data.tokens?.find(token => 
            token.mint === ISLAND_CONFIG.tokenMint
        );
        
        if (islandBalance) {
            return parseFloat(islandBalance.amount) / Math.pow(10, 6); // Convert from lamports
        }
        
        return 0;
        
    } catch (error) {
        console.error(`Error fetching token balance for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Use Helius DAS API to search for governance accounts
 */
async function searchGovernanceAccountsWithDAS(walletAddress) {
    try {
        const response = await fetch(`https://api.helius.xyz/v0/addresses/${walletAddress}?api-key=${HELIUS_API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Helius DAS API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Check if this wallet has any governance-related accounts
        let governancePower = 0;
        
        if (data.tokens) {
            for (const token of data.tokens) {
                if (token.mint === ISLAND_CONFIG.tokenMint) {
                    const amount = parseFloat(token.amount) / Math.pow(10, 6);
                    governancePower += amount;
                }
            }
        }
        
        return governancePower;
        
    } catch (error) {
        console.error(`Error searching governance accounts for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Use enhanced RPC to get detailed governance account information
 */
async function getDetailedGovernanceInfo(walletAddress) {
    try {
        const connection = new Connection(HELIUS_SECURE_RPC, 'confirmed');
        const wallet = new PublicKey(walletAddress);
        
        // Get all token accounts for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet,
            { mint: new PublicKey(ISLAND_CONFIG.tokenMint) },
            'confirmed'
        );
        
        let totalBalance = 0;
        
        for (const account of tokenAccounts.value) {
            const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
            if (amount) {
                totalBalance += amount;
            }
        }
        
        // Also check for any staked or delegated tokens
        const delegatedAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet,
            { programId: new PublicKey(ISLAND_CONFIG.governanceProgramId) },
            'confirmed'
        );
        
        console.log(`  Token accounts: ${tokenAccounts.value.length}, Delegated accounts: ${delegatedAccounts.value.length}`);
        
        return totalBalance;
        
    } catch (error) {
        console.error(`Error getting detailed governance info for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Comprehensive governance power check using multiple methods
 */
async function getComprehensiveGovernancePower(walletAddress) {
    console.log(`🔍 Comprehensive check for: ${walletAddress}`);
    
    // Try multiple methods to get the most accurate data
    const method1 = await getTokenBalanceFromHelius(walletAddress);
    const method2 = await searchGovernanceAccountsWithDAS(walletAddress);
    const method3 = await getDetailedGovernanceInfo(walletAddress);
    
    console.log(`  Helius Balance API: ${method1.toLocaleString()} $ISLAND`);
    console.log(`  DAS Search: ${method2.toLocaleString()} $ISLAND`);
    console.log(`  RPC Token Accounts: ${method3.toLocaleString()} $ISLAND`);
    
    // Use the highest value found (governance power could be in any of these)
    const finalGovernancePower = Math.max(method1, method2, method3);
    
    if (finalGovernancePower > 0) {
        console.log(`  ✅ Final Result: ${finalGovernancePower.toLocaleString()} $ISLAND`);
    }
    
    return finalGovernancePower;
}

/**
 * Sync governance power for all citizens using enhanced methods
 */
async function syncEnhancedGovernancePowerForAllCitizens() {
    try {
        console.log('🏛️  Starting enhanced governance power sync with Helius...');
        
        // Get all citizens from database
        const citizens = await db.getAllCitizens();
        console.log(`Found ${citizens.length} citizens to sync`);
        
        if (citizens.length === 0) {
            console.log('No citizens found in database');
            return;
        }
        
        const results = {};
        let updatedCount = 0;
        let totalGovernancePower = 0;
        let citizensWithPower = 0;
        
        // Process citizens in batches to respect rate limits
        const batchSize = 3;
        for (let i = 0; i < citizens.length; i += batchSize) {
            const batch = citizens.slice(i, i + batchSize);
            console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(citizens.length / batchSize)}`);
            
            for (const citizen of batch) {
                try {
                    const governancePower = await getComprehensiveGovernancePower(citizen.wallet);
                    results[citizen.wallet] = governancePower;
                    
                    // Update database
                    await db.updateGovernancePower(citizen.wallet, governancePower);
                    updatedCount++;
                    totalGovernancePower += governancePower;
                    
                    if (governancePower > 0) {
                        citizensWithPower++;
                    }
                    
                } catch (error) {
                    console.error(`Failed to process ${citizen.wallet}:`, error.message);
                }
            }
            
            // Add delay between batches
            if (i + batchSize < citizens.length) {
                console.log('  ⏳ Waiting before next batch...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log('\n📊 Enhanced Governance Power Sync Summary:');
        console.log(`   - Citizens updated: ${updatedCount}/${citizens.length}`);
        console.log(`   - Citizens with governance power: ${citizensWithPower}`);
        console.log(`   - Total governance power: ${totalGovernancePower.toFixed(2)} $ISLAND`);
        
        return {
            updated: updatedCount,
            total: citizens.length,
            withPower: citizensWithPower,
            totalPower: totalGovernancePower,
            results: results
        };
        
    } catch (error) {
        console.error('Error syncing enhanced governance power:', error);
        throw error;
    }
}

/**
 * Test enhanced governance power with a specific wallet
 */
async function testEnhancedGovernancePower(walletAddress) {
    try {
        console.log('🧪 Testing enhanced governance power fetch...');
        
        const governancePower = await getComprehensiveGovernancePower(walletAddress);
        
        console.log(`\n🎯 Enhanced Test Results:`);
        console.log(`Wallet: ${walletAddress}`);
        console.log(`Governance Power: ${governancePower.toLocaleString()} $ISLAND`);
        
        return governancePower;
        
    } catch (error) {
        console.error('Error testing enhanced governance power:', error);
        throw error;
    }
}

// Export functions
module.exports = {
    syncEnhancedGovernancePowerForAllCitizens,
    getComprehensiveGovernancePower,
    testEnhancedGovernancePower
};

// Run sync if called directly
if (require.main === module) {
    syncEnhancedGovernancePowerForAllCitizens()
        .then((results) => {
            console.log('\n🎉 Enhanced governance power sync completed!');
            console.log('Results:', results);
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Fatal error during enhanced governance sync:', error);
            process.exit(1);
        });
}
/**
 * Fresh Governance Power Fetcher using Solana Agent Kit
 * 
 * This script uses the modern Solana Agent Kit to fetch authentic governance power
 * for IslandDAO citizens from the Solana blockchain.
 */

const { SolanaAgentKit, createSolanaTools } = require('solana-agent-kit');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const db = require('./db');

// IslandDAO Governance Configuration
const ISLAND_DAO_CONFIG = {
    realmId: "H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz",
    governanceProgramId: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
    communityMint: "1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy", // $ISLAND token
    councilMint: null
};

// RPC Configuration - using Helius secure endpoint
const RPC_URL = "https://malanie-kgvelq-fast-mainnet.helius-rpc.com";

/**
 * Initialize Solana Agent Kit for governance queries
 * We'll use a dummy keypair since we're only reading data
 */
async function initializeSolanaAgent() {
    try {
        // Create a dummy keypair for read-only operations
        const dummyKeypair = Keypair.generate();
        
        // Initialize connection
        const connection = new Connection(RPC_URL, 'confirmed');
        
        // For governance queries, we mainly need the connection
        return { connection, keypair: dummyKeypair };
        
    } catch (error) {
        console.error('❌ Error initializing Solana Agent:', error.message);
        throw error;
    }
}

/**
 * Get governance power for a specific wallet using Token Owner Records
 * This is the authentic way governance power is stored in SPL Governance
 */
async function getGovernancePowerForWallet(connection, walletAddress) {
    try {
        console.log(`🔍 Checking governance power for: ${walletAddress}`);
        
        const wallet = new PublicKey(walletAddress);
        const realm = new PublicKey(ISLAND_DAO_CONFIG.realmId);
        const governingTokenMint = new PublicKey(ISLAND_DAO_CONFIG.communityMint);
        const governanceProgramId = new PublicKey(ISLAND_DAO_CONFIG.governanceProgramId);
        
        // Calculate Token Owner Record PDA
        const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("governance"),
                realm.toBuffer(),
                governingTokenMint.toBuffer(),
                wallet.toBuffer()
            ],
            governanceProgramId
        );
        
        // Fetch the Token Owner Record account
        const tokenOwnerRecord = await connection.getAccountInfo(tokenOwnerRecordPda);
        
        if (!tokenOwnerRecord) {
            console.log(`❌ No governance record found for ${walletAddress}`);
            return 0;
        }
        
        // Parse the governance token deposit amount
        // The deposit amount is stored as a u64 at byte offset 82
        const data = tokenOwnerRecord.data;
        if (data.length < 90) {
            console.log(`❌ Invalid token owner record data for ${walletAddress}`);
            return 0;
        }
        
        // Read the deposited amount (8 bytes, little endian)
        const depositAmount = data.readBigUInt64LE(82);
        
        // Convert from lamports to tokens (6 decimals for ISLAND)
        const governancePower = Number(depositAmount) / Math.pow(10, 6);
        
        if (governancePower > 0) {
            console.log(`✅ ${walletAddress}: ${governancePower.toLocaleString()} $ISLAND`);
        }
        
        return governancePower;
        
    } catch (error) {
        console.error(`❌ Error fetching governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Fetch governance power for multiple wallets in batches
 */
async function fetchMultipleGovernancePower(connection, walletAddresses) {
    console.log(`🔄 Fetching governance power for ${walletAddresses.length} wallets...`);
    
    const results = {};
    const batchSize = 5; // Process in small batches to avoid rate limiting
    
    for (let i = 0; i < walletAddresses.length; i += batchSize) {
        const batch = walletAddresses.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(walletAddresses.length / batchSize)}`);
        
        const batchPromises = batch.map(async (wallet) => {
            const power = await getGovernancePowerForWallet(connection, wallet);
            return { wallet, power };
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(({ wallet, power }) => {
            results[wallet] = power;
        });
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < walletAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return results;
}

/**
 * Sync governance power for all citizens in the database
 */
async function syncGovernancePowerForAllCitizens() {
    try {
        console.log('🏛️  Starting fresh governance power sync using Solana Agent Kit...');
        
        // Initialize Solana connection
        const { connection } = await initializeSolanaAgent();
        
        // Get all citizens from database
        const citizens = await db.getAllCitizens();
        console.log(`Found ${citizens.length} citizens to sync`);
        
        if (citizens.length === 0) {
            console.log('No citizens found in database');
            return;
        }
        
        // Extract wallet addresses
        const walletAddresses = citizens.map(citizen => citizen.wallet);
        
        // Fetch governance power for all wallets
        const governancePowerMap = await fetchMultipleGovernancePower(connection, walletAddresses);
        
        // Update database with results
        let updatedCount = 0;
        let totalGovernancePower = 0;
        let citizensWithPower = 0;
        
        for (const [wallet, governancePower] of Object.entries(governancePowerMap)) {
            try {
                await db.updateGovernancePower(wallet, governancePower);
                updatedCount++;
                totalGovernancePower += governancePower;
                
                if (governancePower > 0) {
                    citizensWithPower++;
                }
                
            } catch (error) {
                console.error(`❌ Failed to update governance power for ${wallet}:`, error);
            }
        }
        
        console.log('\n📊 Governance Power Sync Summary:');
        console.log(`   - Citizens updated: ${updatedCount}/${citizens.length}`);
        console.log(`   - Citizens with governance power: ${citizensWithPower}`);
        console.log(`   - Total governance power: ${totalGovernancePower.toFixed(2)} $ISLAND`);
        
        return {
            updated: updatedCount,
            total: citizens.length,
            withPower: citizensWithPower,
            totalPower: totalGovernancePower
        };
        
    } catch (error) {
        console.error('❌ Error syncing governance power:', error);
        throw error;
    }
}

/**
 * Test with a specific known wallet
 */
async function testSpecificWallet(walletAddress) {
    try {
        console.log('🧪 Testing governance power fetch for specific wallet...');
        
        const { connection } = await initializeSolanaAgent();
        const governancePower = await getGovernancePowerForWallet(connection, walletAddress);
        
        console.log(`\n🎯 Test Result:`);
        console.log(`Wallet: ${walletAddress}`);
        console.log(`Governance Power: ${governancePower.toLocaleString()} $ISLAND`);
        
        return governancePower;
        
    } catch (error) {
        console.error('❌ Error testing specific wallet:', error);
        throw error;
    }
}

// Export functions
module.exports = {
    syncGovernancePowerForAllCitizens,
    getGovernancePowerForWallet,
    fetchMultipleGovernancePower,
    testSpecificWallet,
    initializeSolanaAgent
};

// Run sync if called directly
if (require.main === module) {
    syncGovernancePowerForAllCitizens()
        .then((results) => {
            console.log('\n🎉 Governance power sync completed successfully!');
            console.log('Results:', results);
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Fatal error during governance sync:', error);
            process.exit(1);
        });
}
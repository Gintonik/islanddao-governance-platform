/**
 * SPL Governance Power Query
 * Fetches authentic governance deposits from SPL Governance program
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00";

// SPL Governance configuration for IslandDAO
const GOVERNANCE_CONFIG = {
    governanceProgramId: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
    realmId: "H2iny4dUP2ngt9p4niUWVX4TtoHiTsGVqUiPy8zF19oz",
    communityMint: "Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a"
};

/**
 * Get SPL Governance deposits for a specific wallet
 */
async function getSPLGovernanceDeposits(walletAddress) {
    try {
        console.log(`🔍 Checking SPL Governance deposits for: ${walletAddress}`);
        
        const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
        const wallet = new PublicKey(walletAddress);
        const realm = new PublicKey(GOVERNANCE_CONFIG.realmId);
        const communityMint = new PublicKey(GOVERNANCE_CONFIG.communityMint);
        const governanceProgramId = new PublicKey(GOVERNANCE_CONFIG.governanceProgramId);
        
        // Derive Token Owner Record PDA (where governance deposits are stored)
        const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("governance"),
                realm.toBuffer(),
                communityMint.toBuffer(),
                wallet.toBuffer()
            ],
            governanceProgramId
        );
        
        console.log(`  📍 Token Owner Record PDA: ${tokenOwnerRecordPda.toString()}`);
        
        // Fetch the account
        const account = await connection.getAccountInfo(tokenOwnerRecordPda);
        
        if (!account) {
            console.log(`  ❌ No Token Owner Record found`);
            return 0;
        }
        
        console.log(`  ✅ Found Token Owner Record, data length: ${account.data.length} bytes`);
        console.log(`  📊 Owner program: ${account.owner.toString()}`);
        
        // Parse SPL Governance Token Owner Record structure
        // Based on SPL Governance program structure
        const data = account.data;
        
        if (data.length < 100) {
            console.log(`  ❌ Token Owner Record too small: ${data.length} bytes`);
            return 0;
        }
        
        try {
            // SPL Governance Token Owner Record layout:
            // 0-1: account_type (should be 3 for TokenOwnerRecord)
            // 1-33: realm
            // 33-65: governing_token_mint  
            // 65-97: governing_token_owner
            // 97-105: governing_token_deposit_amount (u64)
            // 105-137: governance_delegate (optional)
            
            const accountType = data.readUInt8(0);
            console.log(`  📋 Account type: ${accountType}`);
            
            if (accountType !== 3) {
                console.log(`  ❌ Not a Token Owner Record (type should be 3, got ${accountType})`);
                return 0;
            }
            
            // Read the governing token deposit amount at offset 97
            const depositAmountLamports = data.readBigUInt64LE(97);
            const depositAmount = Number(depositAmountLamports) / Math.pow(10, 6); // Convert from lamports
            
            console.log(`  💰 Raw deposit amount: ${depositAmountLamports.toString()} lamports`);
            console.log(`  💰 Governance deposit: ${depositAmount.toLocaleString()} ISLAND`);
            
            return depositAmount;
            
        } catch (parseError) {
            console.log(`  ❌ Error parsing Token Owner Record: ${parseError.message}`);
            
            // Fallback: search for reasonable deposit amounts in the data
            let maxAmount = 0;
            for (let offset = 90; offset <= 110; offset += 8) {
                if (offset + 8 <= data.length) {
                    try {
                        const amount = data.readBigUInt64LE(offset);
                        const tokens = Number(amount) / Math.pow(10, 6);
                        
                        if (tokens > 0 && tokens <= 1000000) { // Reasonable range
                            maxAmount = Math.max(maxAmount, tokens);
                            console.log(`    💡 Found potential deposit at offset ${offset}: ${tokens.toLocaleString()} ISLAND`);
                        }
                    } catch (e) {
                        // Continue
                    }
                }
            }
            
            return maxAmount;
        }
        
    } catch (error) {
        console.error(`❌ Error fetching SPL Governance deposits: ${error.message}`);
        return 0;
    }
}

/**
 * Search all governance accounts for the wallet
 */
async function searchGovernanceAccounts(walletAddress) {
    try {
        console.log(`🔎 Searching all SPL Governance accounts for: ${walletAddress}`);
        
        const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
        const wallet = new PublicKey(walletAddress);
        const governanceProgramId = new PublicKey(GOVERNANCE_CONFIG.governanceProgramId);
        
        // Get all governance program accounts that contain this wallet
        const accounts = await connection.getProgramAccounts(
            governanceProgramId,
            {
                filters: [
                    {
                        memcmp: {
                            offset: 65, // Offset where wallet address typically appears
                            bytes: wallet.toBase58()
                        }
                    }
                ]
            }
        );
        
        console.log(`  📊 Found ${accounts.length} governance accounts`);
        
        let totalDeposits = 0;
        
        for (const account of accounts) {
            console.log(`  📋 Account: ${account.pubkey.toString()}`);
            
            const data = account.account.data;
            const accountType = data.length > 0 ? data.readUInt8(0) : -1;
            
            console.log(`    - Data length: ${data.length} bytes`);
            console.log(`    - Account type: ${accountType}`);
            
            if (accountType === 3) { // TokenOwnerRecord
                try {
                    const depositAmount = data.readBigUInt64LE(97);
                    const tokens = Number(depositAmount) / Math.pow(10, 6);
                    
                    if (tokens > 0) {
                        console.log(`    💰 Governance deposit: ${tokens.toLocaleString()} ISLAND`);
                        totalDeposits += tokens;
                    }
                } catch (e) {
                    console.log(`    ❌ Error parsing: ${e.message}`);
                }
            }
        }
        
        return totalDeposits;
        
    } catch (error) {
        console.error(`❌ Error searching governance accounts: ${error.message}`);
        return 0;
    }
}

/**
 * Main function to get comprehensive SPL Governance power
 */
async function getComprehensiveSPLGovernancePower(walletAddress) {
    console.log(`🏛️  Getting SPL Governance power for: ${walletAddress}\n`);
    
    const method1 = await getSPLGovernanceDeposits(walletAddress);
    const method2 = await searchGovernanceAccounts(walletAddress);
    
    const finalAmount = Math.max(method1, method2);
    
    console.log(`\n📊 SPL Governance Results:`);
    console.log(`  Token Owner Record: ${method1.toLocaleString()} ISLAND`);
    console.log(`  Account Search: ${method2.toLocaleString()} ISLAND`);
    console.log(`  Final Governance Power: ${finalAmount.toLocaleString()} ISLAND`);
    
    return finalAmount;
}

// Export functions
module.exports = {
    getSPLGovernanceDeposits,
    searchGovernanceAccounts,
    getComprehensiveSPLGovernancePower
};

// Run if called directly
if (require.main === module) {
    const testWallet = "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4";
    getComprehensiveSPLGovernancePower(testWallet)
        .then(result => {
            console.log(`\n✅ SPL Governance power query completed`);
            console.log(`Final result: ${result.toLocaleString()} ISLAND tokens`);
        })
        .catch(error => {
            console.error(`💥 Query failed: ${error.message}`);
        });
}
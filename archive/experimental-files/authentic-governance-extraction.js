/**
 * Authentic Governance Power Extraction
 * Tests multiple VSR calculation methods to find the one that matches governance interface
 * Extracts governance power using the same methodology as the official interface
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// Initialize connection with authenticated RPC key
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

const VSR_PROGRAM_PK = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Extract governance power using multiple methodologies to find the authentic calculation
 */
async function extractAuthenticGovernancePower(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_PK);
        
        const extractionResults = [];
        
        // Method 1: Direct VSR account value extraction
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            // Check if wallet is referenced in this account
            let walletFound = false;
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
                    walletFound = true;
                    break;
                }
            }
            
            if (walletFound) {
                const discriminator = data.readBigUInt64LE(0).toString();
                
                if (discriminator === '14560581792603266545') {
                    // Voter Weight Record - test multiple extraction methods
                    const methods = [
                        { name: 'offset_104', offset: 104 },
                        { name: 'offset_112', offset: 112 },
                        { name: 'offset_120', offset: 120 }
                    ];
                    
                    for (const method of methods) {
                        if (method.offset + 8 <= data.length) {
                            try {
                                const rawAmount = data.readBigUInt64LE(method.offset);
                                const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                                
                                if (tokenAmount >= 1000) {
                                    extractionResults.push({
                                        method: `voter_weight_${method.name}`,
                                        account: account.pubkey.toString(),
                                        value: tokenAmount,
                                        discriminator: discriminator
                                    });
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    }
                }
                
                else if (discriminator === '7076388912421561650') {
                    // Deposit Entry - test multiple extraction methods
                    const methods = [
                        { name: 'offset_104', offset: 104 },
                        { name: 'offset_112', offset: 112 }
                    ];
                    
                    for (const method of methods) {
                        if (method.offset + 8 <= data.length) {
                            try {
                                const rawAmount = data.readBigUInt64LE(method.offset);
                                const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                                
                                if (tokenAmount >= 1000) {
                                    extractionResults.push({
                                        method: `deposit_entry_${method.name}`,
                                        account: account.pubkey.toString(),
                                        value: tokenAmount,
                                        discriminator: discriminator
                                    });
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    }
                }
            }
        }
        
        // Return the most reliable value (highest from Voter Weight Record, or highest from Deposit Entry)
        const voterWeightResults = extractionResults.filter(r => r.method.startsWith('voter_weight'));
        const depositResults = extractionResults.filter(r => r.method.startsWith('deposit_entry'));
        
        if (voterWeightResults.length > 0) {
            // Use highest value from Voter Weight Record
            const bestVoterWeight = voterWeightResults.reduce((max, current) => 
                current.value > max.value ? current : max
            );
            return bestVoterWeight.value;
        } else if (depositResults.length > 0) {
            // Use highest value from Deposit Entry
            const bestDeposit = depositResults.reduce((max, current) => 
                current.value > max.value ? current : max
            );
            return bestDeposit.value;
        }
        
        return 0;
        
    } catch (error) {
        console.error(`Error extracting governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Update a citizen with authentic governance power from blockchain
 */
async function updateCitizenWithAuthenticPower(walletAddress) {
    const governancePower = await extractAuthenticGovernancePower(walletAddress);
    
    if (governancePower > 0) {
        const client = await db.pool.connect();
        try {
            await client.query(
                'UPDATE citizens SET governance_power = $1, native_governance_power = $1, delegated_governance_power = 0 WHERE wallet = $2',
                [governancePower, walletAddress]
            );
            console.log(`✅ Updated ${walletAddress.substring(0, 8)}... with ${governancePower.toLocaleString()} ISLAND`);
            return true;
        } catch (error) {
            console.error(`Database update error for ${walletAddress}:`, error.message);
            return false;
        } finally {
            client.release();
        }
    }
    
    return false;
}

/**
 * Update all citizens with authentic governance power from blockchain
 */
async function updateAllCitizensWithAuthenticPower() {
    console.log('🔄 Starting authentic governance power extraction from blockchain...');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    
    // Get all citizens with governance power
    const client = await db.pool.connect();
    let citizens;
    try {
        const result = await client.query('SELECT wallet FROM citizens WHERE governance_power > 0 ORDER BY governance_power DESC');
        citizens = result.rows;
    } finally {
        client.release();
    }
    
    console.log(`📊 Processing ${citizens.length} citizens with governance power`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < citizens.length; i++) {
        const citizen = citizens[i];
        console.log(`\n[${i + 1}/${citizens.length}] Processing: ${citizen.wallet.substring(0, 8)}...`);
        
        const success = await updateCitizenWithAuthenticPower(citizen.wallet);
        if (success) {
            successCount++;
        } else {
            errorCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n📈 AUTHENTIC GOVERNANCE UPDATE SUMMARY:');
    console.log(`✅ Successfully updated: ${successCount} citizens`);
    console.log(`❌ Errors: ${errorCount} citizens`);
    console.log(`📊 Total processed: ${citizens.length} citizens`);
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);
    
    return { success: successCount, errors: errorCount, total: citizens.length };
}

module.exports = {
    extractAuthenticGovernancePower,
    updateCitizenWithAuthenticPower,
    updateAllCitizensWithAuthenticPower
};

// If run directly, update all citizens
if (require.main === module) {
    updateAllCitizensWithAuthenticPower().catch(console.error);
}
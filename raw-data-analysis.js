/**
 * Raw Data Analysis of Known Governance Account
 * Examine the exact bytes to find the deposit amount
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KNOWN_GOVERNANCE_ACCOUNT = 'FfaFsewkm3BFQi8pH1xYSoRyLpAMk62iTqYJQZVy6n88';
const EXPECTED_AMOUNT = 12625.580931;

/**
 * Examine raw bytes of the known governance account
 */
async function examineRawGovernanceData() {
    try {
        console.log(`Examining raw data of: ${KNOWN_GOVERNANCE_ACCOUNT}`);
        
        const accountPubkey = new PublicKey(KNOWN_GOVERNANCE_ACCOUNT);
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        
        if (!accountInfo || !accountInfo.data) {
            console.log('Account not found');
            return null;
        }
        
        const data = accountInfo.data;
        console.log(`Data length: ${data.length} bytes`);
        
        // Convert expected amount to lamports for comparison
        const expectedLamports = Math.round(EXPECTED_AMOUNT * Math.pow(10, 6));
        console.log(`Looking for: ${EXPECTED_AMOUNT} ISLAND = ${expectedLamports} lamports`);
        
        // Examine every 8-byte position for the expected amount
        console.log('\nSearching for expected amount in all positions:');
        
        for (let offset = 0; offset <= data.length - 8; offset++) {
            try {
                const value = data.readBigUInt64LE(offset);
                const lamports = Number(value);
                
                if (lamports === expectedLamports) {
                    console.log(`🎯 FOUND EXACT MATCH at offset ${offset}: ${lamports} lamports = ${(lamports / Math.pow(10, 6)).toLocaleString()} ISLAND`);
                    return { offset, lamports };
                }
                
                // Also check for close matches (within 1 token)
                const tokenAmount = lamports / Math.pow(10, 6);
                if (Math.abs(tokenAmount - EXPECTED_AMOUNT) < 1 && tokenAmount > 1000) {
                    console.log(`Close match at offset ${offset}: ${lamports} lamports = ${tokenAmount.toLocaleString()} ISLAND`);
                }
                
                // Show any large amounts that could be governance deposits
                if (tokenAmount > 1000 && tokenAmount < 100000) {
                    console.log(`Large amount at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                }
                
            } catch (error) {
                continue;
            }
        }
        
        // Also examine the raw bytes in hex
        console.log('\nRaw data (first 105 bytes in hex):');
        console.log(data.subarray(0, 105).toString('hex'));
        
        // Show the structure we know so far
        console.log('\nKnown structure:');
        console.log(`Offset 0: Account type = ${data.readUInt8(0)}`);
        console.log(`Offset 33-65: Wallet = ${new PublicKey(data.subarray(33, 65)).toString()}`);
        
        return null;
        
    } catch (error) {
        console.error('Error examining raw governance data:', error.message);
        return null;
    }
}

/**
 * Try different interpretations of the data
 */
async function tryDifferentDataInterpretations() {
    try {
        console.log('\nTrying different data interpretations...');
        
        const accountPubkey = new PublicKey(KNOWN_GOVERNANCE_ACCOUNT);
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        
        if (!accountInfo || !accountInfo.data) {
            return null;
        }
        
        const data = accountInfo.data;
        
        // Try reading as different data types
        console.log('Trying different data type interpretations:');
        
        for (let offset = 65; offset <= 97; offset += 8) {
            if (data.length >= offset + 8) {
                try {
                    // Little endian u64
                    const valueLe = data.readBigUInt64LE(offset);
                    const tokenAmountLe = Number(valueLe) / Math.pow(10, 6);
                    
                    // Big endian u64
                    const valueBe = data.readBigUInt64BE(offset);
                    const tokenAmountBe = Number(valueBe) / Math.pow(10, 6);
                    
                    // u32 little endian
                    const value32Le = data.readUInt32LE(offset);
                    const tokenAmount32Le = value32Le / Math.pow(10, 6);
                    
                    console.log(`Offset ${offset}:`);
                    console.log(`  u64 LE: ${tokenAmountLe.toLocaleString()} ISLAND`);
                    console.log(`  u64 BE: ${tokenAmountBe.toLocaleString()} ISLAND`);
                    console.log(`  u32 LE: ${tokenAmount32Le.toLocaleString()} ISLAND`);
                    
                    if (Math.abs(tokenAmountLe - EXPECTED_AMOUNT) < 1) {
                        console.log(`  🎯 LE MATCH!`);
                        return { offset, amount: tokenAmountLe, type: 'u64_le' };
                    }
                    if (Math.abs(tokenAmountBe - EXPECTED_AMOUNT) < 1) {
                        console.log(`  🎯 BE MATCH!`);
                        return { offset, amount: tokenAmountBe, type: 'u64_be' };
                    }
                    if (Math.abs(tokenAmount32Le - EXPECTED_AMOUNT) < 1) {
                        console.log(`  🎯 32-bit MATCH!`);
                        return { offset, amount: tokenAmount32Le, type: 'u32_le' };
                    }
                    
                } catch (error) {
                    continue;
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error trying data interpretations:', error.message);
        return null;
    }
}

/**
 * Main analysis function
 */
async function analyzeGovernanceDataStructure() {
    try {
        console.log('Analyzing governance data structure for known wallet...');
        
        const result1 = await examineRawGovernanceData();
        if (result1) {
            console.log('Found exact match in raw data analysis');
            return result1;
        }
        
        const result2 = await tryDifferentDataInterpretations();
        if (result2) {
            console.log('Found match in data interpretation analysis');
            return result2;
        }
        
        console.log('Could not find the expected deposit amount in the governance account');
        return null;
        
    } catch (error) {
        console.error('Error in governance data analysis:', error.message);
        return null;
    }
}

if (require.main === module) {
    analyzeGovernanceDataStructure()
        .then((result) => {
            if (result) {
                console.log('\n✅ Successfully found governance deposit structure');
                console.log(`Offset: ${result.offset}, Amount: ${result.amount}, Type: ${result.type || 'u64_le'}`);
            } else {
                console.log('\n❌ Could not determine governance deposit structure');
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    analyzeGovernanceDataStructure,
    examineRawGovernanceData,
    tryDifferentDataInterpretations
};
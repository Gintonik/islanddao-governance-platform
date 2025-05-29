/**
 * Search for the exact governance value 12,625.580931 ISLAND
 * in the known governance account
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const KNOWN_GOVERNANCE_ACCOUNT = 'FfaFsewkm3BFQi8pH1xYSoRyLpAMk62iTqYJQZVy6n88';
const EXACT_AMOUNT = 12625.580931;

async function searchExactGovernanceValue() {
    try {
        console.log(`Searching for exact value: ${EXACT_AMOUNT} ISLAND`);
        
        const accountPubkey = new PublicKey(KNOWN_GOVERNANCE_ACCOUNT);
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        
        if (!accountInfo || !accountInfo.data) {
            console.log('Account not found');
            return null;
        }
        
        const data = accountInfo.data;
        console.log(`Data length: ${data.length} bytes`);
        
        // Convert to lamports with 6 decimals
        const exactLamports = Math.round(EXACT_AMOUNT * Math.pow(10, 6));
        console.log(`Looking for: ${exactLamports} lamports`);
        
        // Search every possible position
        let found = false;
        
        for (let offset = 0; offset <= data.length - 8; offset++) {
            try {
                // Try little endian u64
                const valueLe = data.readBigUInt64LE(offset);
                const lamportsLe = Number(valueLe);
                
                if (lamportsLe === exactLamports) {
                    console.log(`🎯 FOUND EXACT MATCH (LE) at offset ${offset}: ${lamportsLe} lamports = ${(lamportsLe / Math.pow(10, 6))} ISLAND`);
                    found = true;
                }
                
                // Try big endian u64
                const valueBe = data.readBigUInt64BE(offset);
                const lamportsBe = Number(valueBe);
                
                if (lamportsBe === exactLamports) {
                    console.log(`🎯 FOUND EXACT MATCH (BE) at offset ${offset}: ${lamportsBe} lamports = ${(lamportsBe / Math.pow(10, 6))} ISLAND`);
                    found = true;
                }
                
                // Also check if it's close (within 1 lamport due to rounding)
                if (Math.abs(lamportsLe - exactLamports) <= 1 && lamportsLe > 1000000) {
                    console.log(`Close match (LE) at offset ${offset}: ${lamportsLe} lamports = ${(lamportsLe / Math.pow(10, 6))} ISLAND`);
                }
                
                if (Math.abs(lamportsBe - exactLamports) <= 1 && lamportsBe > 1000000) {
                    console.log(`Close match (BE) at offset ${offset}: ${lamportsBe} lamports = ${(lamportsBe / Math.pow(10, 6))} ISLAND`);
                }
                
            } catch (error) {
                continue;
            }
        }
        
        if (!found) {
            console.log('❌ Exact value not found');
            
            // Let's also try with different decimal precision
            console.log('\nTrying different decimal precisions...');
            
            for (let decimals = 0; decimals <= 9; decimals++) {
                const testLamports = Math.round(EXACT_AMOUNT * Math.pow(10, decimals));
                
                for (let offset = 0; offset <= data.length - 8; offset++) {
                    try {
                        const valueLe = Number(data.readBigUInt64LE(offset));
                        
                        if (valueLe === testLamports) {
                            console.log(`Found with ${decimals} decimals at offset ${offset}: ${testLamports} = ${(testLamports / Math.pow(10, decimals))} ISLAND`);
                        }
                        
                    } catch (error) {
                        continue;
                    }
                }
            }
        }
        
        // Show all significant values in the account
        console.log('\nAll significant values found:');
        for (let offset = 0; offset <= data.length - 8; offset++) {
            try {
                const value = Number(data.readBigUInt64LE(offset));
                const tokenAmount = value / Math.pow(10, 6);
                
                if (tokenAmount > 100 && tokenAmount < 100000) {
                    console.log(`Offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                }
            } catch (error) {
                continue;
            }
        }
        
        return found;
        
    } catch (error) {
        console.error('Error searching for exact value:', error.message);
        return false;
    }
}

if (require.main === module) {
    searchExactGovernanceValue()
        .then((found) => {
            console.log(found ? '✅ Search completed' : '❌ Value not found');
            process.exit(0);
        })
        .catch(error => {
            console.error('Search failed:', error.message);
            process.exit(1);
        });
}

module.exports = { searchExactGovernanceValue };
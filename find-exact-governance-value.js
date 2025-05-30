/**
 * Find Exact Governance Value
 * Search for the specific 3,361,730.150474 ISLAND value in VSR accounts
 * to understand how weighted governance power is stored
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// Target values to search for
const TARGET_WALLET = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
const TARGET_GOVERNANCE = 3361730.150474;

/**
 * Search VSR accounts for the exact governance value
 */
async function searchForExactGovernanceValue() {
    try {
        console.log(`Searching for exact governance value: ${TARGET_GOVERNANCE.toLocaleString()} ISLAND`);
        console.log(`Associated wallet: ${TARGET_WALLET}`);
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Searching ${allVSRAccounts.length} VSR accounts...\n`);
        
        const targetWalletPubkey = new PublicKey(TARGET_WALLET);
        const targetWalletBuffer = targetWalletPubkey.toBuffer();
        
        // Convert target amount to raw value (6 decimals)
        const targetRawAmount = Math.round(TARGET_GOVERNANCE * Math.pow(10, 6));
        console.log(`Target raw amount: ${targetRawAmount}`);
        
        let accountsProcessed = 0;
        let found = false;
        
        for (const account of allVSRAccounts) {
            accountsProcessed++;
            
            if (accountsProcessed % 2000 === 0) {
                console.log(`Processed ${accountsProcessed}/${allVSRAccounts.length} accounts...`);
            }
            
            const data = account.account.data;
            
            // First check if this account contains the target wallet
            let walletFound = false;
            let walletOffset = -1;
            
            for (let offset = 0; offset <= data.length - 32; offset += 4) {
                if (data.subarray(offset, offset + 32).equals(targetWalletBuffer)) {
                    walletFound = true;
                    walletOffset = offset;
                    break;
                }
            }
            
            if (walletFound) {
                console.log(`\n✓ Found target wallet in account ${account.pubkey.toString()}`);
                console.log(`  Wallet at offset: ${walletOffset}`);
                console.log(`  Account size: ${data.length} bytes`);
                
                // Now search this entire account for the target governance amount
                for (let offset = 0; offset <= data.length - 8; offset += 8) {
                    try {
                        const rawAmount = data.readBigUInt64LE(offset);
                        
                        // Check if this matches our target (with some tolerance for precision)
                        if (Math.abs(Number(rawAmount) - targetRawAmount) < 1000) {
                            const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                            console.log(`    🎯 FOUND TARGET AMOUNT: ${tokenAmount.toLocaleString()} ISLAND at offset ${offset}`);
                            console.log(`    Raw value: ${rawAmount.toString()}`);
                            console.log(`    Distance from wallet: ${Math.abs(offset - walletOffset)} bytes`);
                            found = true;
                        }
                        
                        // Also log any other reasonable amounts for context
                        const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                        if (tokenAmount >= 100000 && tokenAmount <= 10000000 && tokenAmount !== TARGET_GOVERNANCE) {
                            console.log(`    Other amount: ${tokenAmount.toLocaleString()} ISLAND at offset ${offset}`);
                        }
                        
                    } catch (error) {
                        continue;
                    }
                }
                
                console.log(`  Account analysis complete for ${account.pubkey.toString().substring(0, 8)}...`);
            }
        }
        
        console.log(`\nSearch complete. Processed ${accountsProcessed} accounts.`);
        
        if (found) {
            console.log(`✅ Successfully found the target governance amount!`);
        } else {
            console.log(`❌ Target governance amount not found in expected format`);
            console.log(`This suggests the governance power might be calculated differently`);
        }
        
        return found;
        
    } catch (error) {
        console.error('Error searching for exact governance value:', error.message);
        return false;
    }
}

/**
 * Alternative: Search for partial matches and patterns
 */
async function searchForGovernancePatterns() {
    try {
        console.log('\nSearching for governance patterns and related amounts...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        
        const targetWalletPubkey = new PublicKey(TARGET_WALLET);
        const targetWalletBuffer = targetWalletPubkey.toBuffer();
        
        // Look for amounts that are close to our target (within 10%)
        const tolerance = TARGET_GOVERNANCE * 0.1;
        const minAmount = TARGET_GOVERNANCE - tolerance;
        const maxAmount = TARGET_GOVERNANCE + tolerance;
        
        console.log(`Looking for amounts between ${minAmount.toLocaleString()} and ${maxAmount.toLocaleString()} ISLAND`);
        
        let accountsWithWallet = 0;
        const foundAmounts = [];
        
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            // Check if this account contains the target wallet
            let walletFound = false;
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
                if (data.subarray(offset, offset + 32).equals(targetWalletBuffer)) {
                    walletFound = true;
                    break;
                }
            }
            
            if (walletFound) {
                accountsWithWallet++;
                console.log(`\nAccount ${accountsWithWallet}: ${account.pubkey.toString().substring(0, 8)}...`);
                
                // Search for amounts in the target range
                for (let offset = 0; offset <= data.length - 8; offset += 8) {
                    try {
                        const rawAmount = data.readBigUInt64LE(offset);
                        const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                        
                        if (tokenAmount >= minAmount && tokenAmount <= maxAmount) {
                            console.log(`  Found potential match: ${tokenAmount.toLocaleString()} ISLAND at offset ${offset}`);
                            foundAmounts.push({
                                amount: tokenAmount,
                                account: account.pubkey.toString(),
                                offset: offset
                            });
                        }
                        
                    } catch (error) {
                        continue;
                    }
                }
            }
        }
        
        console.log(`\nFound ${foundAmounts.length} potential governance amounts in ${accountsWithWallet} accounts:`);
        foundAmounts.forEach((item, index) => {
            const diff = Math.abs(item.amount - TARGET_GOVERNANCE);
            const percentDiff = (diff / TARGET_GOVERNANCE) * 100;
            console.log(`  ${index + 1}. ${item.amount.toLocaleString()} ISLAND (${percentDiff.toFixed(2)}% off) in ${item.account.substring(0, 8)}...`);
        });
        
        return foundAmounts;
        
    } catch (error) {
        console.error('Error searching for governance patterns:', error.message);
        return [];
    }
}

async function main() {
    console.log('=== FINDING EXACT GOVERNANCE VALUE IN BLOCKCHAIN ===\n');
    
    // First try exact search
    const exactFound = await searchForExactGovernanceValue();
    
    if (!exactFound) {
        // Try pattern search
        await searchForGovernancePatterns();
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { searchForExactGovernanceValue, searchForGovernancePatterns };
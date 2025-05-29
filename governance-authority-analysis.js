/**
 * Governance Authority Analysis
 * Examine the Island DAO Main Treasury authority account structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// IslandDAO governance parameters
const GOVERNANCE_AUTHORITY = '6Vjsy1KabnHtSuHZcXuuCQFWoBML9JscSy3L4NGjqmhM';
const GOVERNANCE_PUBKEY = 'F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9';
const KNOWN_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

/**
 * Examine the governance authority account structure
 */
async function examineGovernanceAuthority() {
    try {
        console.log('Examining Island DAO Main Treasury authority...');
        console.log(`Authority: ${GOVERNANCE_AUTHORITY}`);
        
        const authorityPubkey = new PublicKey(GOVERNANCE_AUTHORITY);
        const accountInfo = await connection.getAccountInfo(authorityPubkey);
        
        if (!accountInfo || !accountInfo.data) {
            console.log('Authority account not found or no data');
            return null;
        }
        
        console.log(`Authority account data length: ${accountInfo.data.length} bytes`);
        console.log(`Authority account owner: ${accountInfo.owner.toString()}`);
        
        // Look for references to our known wallet in this account
        const data = accountInfo.data;
        const knownWalletPubkey = new PublicKey(KNOWN_WALLET);
        
        console.log('\nSearching for known wallet in authority account...');
        
        for (let offset = 0; offset <= data.length - 32; offset++) {
            try {
                const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                if (pubkey.equals(knownWalletPubkey)) {
                    console.log(`Found known wallet at offset ${offset}`);
                    
                    // Look for amounts near this wallet
                    for (let amountOffset = offset + 32; amountOffset < Math.min(data.length - 8, offset + 200); amountOffset += 8) {
                        try {
                            const amount = data.readBigUInt64LE(amountOffset);
                            const tokenAmount = Number(amount) / Math.pow(10, 6);
                            
                            if (tokenAmount > 1000 && tokenAmount < 100000) {
                                console.log(`  Amount at offset ${amountOffset}: ${tokenAmount.toLocaleString()} ISLAND`);
                                
                                if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                    console.log(`  🎯 MATCHES EXPECTED GOVERNANCE POWER!`);
                                }
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return accountInfo;
        
    } catch (error) {
        console.error('Error examining governance authority:', error.message);
        return null;
    }
}

/**
 * Find all governance-related accounts using filters
 */
async function findGovernanceAccountsWithFilters() {
    try {
        console.log('Finding governance accounts with specific filters...');
        
        const governanceProgramId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
        const realmPubkey = new PublicKey(GOVERNANCE_PUBKEY);
        
        // Try different common governance account sizes
        const commonSizes = [105, 116, 148, 200, 300];
        
        for (const size of commonSizes) {
            console.log(`\nSearching for governance accounts of size ${size}...`);
            
            try {
                const accounts = await connection.getProgramAccounts(governanceProgramId, {
                    filters: [
                        { dataSize: size }
                    ]
                });
                
                console.log(`Found ${accounts.length} accounts of size ${size}`);
                
                for (const account of accounts) {
                    const data = account.account.data;
                    
                    // Check if this account references the IslandDAO realm
                    for (let offset = 0; offset <= data.length - 32; offset++) {
                        try {
                            const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                            if (pubkey.equals(realmPubkey)) {
                                console.log(`  Account ${account.pubkey.toString()} references IslandDAO realm at offset ${offset}`);
                                
                                // Look for the known wallet in this account
                                const knownWalletPubkey = new PublicKey(KNOWN_WALLET);
                                for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset++) {
                                    try {
                                        const walletPubkey = new PublicKey(data.subarray(walletOffset, walletOffset + 32));
                                        if (walletPubkey.equals(knownWalletPubkey)) {
                                            console.log(`    Found known wallet at offset ${walletOffset}`);
                                            
                                            // Extract amounts near the wallet
                                            for (let amountOffset = walletOffset + 32; amountOffset < Math.min(data.length - 8, walletOffset + 100); amountOffset += 8) {
                                                try {
                                                    const amount = data.readBigUInt64LE(amountOffset);
                                                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                                                    
                                                    if (tokenAmount > 1000 && tokenAmount < 50000) {
                                                        console.log(`      Governance power: ${tokenAmount.toLocaleString()} ISLAND`);
                                                        
                                                        if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                                            console.log(`      🎯 MATCHES EXPECTED AMOUNT!`);
                                                            return {
                                                                account: account.pubkey.toString(),
                                                                wallet: KNOWN_WALLET,
                                                                amount: tokenAmount,
                                                                structure: { size, walletOffset, amountOffset }
                                                            };
                                                        }
                                                    }
                                                } catch (error) {
                                                    continue;
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        continue;
                                    }
                                }
                                break;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                console.log(`  Error searching size ${size}: ${error.message}`);
                continue;
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error finding governance accounts with filters:', error.message);
        return null;
    }
}

/**
 * Main analysis function
 */
async function runGovernanceAuthorityAnalysis() {
    try {
        console.log('Running comprehensive governance authority analysis...');
        
        // First examine the authority account
        await examineGovernanceAuthority();
        
        // Then search for governance accounts with different structures
        const result = await findGovernanceAccountsWithFilters();
        
        if (result) {
            console.log('\n✅ Found governance structure that matches expected amount!');
            console.log(`Account: ${result.account}`);
            console.log(`Structure: ${JSON.stringify(result.structure)}`);
            return result;
        } else {
            console.log('\n❌ Could not find governance structure matching expected amount');
            return null;
        }
        
    } catch (error) {
        console.error('Error in governance authority analysis:', error.message);
        return null;
    }
}

if (require.main === module) {
    runGovernanceAuthorityAnalysis()
        .then((result) => {
            if (result) {
                console.log('Analysis successful');
            } else {
                console.log('Analysis completed without finding expected structure');
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    runGovernanceAuthorityAnalysis,
    examineGovernanceAuthority,
    findGovernanceAccountsWithFilters
};
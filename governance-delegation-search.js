/**
 * Governance Delegation Search
 * Find delegation relationships where citizens delegate governance power to others
 * or receive delegated governance power from other wallets
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

/**
 * Get all citizen wallets from database
 */
async function getAllCitizenWallets() {
    try {
        const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
        return result.rows.map(row => row.wallet);
    } catch (error) {
        console.error('Error getting citizen wallets:', error.message);
        return [];
    }
}

/**
 * Search for delegation patterns in VSR accounts
 * Look for accounts that reference multiple citizen wallets (delegation relationships)
 */
async function searchVSRDelegations(citizenWallets) {
    try {
        console.log('Searching for VSR delegation patterns...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const vsrAccounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Examining ${vsrAccounts.length} VSR accounts for delegation patterns`);
        
        const delegationRelationships = [];
        const citizenBuffers = {};
        
        // Create lookup buffers for all citizens
        for (const wallet of citizenWallets) {
            try {
                citizenBuffers[wallet] = new PublicKey(wallet).toBuffer();
            } catch (error) {
                continue;
            }
        }
        
        let accountsProcessed = 0;
        
        for (const account of vsrAccounts) {
            accountsProcessed++;
            
            if (accountsProcessed % 2000 === 0) {
                console.log(`  Processed ${accountsProcessed}/${vsrAccounts.length} accounts...`);
            }
            
            const data = account.account.data;
            const foundCitizens = [];
            
            // Look for multiple citizen wallet references in the same account
            for (const [wallet, buffer] of Object.entries(citizenBuffers)) {
                for (let offset = 0; offset <= data.length - 32; offset += 4) {
                    if (data.subarray(offset, offset + 32).equals(buffer)) {
                        foundCitizens.push({
                            wallet: wallet,
                            offset: offset
                        });
                        break; // Found this wallet, move to next wallet
                    }
                }
            }
            
            // If we found multiple citizens in the same account, it might indicate delegation
            if (foundCitizens.length > 1) {
                console.log(`    Found multi-citizen account ${account.pubkey.toString().substring(0, 8)}...:`);
                foundCitizens.forEach(citizen => {
                    console.log(`      ${citizen.wallet} at offset ${citizen.offset}`);
                });
                
                // Look for delegation indicators and amounts
                const amounts = [];
                for (let offset = 0; offset <= data.length - 8; offset += 8) {
                    try {
                        const amount = data.readBigUInt64LE(offset);
                        const tokenAmount = Number(amount) / Math.pow(10, 6);
                        
                        if (tokenAmount >= 1000 && tokenAmount <= 50000000) {
                            amounts.push({
                                amount: tokenAmount,
                                offset: offset
                            });
                        }
                    } catch (error) {
                        continue;
                    }
                }
                
                delegationRelationships.push({
                    account: account.pubkey.toString(),
                    citizens: foundCitizens,
                    amounts: amounts
                });
            }
        }
        
        console.log(`Found ${delegationRelationships.length} potential delegation accounts`);
        return delegationRelationships;
        
    } catch (error) {
        console.error('Error searching VSR delegations:', error.message);
        return [];
    }
}

/**
 * Search for delegation patterns in governance accounts
 */
async function searchGovernanceDelegations(citizenWallets) {
    try {
        console.log('\nSearching for governance delegation patterns...');
        
        const governanceProgramId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const governanceAccounts = await connection.getProgramAccounts(governanceProgramId);
        
        console.log(`Examining ${governanceAccounts.length} governance accounts for delegation patterns`);
        
        const delegationRelationships = [];
        const citizenBuffers = {};
        
        // Create lookup buffers for all citizens
        for (const wallet of citizenWallets) {
            try {
                citizenBuffers[wallet] = new PublicKey(wallet).toBuffer();
            } catch (error) {
                continue;
            }
        }
        
        for (const account of governanceAccounts) {
            const data = account.account.data;
            const foundCitizens = [];
            
            // Look for multiple citizen references
            for (const [wallet, buffer] of Object.entries(citizenBuffers)) {
                for (let offset = 0; offset <= data.length - 32; offset += 4) {
                    if (data.subarray(offset, offset + 32).equals(buffer)) {
                        foundCitizens.push({
                            wallet: wallet,
                            offset: offset
                        });
                        break;
                    }
                }
            }
            
            // Check for delegation indicators
            if (foundCitizens.length > 1) {
                console.log(`    Found multi-citizen governance account ${account.pubkey.toString().substring(0, 8)}...:`);
                foundCitizens.forEach(citizen => {
                    console.log(`      ${citizen.wallet} at offset ${citizen.offset}`);
                });
                
                delegationRelationships.push({
                    account: account.pubkey.toString(),
                    citizens: foundCitizens,
                    type: 'governance'
                });
            }
        }
        
        console.log(`Found ${delegationRelationships.length} potential governance delegation accounts`);
        return delegationRelationships;
        
    } catch (error) {
        console.error('Error searching governance delegations:', error.message);
        return [];
    }
}

/**
 * Look for specific delegation account types
 * Check for accounts that might be delegate or delegator accounts
 */
async function searchSpecificDelegationAccounts(citizenWallets) {
    try {
        console.log('\nSearching for specific delegation account types...');
        
        const delegationData = {};
        
        for (const citizenWallet of citizenWallets) {
            try {
                console.log(`\nChecking delegation for ${citizenWallet}:`);
                
                // Check if this citizen has VSR voter accounts that might indicate delegation
                const citizenPubkey = new PublicKey(citizenWallet);
                
                // Look for VSR voter PDA (which might contain delegation info)
                const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
                const [voterPDA] = await PublicKey.findProgramAddress(
                    [
                        Buffer.from('voter'),
                        citizenPubkey.toBuffer(),
                        // Note: We'd need the registrar pubkey here for exact PDA
                    ],
                    vsrProgramId
                );
                
                console.log(`  VSR voter PDA: ${voterPDA.toString()}`);
                
                // Check if the voter account exists and has delegation info
                const voterAccount = await connection.getAccountInfo(voterPDA);
                if (voterAccount && voterAccount.data.length > 0) {
                    console.log(`    Found voter account with ${voterAccount.data.length} bytes`);
                    
                    // Look for delegation indicators in the voter account
                    const data = voterAccount.data;
                    
                    // Check for delegate field (typically after voter authority)
                    for (let offset = 32; offset <= data.length - 32; offset += 32) {
                        try {
                            const potentialDelegate = new PublicKey(data.subarray(offset, offset + 32));
                            
                            // Check if this delegate is one of our citizens
                            if (citizenWallets.includes(potentialDelegate.toString()) && 
                                potentialDelegate.toString() !== citizenWallet) {
                                console.log(`    ✓ Found delegation: ${citizenWallet} → ${potentialDelegate.toString()}`);
                                
                                if (!delegationData[citizenWallet]) {
                                    delegationData[citizenWallet] = {};
                                }
                                delegationData[citizenWallet].delegatesTo = potentialDelegate.toString();
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
                
            } catch (error) {
                console.log(`    No delegation account found for ${citizenWallet}`);
                continue;
            }
        }
        
        return delegationData;
        
    } catch (error) {
        console.error('Error searching specific delegation accounts:', error.message);
        return {};
    }
}

/**
 * Main delegation search function
 */
async function searchAllDelegations() {
    try {
        console.log('Starting comprehensive delegation search...\n');
        
        // Get all citizen wallets
        const citizenWallets = await getAllCitizenWallets();
        console.log(`Searching for delegations among ${citizenWallets.length} citizens\n`);
        
        // Search VSR delegations
        const vsrDelegations = await searchVSRDelegations(citizenWallets);
        
        // Search governance delegations
        const governanceDelegations = await searchGovernanceDelegations(citizenWallets);
        
        // Search specific delegation accounts
        const specificDelegations = await searchSpecificDelegationAccounts(citizenWallets);
        
        // Analyze and report findings
        console.log('\n=== DELEGATION SEARCH RESULTS ===');
        console.log(`VSR delegation patterns found: ${vsrDelegations.length}`);
        console.log(`Governance delegation patterns found: ${governanceDelegations.length}`);
        console.log(`Specific delegations found: ${Object.keys(specificDelegations).length}`);
        
        if (Object.keys(specificDelegations).length > 0) {
            console.log('\nSpecific delegation relationships:');
            for (const [delegator, info] of Object.entries(specificDelegations)) {
                if (info.delegatesTo) {
                    console.log(`  ${delegator} delegates to → ${info.delegatesTo}`);
                }
            }
        }
        
        return {
            vsrDelegations,
            governanceDelegations,
            specificDelegations
        };
        
    } catch (error) {
        console.error('Error in delegation search:', error.message);
        return {};
    }
}

if (require.main === module) {
    searchAllDelegations()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { searchAllDelegations };
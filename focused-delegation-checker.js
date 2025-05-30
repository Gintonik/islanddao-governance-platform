/**
 * Focused Delegation Checker
 * Check for governance delegation relationships among citizens
 * using efficient targeted searches for delegation account structures
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// IslandDAO realm and governance configuration
const ISLAND_REALM = 'CKEyySpntyZyUfzBrH13wqaYVUNyAhkgKXhLqDqWNB9r';

/**
 * Get all citizen wallets
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
 * Check for delegation in Token Owner Records
 * In SPL Governance, delegation is stored in the TokenOwnerRecord
 */
async function checkTokenOwnerRecordDelegations(citizenWallets) {
    try {
        console.log('Checking Token Owner Record delegations...');
        
        const delegations = {};
        
        for (const citizenWallet of citizenWallets) {
            try {
                const citizenPubkey = new PublicKey(citizenWallet);
                const realmPubkey = new PublicKey(ISLAND_REALM);
                const governanceProgramId = new PublicKey(GOVERNANCE_PROGRAM_ID);
                
                // Derive Token Owner Record PDA
                const [tokenOwnerRecordPDA] = await PublicKey.findProgramAddress(
                    [
                        Buffer.from('governance'),
                        realmPubkey.toBuffer(),
                        // Community token mint would go here - we need to find it
                        citizenPubkey.toBuffer(),
                    ],
                    governanceProgramId
                );
                
                console.log(`Checking delegation for ${citizenWallet}:`);
                console.log(`  Token Owner Record PDA: ${tokenOwnerRecordPDA.toString()}`);
                
                // Get the account
                const account = await connection.getAccountInfo(tokenOwnerRecordPDA);
                
                if (account && account.data.length > 0) {
                    console.log(`    Found Token Owner Record (${account.data.length} bytes)`);
                    
                    const data = account.data;
                    
                    // Token Owner Record structure:
                    // - Account type (1 byte)
                    // - Realm (32 bytes)
                    // - Governing token mint (32 bytes) 
                    // - Governing token owner (32 bytes)
                    // - Governing token deposit amount (8 bytes)
                    // - Unrelinquished votes count (8 bytes)
                    // - Outstanding proposal count (8 bytes)
                    // - Version (1 byte)
                    // - Reserved (6 bytes)
                    // - Governance delegate (32 bytes) <- This is what we want!
                    
                    if (data.length >= 122) {
                        // Governance delegate should be at offset 90 (after all the above fields)
                        const delegateBytes = data.subarray(90, 122);
                        
                        try {
                            const delegatePubkey = new PublicKey(delegateBytes);
                            const delegateStr = delegatePubkey.toString();
                            
                            // Check if it's not the default PublicKey (all zeros) and not self
                            if (delegateStr !== '11111111111111111111111111111112' && 
                                delegateStr !== citizenWallet) {
                                
                                console.log(`    ✓ Found delegation: ${citizenWallet} → ${delegateStr}`);
                                
                                delegations[citizenWallet] = {
                                    delegatesTo: delegateStr,
                                    isDelegateTo: citizenWallets.includes(delegateStr)
                                };
                            }
                        } catch (error) {
                            console.log(`    No valid delegate found`);
                        }
                    }
                } else {
                    console.log(`    No Token Owner Record found`);
                }
                
            } catch (error) {
                console.log(`    Error checking ${citizenWallet}: ${error.message}`);
                continue;
            }
        }
        
        return delegations;
        
    } catch (error) {
        console.error('Error checking Token Owner Record delegations:', error.message);
        return {};
    }
}

/**
 * Check for VSR delegation patterns
 * Look for delegate relationships in VSR voter accounts
 */
async function checkVSRDelegations(citizenWallets) {
    try {
        console.log('\nChecking VSR delegation patterns...');
        
        const delegations = {};
        
        // Sample a few citizens to check for VSR delegation structures
        const sampleCitizens = citizenWallets.slice(0, 5);
        
        for (const citizenWallet of sampleCitizens) {
            try {
                console.log(`Checking VSR delegation for ${citizenWallet}:`);
                
                // Get VSR accounts that reference this citizen
                const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
                const citizenPubkey = new PublicKey(citizenWallet);
                
                // Search for VSR accounts containing this citizen
                const accounts = await connection.getProgramAccounts(vsrProgramId, {
                    filters: [
                        {
                            memcmp: {
                                offset: 0,
                                bytes: citizenPubkey.toBase58()
                            }
                        }
                    ]
                });
                
                console.log(`    Found ${accounts.length} VSR accounts`);
                
                for (const account of accounts) {
                    const data = account.account.data;
                    
                    // Look for delegation patterns in VSR account structure
                    // VSR voter accounts may have delegate fields
                    if (data.length >= 64) {
                        // Check for potential delegate at various offsets
                        const checkOffsets = [32, 40, 64, 72];
                        
                        for (const offset of checkOffsets) {
                            if (data.length >= offset + 32) {
                                try {
                                    const potentialDelegate = new PublicKey(data.subarray(offset, offset + 32));
                                    const delegateStr = potentialDelegate.toString();
                                    
                                    if (citizenWallets.includes(delegateStr) && delegateStr !== citizenWallet) {
                                        console.log(`      ✓ VSR delegation: ${citizenWallet} → ${delegateStr}`);
                                        delegations[citizenWallet] = {
                                            delegatesTo: delegateStr,
                                            type: 'vsr',
                                            account: account.pubkey.toString()
                                        };
                                    }
                                } catch (error) {
                                    continue;
                                }
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.log(`    Error checking VSR for ${citizenWallet}: ${error.message}`);
                continue;
            }
        }
        
        return delegations;
        
    } catch (error) {
        console.error('Error checking VSR delegations:', error.message);
        return {};
    }
}

/**
 * Calculate governance power adjustments based on delegations
 */
async function calculateDelegationAdjustments(delegations) {
    try {
        console.log('\nCalculating governance power adjustments from delegations...');
        
        // Get current governance powers from database
        const result = await pool.query('SELECT wallet, governance_power FROM citizens');
        const currentPowers = {};
        result.rows.forEach(row => {
            currentPowers[row.wallet] = parseFloat(row.governance_power) || 0;
        });
        
        const adjustments = {};
        const delegateReceivers = {};
        
        // Calculate adjustments
        for (const [delegator, delegationInfo] of Object.entries(delegations)) {
            const delegate = delegationInfo.delegatesTo;
            const power = currentPowers[delegator] || 0;
            
            if (power > 0) {
                console.log(`  ${delegator} delegates ${power.toLocaleString()} ISLAND to ${delegate}`);
                
                // Remove power from delegator
                adjustments[delegator] = 0;
                
                // Add power to delegate
                if (!delegateReceivers[delegate]) {
                    delegateReceivers[delegate] = currentPowers[delegate] || 0;
                }
                delegateReceivers[delegate] += power;
                adjustments[delegate] = delegateReceivers[delegate];
            }
        }
        
        return adjustments;
        
    } catch (error) {
        console.error('Error calculating delegation adjustments:', error.message);
        return {};
    }
}

/**
 * Main delegation check function
 */
async function checkAllDelegations() {
    try {
        console.log('Starting focused delegation check...\n');
        
        const citizenWallets = await getAllCitizenWallets();
        console.log(`Checking delegations for ${citizenWallets.length} citizens\n`);
        
        // Check Token Owner Record delegations
        const torDelegations = await checkTokenOwnerRecordDelegations(citizenWallets);
        
        // Check VSR delegations
        const vsrDelegations = await checkVSRDelegations(citizenWallets);
        
        // Combine all delegations
        const allDelegations = { ...torDelegations, ...vsrDelegations };
        
        console.log('\n=== DELEGATION RESULTS ===');
        console.log(`Total delegations found: ${Object.keys(allDelegations).length}`);
        
        if (Object.keys(allDelegations).length > 0) {
            console.log('\nDelegation relationships:');
            for (const [delegator, info] of Object.entries(allDelegations)) {
                const delegateType = info.isDelegateTo ? ' (citizen)' : ' (external)';
                console.log(`  ${delegator} → ${info.delegatesTo}${delegateType}`);
            }
            
            // Calculate and apply adjustments
            const adjustments = await calculateDelegationAdjustments(allDelegations);
            
            if (Object.keys(adjustments).length > 0) {
                console.log('\nApplying delegation adjustments to database...');
                
                for (const [wallet, newPower] of Object.entries(adjustments)) {
                    await pool.query(
                        'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                        [newPower, wallet]
                    );
                    console.log(`  Updated ${wallet}: ${newPower.toLocaleString()} ISLAND`);
                }
            }
        } else {
            console.log('No delegation relationships found among citizens');
        }
        
        return allDelegations;
        
    } catch (error) {
        console.error('Error in delegation check:', error.message);
        return {};
    }
}

if (require.main === module) {
    checkAllDelegations()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { checkAllDelegations };
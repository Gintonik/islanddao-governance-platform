/**
 * Update Delegated Governance Power for IslandDAO Citizens
 * Finds delegation relationships and calculates delegated voting power
 * Run with: node update-delegated-power.js
 */

const { Connection, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLANDDAO_REALM = new PublicKey('4zJdDtxL1xW9sPZLDrUD4VefPSZdYkDbb8c8k1t54Mfu');

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Find Token Owner Records where governance is delegated to a specific wallet
 */
async function findDelegationRecords(delegateWallet) {
  try {
    console.log(`  Searching for delegations to ${delegateWallet.substring(0, 8)}...`);
    
    const delegateKey = new PublicKey(delegateWallet);
    
    // Token Owner Record structure with corrected offsets:
    // 0: discriminator (1 byte)
    // 1: realm (32 bytes)
    // 33: governing token mint (32 bytes)  
    // 65: governing token owner (32 bytes)
    // 97: governance delegate (32 bytes) - this is where votes are delegated to
    // Plus additional fields
    
    const delegationAccounts = await connection.getProgramAccounts(SPL_GOVERNANCE_PROGRAM_ID, {
      filters: [
        // Filter by realm at offset 1
        { memcmp: { offset: 1, bytes: ISLANDDAO_REALM.toBase58() } },
        // Filter by governance delegate at offset 97 (where votes are delegated to)
        { memcmp: { offset: 97, bytes: delegateKey.toBase58() } }
      ]
    });
    
    console.log(`    Found ${delegationAccounts.length} delegation records`);
    
    const validDelegators = [];
    
    for (const account of delegationAccounts) {
      try {
        const data = account.account.data;
        
        // Extract the delegator address (governing token owner at offset 65)
        const delegatorBytes = data.slice(65, 97);
        const delegatorAddress = new PublicKey(delegatorBytes).toBase58();
        
        validDelegators.push({
          delegator: delegatorAddress,
          account: account.pubkey.toBase58()
        });
        console.log(`      Found delegator: ${delegatorAddress.substring(0, 8)}`);
        
      } catch (error) {
        console.log(`      Error parsing delegation record: ${error.message}`);
      }
    }
    
    return validDelegators;
    
  } catch (error) {
    console.error(`  Error finding delegations: ${error.message}`);
    return [];
  }
}

/**
 * Get voting power for a delegator using VSR
 */
async function getDelegatorVotingPower(delegatorWallet) {
  try {
    const walletPubkey = new PublicKey(delegatorWallet);
    
    // Get VSR accounts for this delegator
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    
    if (vsrAccounts.length === 0) {
      return 0;
    }
    
    let maxVotingPower = 0;
    
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Check if this is a voter weight record
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() === '14560581792603266545') {
        
        // Extract voting power from standard VSR offsets
        const powerOffsets = [104, 112, 120];
        
        for (const offset of powerOffsets) {
          if (offset + 8 <= data.length) {
            try {
              const rawPower = data.readBigUInt64LE(offset);
              const votingPower = Number(rawPower) / 1e6; // Convert from micro-tokens
              
              if (votingPower > 0 && votingPower < 50000000) {
                maxVotingPower = Math.max(maxVotingPower, votingPower);
              }
            } catch (e) {
              // Skip invalid data
            }
          }
        }
      }
    }
    
    return maxVotingPower;
    
  } catch (error) {
    console.error(`    Error getting voting power for ${delegatorWallet}: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate total delegated power for a wallet
 */
async function calculateDelegatedPower(walletAddress) {
  try {
    console.log(`  Calculating delegated power for ${walletAddress.substring(0, 8)}...`);
    
    // Find all delegations to this wallet
    const delegators = await findDelegationRecords(walletAddress);
    
    if (delegators.length === 0) {
      console.log('    No delegations found');
      return { totalDelegatedPower: 0, delegations: [] };
    }
    
    console.log(`    Processing ${delegators.length} delegators...`);
    
    let totalDelegatedPower = 0;
    const delegationDetails = [];
    
    for (const delegatorInfo of delegators) {
      const { delegator } = delegatorInfo;
      
      console.log(`      Checking power for delegator ${delegator.substring(0, 8)}...`);
      
      const votingPower = await getDelegatorVotingPower(delegator);
      
      if (votingPower > 0) {
        totalDelegatedPower += votingPower;
        delegationDetails.push({
          delegator,
          power: votingPower
        });
        
        console.log(`        Delegated power: ${votingPower.toLocaleString()} ISLAND`);
      } else {
        console.log(`        No voting power found`);
      }
    }
    
    return { totalDelegatedPower, delegations: delegationDetails };
    
  } catch (error) {
    console.error(`  Error calculating delegated power: ${error.message}`);
    return { totalDelegatedPower: 0, delegations: [] };
  }
}

/**
 * Fetch all citizen wallets from database
 */
async function fetchCitizenWallets(pool) {
  try {
    const query = 'SELECT wallet, nickname FROM citizens ORDER BY id';
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching citizen wallets:', error.message);
    throw error;
  }
}

/**
 * Update delegated governance power in database
 */
async function updateDelegatedGovernancePower(pool, wallet, delegatedPower) {
  try {
    const query = `
      UPDATE citizens 
      SET delegated_governance_power = $1 
      WHERE wallet = $2
    `;
    
    await pool.query(query, [delegatedPower, wallet]);
    console.log(`  Updated database: ${delegatedPower.toLocaleString()} ISLAND delegated`);
    
  } catch (error) {
    console.error(`  Error updating database for ${wallet}: ${error.message}`);
    throw error;
  }
}

/**
 * Main execution function
 */
async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Starting delegated governance power update for IslandDAO citizens...');
    console.log(`Using Helius RPC: ${HELIUS_RPC}`);
    console.log(`SPL Governance Program: ${SPL_GOVERNANCE_PROGRAM_ID.toBase58()}`);
    console.log(`VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
    console.log(`IslandDAO Realm: ${ISLANDDAO_REALM.toBase58()}`);
    
    // Fetch all citizens
    console.log('\nFetching citizens from database...');
    const citizens = await fetchCitizenWallets(pool);
    console.log(`Found ${citizens.length} citizens to process`);
    
    let processed = 0;
    let citizensWithDelegation = 0;
    let totalDelegatedPower = 0;
    const delegationLog = [];
    
    // Process each citizen
    console.log('\nProcessing citizens for delegated power...');
    for (const citizen of citizens) {
      const displayName = citizen.nickname || citizen.wallet.substring(0, 8);
      console.log(`\n[${processed + 1}/${citizens.length}] ${displayName}:`);
      
      try {
        // Calculate delegated voting power
        const result = await calculateDelegatedPower(citizen.wallet);
        
        if (result.totalDelegatedPower > 0) {
          // Update database
          await updateDelegatedGovernancePower(pool, citizen.wallet, result.totalDelegatedPower);
          citizensWithDelegation++;
          totalDelegatedPower += result.totalDelegatedPower;
          
          // Log delegation details
          delegationLog.push({
            citizen: displayName,
            wallet: citizen.wallet,
            totalDelegated: result.totalDelegatedPower,
            delegators: result.delegations
          });
          
        } else {
          console.log('  No delegated governance power found');
        }
        
        processed++;
        
      } catch (error) {
        console.error(`  Failed to process ${displayName}: ${error.message}`);
        processed++;
      }
    }
    
    // Final summary
    console.log('\n=== DELEGATION SUMMARY ===');
    console.log(`Citizens processed: ${processed}/${citizens.length}`);
    console.log(`Citizens with delegated power: ${citizensWithDelegation}`);
    console.log(`Total delegated governance power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
    
    if (delegationLog.length > 0) {
      console.log('\nDetailed delegation breakdown:');
      for (const entry of delegationLog) {
        console.log(`\n${entry.citizen}: ${entry.totalDelegated.toLocaleString()} ISLAND delegated`);
        for (const delegation of entry.delegators) {
          console.log(`  ← ${delegation.delegator.substring(0, 8)}: ${delegation.power.toLocaleString()} ISLAND`);
        }
      }
    }
    
    console.log('\nDelegated governance power update completed successfully');
    
  } catch (error) {
    console.error('\nUpdate failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Execute when run directly
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { run, calculateDelegatedPower };
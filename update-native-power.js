/**
 * Update Native Governance Power for IslandDAO Citizens
 * Calculates VSR voting power and updates PostgreSQL database
 * Run with: node update-native-power.js
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLANDDAO_REALM = new PublicKey('4zJdDtxL1xW9sPZLDrUD4VefPSZdYkDbb8c8k1t54Mfu');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Simulate getLockTokensVotingPowerPerWallet functionality
 * Extracts native voting power from VSR voter weight records
 */
async function getLockTokensVotingPowerPerWallet(walletAddress) {
  try {
    console.log(`  Fetching VSR data for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get VSR accounts for this wallet
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    
    console.log(`    Found ${vsrAccounts.length} VSR accounts`);
    
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
                console.log(`      Power at offset ${offset}: ${votingPower.toLocaleString()} ISLAND`);
              }
            } catch (e) {
              // Skip invalid data
            }
          }
        }
      }
    }
    
    console.log(`    Final voting power: ${maxVotingPower.toLocaleString()} ISLAND`);
    return maxVotingPower;
    
  } catch (error) {
    console.error(`  Error fetching power for ${walletAddress}: ${error.message}`);
    return 0;
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
 * Update native governance power in database
 */
async function updateNativeGovernancePower(pool, wallet, nativePower) {
  try {
    const query = `
      UPDATE citizens 
      SET native_governance_power = $1 
      WHERE wallet = $2
    `;
    
    await pool.query(query, [nativePower, wallet]);
    console.log(`  Updated database: ${nativePower.toLocaleString()} ISLAND`);
    
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
    console.log('Starting native governance power update for IslandDAO citizens...');
    console.log(`Using Helius RPC: ${HELIUS_RPC}`);
    console.log(`IslandDAO Realm: ${ISLANDDAO_REALM.toBase58()}`);
    console.log(`ISLAND Token Mint: ${ISLAND_MINT.toBase58()}`);
    
    // Fetch all citizens
    console.log('\nFetching citizens from database...');
    const citizens = await fetchCitizenWallets(pool);
    console.log(`Found ${citizens.length} citizens to process`);
    
    let processed = 0;
    let updated = 0;
    let totalNativePower = 0;
    
    // Process each citizen
    console.log('\nProcessing citizens...');
    for (const citizen of citizens) {
      const displayName = citizen.nickname || citizen.wallet.substring(0, 8);
      console.log(`\n[${processed + 1}/${citizens.length}] ${displayName}:`);
      
      try {
        // Calculate native voting power using VSR
        const nativePower = await getLockTokensVotingPowerPerWallet(citizen.wallet);
        
        if (nativePower > 0) {
          // Update database
          await updateNativeGovernancePower(pool, citizen.wallet, nativePower);
          updated++;
          totalNativePower += nativePower;
        } else {
          console.log('  No native governance power found');
        }
        
        processed++;
        
      } catch (error) {
        console.error(`  Failed to process ${displayName}: ${error.message}`);
        processed++;
      }
    }
    
    // Final summary
    console.log('\nUpdate Summary:');
    console.log(`Citizens processed: ${processed}/${citizens.length}`);
    console.log(`Citizens updated: ${updated}`);
    console.log(`Total native governance power: ${totalNativePower.toLocaleString()} ISLAND`);
    
    if (updated > 0) {
      console.log(`Average power per citizen: ${(totalNativePower / updated).toLocaleString()} ISLAND`);
    }
    
    console.log('\nNative governance power update completed successfully');
    
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

module.exports = { run, getLockTokensVotingPowerPerWallet };
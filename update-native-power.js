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
 * Parse individual deposit entries to check if they're active
 */
function parseDepositEntry(data, offset) {
  try {
    // Deposit entry structure (approximate):
    // 0-8: lockup kind
    // 8-16: start timestamp  
    // 16-24: end timestamp
    // 24-32: periods
    // 32-40: amount deposited
    // 40-48: amount initially locked
    // 48-56: amount currently locked
    // 56-64: voting power
    // 64-65: is_used flag
    
    const amountCurrentlyLocked = data.readBigUInt64LE(offset + 48);
    const votingPower = data.readBigUInt64LE(offset + 56);
    const isUsed = data.length > offset + 64 ? data[offset + 64] : 0;
    
    return {
      currentlyLocked: Number(amountCurrentlyLocked) / 1e6,
      votingPower: Number(votingPower) / 1e6,
      isUsed: isUsed === 1,
      isActive: amountCurrentlyLocked > 0 || votingPower > 0
    };
  } catch (e) {
    return { currentlyLocked: 0, votingPower: 0, isUsed: false, isActive: false };
  }
}

/**
 * Simulate getLockTokensVotingPowerPerWallet functionality
 * Extracts native voting power from VSR voter weight records with deposit validation
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
    let depositDetails = [];
    
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
        
        // Parse deposit entries for high-power wallets (detailed logging)
        if (maxVotingPower > 1000000) {
          console.log(`      Analyzing deposits for high-power wallet...`);
          
          // Typical VSR deposit entries start around offset 200, each ~72 bytes
          for (let depositOffset = 200; depositOffset < data.length - 72; depositOffset += 72) {
            const deposit = parseDepositEntry(data, depositOffset);
            
            if (deposit.isActive) {
              depositDetails.push(deposit);
              console.log(`        Deposit: ${deposit.currentlyLocked.toLocaleString()} locked, ${deposit.votingPower.toLocaleString()} power, used: ${deposit.isUsed}`);
            }
          }
        }
      }
    }
    
    // Log detailed breakdown for high-power wallets
    if (maxVotingPower > 1000000) {
      console.log(`    HIGH POWER WALLET ANALYSIS:`);
      console.log(`      Total active deposits: ${depositDetails.length}`);
      console.log(`      Sum of deposit voting power: ${depositDetails.reduce((sum, d) => sum + d.votingPower, 0).toLocaleString()} ISLAND`);
      console.log(`      Sum of currently locked: ${depositDetails.reduce((sum, d) => sum + d.currentlyLocked, 0).toLocaleString()} ISLAND`);
      console.log(`      Final max voting power: ${maxVotingPower.toLocaleString()} ISLAND`);
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
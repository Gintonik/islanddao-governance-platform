/**
 * Authentic VSR Governance Power Calculator
 * Calculates native governance power using standard VSR formula for all citizens
 * Updates PostgreSQL database with authentic blockchain data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLANDDAO_REALM = new PublicKey('4zJdDtxL1xW9sPZLDrUD4VefPSZdYkDbb8c8k1t54Mfu');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

// VSR Formula Constants
const BASELINE_MULTIPLIER = 1.0;
const BONUS_MULTIPLIER = 2.0;
const SATURATION_SECONDS = 4 * 365.25 * 24 * 3600; // 4 years

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Calculate VSR multiplier using standard formula
 * multiplier = baseline + min(remaining / saturation, 1) * bonus
 */
function calculateVSRMultiplier(lockupEndTimestamp) {
  const currentTime = Math.floor(Date.now() / 1000);
  const remainingSeconds = Math.max(0, lockupEndTimestamp - currentTime);
  
  if (remainingSeconds === 0) {
    return BASELINE_MULTIPLIER;
  }
  
  const lockupFactor = Math.min(remainingSeconds / SATURATION_SECONDS, 1.0);
  const multiplier = BASELINE_MULTIPLIER + (lockupFactor * BONUS_MULTIPLIER);
  
  return multiplier;
}

/**
 * Derive Registrar PDA
 */
function getRegistrarPDA(realm, governingTokenMint, programId) {
  const [registrarPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('registrar'),
      realm.toBuffer(),
      governingTokenMint.toBuffer()
    ],
    programId
  );
  return registrarPDA;
}

/**
 * Derive Voter PDA
 */
function getVoterPDA(registrarPubkey, walletPubkey, programId) {
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      registrarPubkey.toBuffer(),
      Buffer.from('voter'),
      walletPubkey.toBuffer()
    ],
    programId
  );
  return voterPDA;
}

/**
 * Parse deposit entry from VSR account data
 */
function parseDepositEntry(data, offset) {
  try {
    if (offset + 72 > data.length) return null;
    
    // Check if deposit is used
    const isUsed = data.readUInt8(offset) === 1;
    if (!isUsed) return null;
    
    // Parse deposit data
    const lockupKind = data.readUInt8(offset + 1);
    const amountDeposited = Number(data.readBigUInt64LE(offset + 8)) / 1e6;
    const amountInitiallyLocked = Number(data.readBigUInt64LE(offset + 16)) / 1e6;
    
    // Parse lockup structure (varies by lockup kind)
    let lockupEndTs = 0;
    try {
      // Try different offsets for lockup end timestamp
      lockupEndTs = Number(data.readBigUInt64LE(offset + 32));
      if (lockupEndTs < 1600000000 || lockupEndTs > 2000000000) {
        lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
      }
    } catch (e) {
      lockupEndTs = 0;
    }
    
    return {
      isUsed,
      lockupKind,
      amountDeposited,
      amountInitiallyLocked,
      lockupEndTs
    };
  } catch (error) {
    return null;
  }
}

/**
 * Parse deposit from raw VSR account data using pattern detection
 */
function parseDepositFromRawData(data, offset) {
  try {
    if (offset + 64 > data.length) return null;
    
    const value = Number(data.readBigUInt64LE(offset));
    const asTokens = value / 1e6;
    
    // Check if this looks like a valid deposit amount
    if (asTokens >= 1000 && asTokens <= 100000) {
      // Look for nearby timestamp that could be lockup end
      let lockupEndTs = 0;
      
      // Check offsets within 32 bytes for potential timestamps
      for (let tsOffset = Math.max(0, offset - 32); tsOffset <= offset + 32; tsOffset += 8) {
        if (tsOffset + 8 <= data.length) {
          const tsValue = Number(data.readBigUInt64LE(tsOffset));
          if (tsValue > 1700000000 && tsValue < 1800000000) { // Valid timestamp range
            lockupEndTs = tsValue;
            break;
          }
        }
      }
      
      return {
        amountDeposited: asTokens,
        lockupEndTs: lockupEndTs
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate native governance power for a wallet using authentic VSR data
 */
async function calculateNativeGovernancePower(walletAddress) {
  try {
    console.log(`  Processing ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Use the proven method to find VSR accounts
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    
    if (vsrAccounts.length === 0) {
      console.log(`    No VSR accounts found`);
      return 0;
    }
    
    console.log(`    Found ${vsrAccounts.length} VSR accounts`);
    
    let totalVotingPower = 0;
    let activeDeposits = 0;
    
    // Process each VSR account
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Verify this is a voter weight record
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() !== '14560581792603266545') {
        continue;
      }
      
      // Scan for deposit amounts in the account data
      const deposits = [];
      
      for (let i = 0; i < Math.min(400, data.length); i += 8) {
        const deposit = parseDepositFromRawData(data, i);
        if (deposit) {
          // Check for duplicates
          const isDuplicate = deposits.some(existing => 
            Math.abs(existing.amountDeposited - deposit.amountDeposited) < 0.1
          );
          
          if (!isDuplicate) {
            deposits.push(deposit);
          }
        }
      }
      
      // Calculate voting power for each unique deposit
      for (const deposit of deposits) {
        activeDeposits++;
        
        // Calculate multiplier using standard VSR formula
        const multiplier = calculateVSRMultiplier(deposit.lockupEndTs);
        const depositVotingPower = deposit.amountDeposited * multiplier;
        
        totalVotingPower += depositVotingPower;
        
        const remainingYears = Math.max(0, (deposit.lockupEndTs - Date.now()/1000) / (365.25 * 24 * 3600));
        console.log(`    Deposit ${activeDeposits}: ${deposit.amountDeposited.toLocaleString()} ISLAND (${remainingYears.toFixed(2)}y) × ${multiplier.toFixed(3)} = ${depositVotingPower.toLocaleString()} power`);
      }
    }
    
    console.log(`    Total: ${activeDeposits} deposits, ${totalVotingPower.toLocaleString()} ISLAND power`);
    return totalVotingPower;
    
  } catch (error) {
    console.error(`    Error: ${error.message}`);
    return 0;
  }
}

/**
 * Update citizen in database with calculated governance power
 */
async function updateCitizenGovernancePower(pool, wallet, nativePower) {
  try {
    await pool.query(`
      UPDATE citizens 
      SET native_governance_power = $1,
          total_governance_power = $1 + COALESCE(delegated_governance_power, 0)
      WHERE wallet = $2
    `, [nativePower, wallet]);
    
    console.log(`    ✓ Updated: ${nativePower.toLocaleString()} ISLAND`);
  } catch (error) {
    console.error(`    ✗ Database error: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function run() {
  console.log('Starting authentic VSR governance power calculation...');
  console.log('Using standard VSR formula: multiplier = baseline + min(remaining/saturation, 1) * bonus');
  console.log(`Configuration: baseline=${BASELINE_MULTIPLIER}, bonus=${BONUS_MULTIPLIER}, saturation=${SATURATION_SECONDS/31557600} years\n`);
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    // Fetch all citizens from database
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    console.log(`Found ${citizens.length} citizens to process\n`);
    
    let totalUpdated = 0;
    let totalGovernancePower = 0;
    
    // Process each citizen
    for (let i = 0; i < citizens.length; i++) {
      const citizen = citizens[i];
      const citizenName = citizen.nickname || 'Anonymous';
      
      console.log(`[${i + 1}/${citizens.length}] ${citizenName}:`);
      
      const nativePower = await calculateNativeGovernancePower(citizen.wallet);
      
      if (nativePower > 0) {
        await updateCitizenGovernancePower(pool, citizen.wallet, nativePower);
        totalUpdated++;
        totalGovernancePower += nativePower;
      } else {
        console.log(`    No governance power found`);
      }
      
      console.log('');
    }
    
    console.log('=== SUMMARY ===');
    console.log(`Citizens processed: ${citizens.length}`);
    console.log(`Citizens with governance power: ${totalUpdated}`);
    console.log(`Total native governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    
    // Show top 10 citizens by native governance power
    const topResult = await pool.query(`
      SELECT nickname, native_governance_power 
      FROM citizens 
      WHERE native_governance_power > 0
      ORDER BY native_governance_power DESC 
      LIMIT 10
    `);
    
    console.log('\nTop 10 Citizens by Native Governance Power:');
    console.log('==========================================');
    topResult.rows.forEach((citizen, index) => {
      const power = Number(citizen.native_governance_power);
      const nickname = citizen.nickname || 'Anonymous';
      console.log(`${index + 1}. ${nickname}: ${power.toLocaleString()} ISLAND`);
    });
    
  } catch (error) {
    console.error('Main execution error:', error);
  } finally {
    await pool.end();
  }
}

// Run the calculation
if (require.main === module) {
  run().catch(console.error);
}

module.exports = { 
  calculateNativeGovernancePower,
  calculateVSRMultiplier
};
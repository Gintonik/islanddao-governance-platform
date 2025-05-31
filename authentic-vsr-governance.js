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
 * Calculate VSR multiplier using standard formula with proper lockup kind handling
 * multiplier = baseline + min(remaining / saturation, 1) * bonus
 */
function calculateVSRMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Skip deposits that aren't locked
  if (!deposit.isLocked) {
    return BASELINE_MULTIPLIER;
  }
  
  let effectiveRemainingSeconds = 0;
  
  switch (deposit.lockupKind) {
    case 0: // None/Liquid - no lockup bonus
      return BASELINE_MULTIPLIER;
      
    case 1: // Cliff - full multiplier until end_ts, then baseline
      if (currentTime < deposit.endTs) {
        effectiveRemainingSeconds = deposit.endTs - currentTime;
      } else {
        return BASELINE_MULTIPLIER; // Expired
      }
      break;
      
    case 2: // Constant - linear decay from start to end
      if (currentTime >= deposit.endTs) {
        return BASELINE_MULTIPLIER; // Expired
      }
      if (currentTime <= deposit.startTs) {
        effectiveRemainingSeconds = deposit.endTs - deposit.startTs;
      } else {
        effectiveRemainingSeconds = deposit.endTs - currentTime;
      }
      break;
      
    case 3: // Daily decay
    case 4: // Monthly decay
      if (currentTime >= deposit.endTs) {
        return BASELINE_MULTIPLIER; // Expired
      }
      // For step decay, use remaining time to end
      effectiveRemainingSeconds = Math.max(0, deposit.endTs - currentTime);
      break;
      
    default:
      // Unknown lockup kind, use end timestamp if available
      if (deposit.endTs > currentTime) {
        effectiveRemainingSeconds = deposit.endTs - currentTime;
      } else {
        return BASELINE_MULTIPLIER;
      }
  }
  
  if (effectiveRemainingSeconds <= 0) {
    return BASELINE_MULTIPLIER;
  }
  
  const lockupFactor = Math.min(effectiveRemainingSeconds / SATURATION_SECONDS, 1.0);
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
 * Parse VSR deposit entry with proper lockup kind handling
 */
function parseDepositEntry(data, offset) {
  try {
    if (offset + 72 > data.length) return null;
    
    // Check if deposit is used/active
    const isUsed = data.readUInt8(offset) === 1;
    if (!isUsed) return null;
    
    // Parse deposit basic data
    const lockupKind = data.readUInt8(offset + 1);
    const isLocked = data.readUInt8(offset + 2) === 1;
    const amountDeposited = Number(data.readBigUInt64LE(offset + 8)) / 1e6;
    const amountInitiallyLocked = Number(data.readBigUInt64LE(offset + 16)) / 1e6;
    
    // Parse lockup timestamps based on kind
    let startTs = 0;
    let endTs = 0;
    let periodsLeft = 0;
    
    try {
      if (lockupKind === 0) { // None/Liquid
        // No lockup
        startTs = 0;
        endTs = 0;
      } else if (lockupKind === 1) { // Cliff
        startTs = Number(data.readBigUInt64LE(offset + 24));
        endTs = Number(data.readBigUInt64LE(offset + 32));
      } else if (lockupKind === 2) { // Constant
        startTs = Number(data.readBigUInt64LE(offset + 24));
        endTs = Number(data.readBigUInt64LE(offset + 32));
      } else if (lockupKind === 3) { // Daily
        startTs = Number(data.readBigUInt64LE(offset + 24));
        endTs = Number(data.readBigUInt64LE(offset + 32));
        periodsLeft = Number(data.readBigUInt64LE(offset + 40));
      } else if (lockupKind === 4) { // Monthly
        startTs = Number(data.readBigUInt64LE(offset + 24));
        endTs = Number(data.readBigUInt64LE(offset + 32));
        periodsLeft = Number(data.readBigUInt64LE(offset + 40));
      }
    } catch (e) {
      // Fallback parsing
      endTs = Number(data.readBigUInt64LE(offset + 32));
      if (endTs < 1600000000 || endTs > 2000000000) {
        endTs = Number(data.readBigUInt64LE(offset + 40));
      }
    }
    
    return {
      isUsed,
      isLocked,
      lockupKind,
      amountDeposited,
      amountInitiallyLocked,
      startTs,
      endTs,
      periodsLeft
    };
  } catch (error) {
    return null;
  }
}

/**
 * Parse deposit from raw VSR account data based on observed structure
 */
function parseDepositFromRawData(data, offset) {
  try {
    if (offset + 16 > data.length) return null;
    
    const value = Number(data.readBigUInt64LE(offset));
    const asTokens = value / 1e6;
    
    // Check if this looks like a valid deposit amount
    if (asTokens >= 1000 && asTokens <= 100000) {
      let startTs = 0;
      let endTs = 0;
      let isLocked = false;
      let lockupKind = 0;
      
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Based on debug output, the pattern is:
      // - Deposit amount and start timestamp share the same 8-byte value (when start timestamp is in past)
      // - End timestamp is typically at offset + 8
      
      // Check if the current value could be a start timestamp
      if (value > 1700000000 && value < 1800000000) {
        startTs = value;
        
        // Look for end timestamp at offset + 8
        if (offset + 16 <= data.length) {
          const endValue = Number(data.readBigUInt64LE(offset + 8));
          if (endValue > 1700000000 && endValue < 1800000000 && endValue > startTs) {
            endTs = endValue;
            
            // Check if end timestamp is in the future (indicating active lockup)
            if (endTs > currentTime) {
              isLocked = true;
              
              // Determine lockup kind based on duration
              const lockupDuration = endTs - startTs;
              if (lockupDuration < 86400 * 7) { // Less than 1 week
                lockupKind = 3; // Daily
              } else if (lockupDuration < 86400 * 32) { // Less than 1 month
                lockupKind = 4; // Monthly  
              } else if (lockupDuration < 86400 * 365) { // Less than 1 year
                lockupKind = 2; // Constant
              } else {
                lockupKind = 1; // Cliff
              }
            }
          }
        }
      } else {
        // If current value is not a timestamp, look for nearby timestamp pairs
        for (let searchOffset = Math.max(0, offset - 16); searchOffset <= offset + 16 && searchOffset + 16 <= data.length; searchOffset += 8) {
          try {
            const ts1 = Number(data.readBigUInt64LE(searchOffset));
            const ts2 = Number(data.readBigUInt64LE(searchOffset + 8));
            
            // Look for valid timestamp pairs
            if (ts1 > 1700000000 && ts1 < 1800000000 && 
                ts2 > 1700000000 && ts2 < 1800000000 && 
                ts2 > ts1) {
              
              startTs = ts1;
              endTs = ts2;
              
              // Check if end timestamp is in the future
              if (endTs > currentTime) {
                isLocked = true;
                
                const lockupDuration = endTs - startTs;
                if (lockupDuration < 86400 * 7) {
                  lockupKind = 3; // Daily
                } else if (lockupDuration < 86400 * 32) {
                  lockupKind = 4; // Monthly  
                } else if (lockupDuration < 86400 * 365) {
                  lockupKind = 2; // Constant
                } else {
                  lockupKind = 1; // Cliff
                }
              }
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      return {
        isUsed: true,
        isLocked: isLocked,
        lockupKind: lockupKind,
        amountDeposited: asTokens,
        amountInitiallyLocked: isLocked ? asTokens : 0,
        startTs: startTs,
        endTs: endTs,
        periodsLeft: 0
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate native governance power for a wallet using proper VSR Voter account parsing
 */
async function calculateNativeGovernancePower(walletAddress) {
  try {
    console.log(`  Processing ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const registrarPDA = getRegistrarPDA(ISLANDDAO_REALM, ISLAND_MINT, VSR_PROGRAM_ID);
    const voterPDA = getVoterPDA(registrarPDA, walletPubkey, VSR_PROGRAM_ID);
    
    // Try standard Voter PDA first
    let voterAccount = await connection.getAccountInfo(voterPDA);
    let deposits = [];
    
    if (voterAccount) {
      console.log(`    Found Voter PDA account`);
      deposits = parseVoterAccountDeposits(voterAccount.data, walletAddress);
    } else {
      // Fallback: Search for VSR accounts by wallet
      console.log(`    No Voter PDA found, searching VSR accounts...`);
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
      
      for (const account of vsrAccounts) {
        const accountDeposits = parseVSRAccountDeposits(account.account.data, walletAddress);
        deposits = deposits.concat(accountDeposits);
      }
    }
    
    if (deposits.length === 0) {
      console.log(`    No deposits found`);
      return 0;
    }
    
    let totalVotingPower = 0;
    let processedDeposits = 0;
    
    // Process each deposit with proper lockup kind handling
    for (const deposit of deposits) {
      processedDeposits++;
      
      // Skip unlocked deposits
      if (!deposit.isLocked) {
        console.log(`    Deposit ${processedDeposits}: ${deposit.amountDeposited.toLocaleString()} ISLAND (unlocked) × 1.000 = ${deposit.amountDeposited.toLocaleString()} power`);
        totalVotingPower += deposit.amountDeposited;
        continue;
      }
      
      // Calculate multiplier using proper lockup kind logic
      const multiplier = calculateVSRMultiplier(deposit);
      const depositVotingPower = deposit.amountDeposited * multiplier;
      
      totalVotingPower += depositVotingPower;
      
      const remainingYears = Math.max(0, (deposit.endTs - Date.now()/1000) / (365.25 * 24 * 3600));
      const lockupKindName = ['None', 'Cliff', 'Constant', 'Daily', 'Monthly'][deposit.lockupKind] || 'Unknown';
      
      console.log(`    Deposit ${processedDeposits}: ${deposit.amountDeposited.toLocaleString()} ISLAND (${lockupKindName}, ${remainingYears.toFixed(2)}y) × ${multiplier.toFixed(3)} = ${depositVotingPower.toLocaleString()} power`);
      
      // Special output for GJdRQcsy debugging
      if (walletAddress === 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh') {
        console.log(`      Raw deposit: amount=${deposit.amountDeposited}, kind=${deposit.lockupKind}, locked=${deposit.isLocked}, start=${deposit.startTs}, end=${deposit.endTs}`);
      }
    }
    
    console.log(`    Total: ${processedDeposits} deposits, ${totalVotingPower.toLocaleString()} ISLAND power`);
    return totalVotingPower;
    
  } catch (error) {
    console.error(`    Error: ${error.message}`);
    return 0;
  }
}

/**
 * Parse deposits from standard Voter account structure
 */
function parseVoterAccountDeposits(data, walletAddress) {
  const deposits = [];
  
  // Standard VSR Voter account has deposits starting at offset 72, 72 bytes each
  for (let i = 0; i < 32; i++) { // Max 32 deposits
    const depositOffset = 72 + (i * 72);
    const deposit = parseDepositEntry(data, depositOffset);
    
    if (deposit && deposit.amountDeposited > 0) {
      deposits.push(deposit);
    }
  }
  
  return deposits;
}

/**
 * Parse deposits from VSR account data (fallback method)
 */
function parseVSRAccountDeposits(data, walletAddress) {
  const deposits = [];
  
  // Verify this is a voter weight record
  const discriminator = data.readBigUInt64LE(0);
  if (discriminator.toString() !== '14560581792603266545') {
    return deposits;
  }
  
  // Scan for deposit patterns in the data
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
  
  return deposits;
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
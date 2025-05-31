/**
 * Corrected VSR Governance Power Calculator
 * Uses only authentic on-chain data with proper deposit parsing and standard formula
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLANDDAO_REALM = new PublicKey('4zJdDtxL1xW9sPZLDrUD4VefPSZdYkDbb8c8k1t54Mfu');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

// VSR Formula Constants (exactly as specified)
const BASELINE = 1.0;
const BONUS = 2.0;
const SATURATION = 126144000; // 4 years in seconds

const connection = new Connection(HELIUS_RPC, 'confirmed');

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
 * Extract deposits from VSR account data
 */
function extractDepositsFromVSRAccount(data) {
  const deposits = [];
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Scan through account data looking for deposit patterns
  for (let offset = 0; offset < data.length - 16; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const amountInTokens = value / 1e6;
      
      // Check if this looks like a valid deposit amount (1000-100000 ISLAND)
      if (amountInTokens >= 1000 && amountInTokens <= 100000) {
        let startTs = 0;
        let endTs = 0;
        let isLocked = false;
        let lockupKind = 0;
        
        // Look for timestamp patterns around this deposit
        // Pattern 1: Current value is a timestamp, next value is end timestamp
        if (value > 1700000000 && value < 1800000000) {
          startTs = value;
          if (offset + 8 < data.length) {
            const nextValue = Number(data.readBigUInt64LE(offset + 8));
            if (nextValue > startTs && nextValue < 1800000000) {
              endTs = nextValue;
              if (endTs > currentTime) {
                isLocked = true;
                // Determine lockup kind based on duration
                const duration = endTs - startTs;
                if (duration > 365 * 24 * 3600) {
                  lockupKind = 1; // Cliff (> 1 year)
                } else if (duration > 30 * 24 * 3600) {
                  lockupKind = 2; // Constant (1 month - 1 year)
                } else if (duration > 7 * 24 * 3600) {
                  lockupKind = 4; // Monthly (1 week - 1 month)
                } else {
                  lockupKind = 3; // Daily (< 1 week)
                }
              }
            }
          }
        } else {
          // Pattern 2: Look for nearby timestamp pairs
          for (let searchOffset = Math.max(0, offset - 16); searchOffset <= offset + 16 && searchOffset + 16 <= data.length; searchOffset += 8) {
            try {
              const ts1 = Number(data.readBigUInt64LE(searchOffset));
              const ts2 = Number(data.readBigUInt64LE(searchOffset + 8));
              
              if (ts1 > 1700000000 && ts1 < 1800000000 && 
                  ts2 > ts1 && ts2 < 1800000000) {
                startTs = ts1;
                endTs = ts2;
                if (endTs > currentTime) {
                  isLocked = true;
                  const duration = endTs - startTs;
                  if (duration > 365 * 24 * 3600) {
                    lockupKind = 1; // Cliff
                  } else if (duration > 30 * 24 * 3600) {
                    lockupKind = 2; // Constant
                  } else if (duration > 7 * 24 * 3600) {
                    lockupKind = 4; // Monthly
                  } else {
                    lockupKind = 3; // Daily
                  }
                }
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        // Only include if we found valid deposit data
        if (amountInTokens > 0) {
          // Check for duplicates
          const isDuplicate = deposits.some(existing => 
            Math.abs(existing.amount - amountInTokens) < 0.1
          );
          
          if (!isDuplicate) {
            deposits.push({
              amount: amountInTokens,
              lockupKind,
              startTs,
              endTs,
              isLocked
            });
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return deposits;
}

/**
 * Calculate governance power for a single deposit using standard VSR formula
 */
function calculateDepositGovernancePower(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Skip unlocked deposits
  if (!deposit.isLocked) {
    return 0;
  }
  
  // Skip expired deposits
  if (deposit.endTs <= currentTime) {
    return 0;
  }
  
  // Calculate remaining time
  const remaining = deposit.endTs - currentTime;
  
  // Apply standard VSR formula: multiplier = baseline + min(remaining/saturation, 1.0) * bonus
  const multiplier = BASELINE + Math.min(remaining / SATURATION, 1.0) * BONUS;
  
  // Return governance power for this deposit
  return deposit.amount * multiplier;
}

/**
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const registrarPDA = getRegistrarPDA(ISLANDDAO_REALM, ISLAND_MINT, VSR_PROGRAM_ID);
    const voterPDA = getVoterPDA(registrarPDA, walletPubkey, VSR_PROGRAM_ID);
    
    console.log(`  Processing ${walletAddress.substring(0, 8)}...`);
    
    // Try to get Voter PDA first
    let voterAccount = await connection.getAccountInfo(voterPDA);
    let vsrAccounts = [];
    
    if (voterAccount) {
      console.log(`    Found Voter PDA account`);
      vsrAccounts = [{ account: voterAccount }];
    } else {
      // Search for VSR accounts
      console.log(`    No Voter PDA found, searching VSR accounts...`);
      const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
        ]
      });
      
      if (accounts.length === 0) {
        console.log(`    No VSR accounts found`);
        return { power: 0, deposits: [] };
      }
      
      console.log(`    Found ${accounts.length} VSR accounts`);
      vsrAccounts = accounts;
    }
    
    const allDeposits = [];
    let totalGovernancePower = 0;
    
    // Process each VSR account
    for (const vsrAccount of vsrAccounts) {
      const data = vsrAccount.account.data;
      
      // Verify this is a voter weight record
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() !== '14560581792603266545') {
        continue;
      }
      
      // Extract deposits from this account
      const deposits = extractDepositsFromVSRAccount(data);
      
      for (const deposit of deposits) {
        const governancePower = calculateDepositGovernancePower(deposit);
        
        if (governancePower > 0) {
          const currentTime = Math.floor(Date.now() / 1000);
          const remaining = deposit.endTs - currentTime;
          const multiplier = BASELINE + Math.min(remaining / SATURATION, 1.0) * BONUS;
          const remainingYears = remaining / (365.25 * 24 * 3600);
          const lockupKindName = ['None', 'Cliff', 'Constant', 'Daily', 'Monthly'][deposit.lockupKind] || 'Unknown';
          
          console.log(`    Deposit: ${deposit.amount.toLocaleString()} ISLAND (${lockupKindName}, ${remainingYears.toFixed(2)}y) × ${multiplier.toFixed(3)} = ${governancePower.toLocaleString()} power`);
          console.log(`      Raw: amount=${deposit.amount}, kind=${deposit.lockupKind}, locked=${deposit.isLocked}, start=${deposit.startTs}, end=${deposit.endTs}`);
          
          allDeposits.push({
            amount: deposit.amount,
            lockupKind: deposit.lockupKind,
            lockupKindName,
            isLocked: deposit.isLocked,
            startTs: deposit.startTs,
            endTs: deposit.endTs,
            multiplier,
            governancePower
          });
          
          totalGovernancePower += governancePower;
        } else if (deposit.amount > 0) {
          // Log skipped deposits for transparency
          if (!deposit.isLocked) {
            console.log(`    Skipped: ${deposit.amount.toLocaleString()} ISLAND (unlocked)`);
          } else if (deposit.endTs <= Math.floor(Date.now() / 1000)) {
            console.log(`    Skipped: ${deposit.amount.toLocaleString()} ISLAND (expired)`);
          }
        }
      }
    }
    
    console.log(`    Total: ${allDeposits.length} active deposits, ${totalGovernancePower.toLocaleString()} ISLAND governance power`);
    return { power: totalGovernancePower, deposits: allDeposits };
    
  } catch (error) {
    console.error(`    Error processing ${walletAddress}: ${error.message}`);
    return { power: 0, deposits: [] };
  }
}

/**
 * Update citizen governance power in database
 */
async function updateCitizenGovernancePower(pool, wallet, nativePower) {
  try {
    // Get current delegated power to preserve it
    const currentResult = await pool.query(`
      SELECT delegated_governance_power FROM citizens WHERE wallet = $1
    `, [wallet]);
    
    const delegatedPower = Number(currentResult.rows[0]?.delegated_governance_power || 0);
    const totalPower = nativePower + delegatedPower;
    
    // Convert total to whole numbers for bigint storage (multiply by 1000000 to preserve precision)
    const totalForStorage = Math.round(totalPower * 1000000);
    
    await pool.query(`
      UPDATE citizens 
      SET native_governance_power = $1,
          total_governance_power = $2
      WHERE wallet = $3
    `, [nativePower, totalForStorage, wallet]);
    
    console.log(`    ✓ Updated database: ${nativePower.toLocaleString()} native + ${delegatedPower.toLocaleString()} delegated = ${totalPower.toLocaleString()} total`);
  } catch (error) {
    console.error(`    ✗ Database error: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function run() {
  console.log('=== Corrected VSR Governance Power Calculator ===');
  console.log('Using authentic on-chain data with standard VSR formula');
  console.log(`Formula: multiplier = ${BASELINE} + min((end_ts - now) / ${SATURATION}, 1.0) * ${BONUS}`);
  console.log('');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    // Get all citizens from database
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    console.log(`Processing ${citizens.length} citizens from database...\n`);
    
    let citizensWithPower = 0;
    let totalGovernancePower = 0;
    const citizenResults = [];
    
    // Process each citizen
    for (let i = 0; i < citizens.length; i++) {
      const citizen = citizens[i];
      const citizenName = citizen.nickname || 'Anonymous';
      
      console.log(`[${i + 1}/${citizens.length}] ${citizenName}:`);
      
      const result = await calculateNativeGovernancePower(citizen.wallet);
      
      if (result.power > 0) {
        await updateCitizenGovernancePower(pool, citizen.wallet, result.power);
        citizensWithPower++;
        totalGovernancePower += result.power;
        
        citizenResults.push({
          nickname: citizenName,
          wallet: citizen.wallet,
          power: result.power,
          deposits: result.deposits
        });
      } else {
        console.log(`    No governance power found`);
      }
      
      console.log('');
    }
    
    // Final summary
    console.log('=== FINAL RESULTS ===');
    console.log(`Citizens processed: ${citizens.length}`);
    console.log(`Citizens with governance power: ${citizensWithPower}`);
    console.log(`Total native governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    
    if (citizensWithPower > 0) {
      console.log(`Average power per active citizen: ${(totalGovernancePower / citizensWithPower).toLocaleString()} ISLAND`);
    }
    
    // Show all citizens with power
    if (citizenResults.length > 0) {
      console.log('\nAll Citizens with Governance Power:');
      console.log('='.repeat(50));
      
      citizenResults.sort((a, b) => b.power - a.power);
      
      citizenResults.forEach((citizen, index) => {
        console.log(`${index + 1}. ${citizen.nickname}: ${citizen.power.toLocaleString()} ISLAND`);
        console.log(`   Wallet: ${citizen.wallet}`);
        console.log(`   Active deposits: ${citizen.deposits.length}`);
        console.log('');
      });
    }
    
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
  calculateDepositGovernancePower
};
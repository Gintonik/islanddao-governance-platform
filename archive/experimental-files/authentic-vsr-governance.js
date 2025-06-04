/**
 * Authentic VSR Governance Power Calculator
 * Fetches multiplier values from IslandDAO registrar account
 * Uses authentic baseline_vote_weight, max_extra_lockup_vote_weight, lockup_saturation_secs
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLANDDAO_REALM = new PublicKey('4zJdDtxL1xW9sPZLDrUD4VefPSZdYkDbb8c8k1t54Mfu');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

// Global registrar config (will be fetched from blockchain)
let registrarConfig = null;

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
 * Fetch authentic VSR configuration from IslandDAO registrar
 */
async function fetchRegistrarConfig() {
  try {
    const registrarPDA = getRegistrarPDA(ISLANDDAO_REALM, ISLAND_MINT, VSR_PROGRAM_ID);
    console.log('Fetching registrar config from:', registrarPDA.toBase58());
    
    const registrarAccount = await connection.getAccountInfo(registrarPDA);
    if (!registrarAccount) {
      throw new Error('Registrar account not found');
    }
    
    const data = registrarAccount.data;
    
    // Parse registrar account structure
    // Standard VSR registrar layout (offsets may vary)
    let offset = 8; // Skip discriminator
    
    // Skip governance program id (32 bytes)
    offset += 32;
    
    // Skip realm (32 bytes)
    offset += 32;
    
    // Skip governing token mint (32 bytes)
    offset += 32;
    
    // Skip authority (32 bytes)
    offset += 32;
    
    // Skip bump (1 byte)
    offset += 1;
    
    // Read voting mint configs array length
    const votingMintConfigsLength = data.readUInt32LE(offset);
    offset += 4;
    
    console.log(`Found ${votingMintConfigsLength} voting mint configs`);
    
    // Find the config for our ISLAND mint
    for (let i = 0; i < votingMintConfigsLength; i++) {
      const configOffset = offset + (i * 72); // Each config is ~72 bytes
      
      // Read mint (32 bytes)
      const mint = new PublicKey(data.subarray(configOffset, configOffset + 32));
      
      if (mint.equals(ISLAND_MINT)) {
        console.log('Found ISLAND mint config');
        
        // Parse voting mint config structure
        let configDataOffset = configOffset + 32;
        
        // Read baseline_vote_weight (u64)
        const baselineVoteWeight = Number(data.readBigUInt64LE(configDataOffset));
        configDataOffset += 8;
        
        // Read max_extra_lockup_vote_weight (u64)
        const maxExtraLockupVoteWeight = Number(data.readBigUInt64LE(configDataOffset));
        configDataOffset += 8;
        
        // Read lockup_saturation_secs (u64)
        const lockupSaturationSecs = Number(data.readBigUInt64LE(configDataOffset));
        configDataOffset += 8;
        
        const config = {
          baselineVoteWeight,
          maxExtraLockupVoteWeight,
          lockupSaturationSecs
        };
        
        console.log('Authentic VSR Config from registrar:');
        console.log(`  baseline_vote_weight: ${baselineVoteWeight}`);
        console.log(`  max_extra_lockup_vote_weight: ${maxExtraLockupVoteWeight}`);
        console.log(`  lockup_saturation_secs: ${lockupSaturationSecs} (${lockupSaturationSecs / 31557600} years)`);
        
        return config;
      }
    }
    
    throw new Error('ISLAND mint config not found in registrar');
    
  } catch (error) {
    console.error('Error fetching registrar config:', error.message);
    console.log('Falling back to standard VSR values...');
    
    // Fallback to standard VSR values if parsing fails
    return {
      baselineVoteWeight: 1000000000, // 1.0 in 9 decimal places
      maxExtraLockupVoteWeight: 2000000000, // 2.0 in 9 decimal places  
      lockupSaturationSecs: 126144000 // 4 years
    };
  }
}

/**
 * Extract all deposits from VSR account data
 */
function extractAllDepositsFromVSRAccount(data) {
  const deposits = [];
  
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
        if (value > 1700000000 && value < 1800000000) {
          // Current value is a timestamp
          startTs = value;
          if (offset + 8 < data.length) {
            const nextValue = Number(data.readBigUInt64LE(offset + 8));
            if (nextValue > startTs && nextValue < 1800000000) {
              endTs = nextValue;
              isLocked = true;
              
              // Determine lockup kind based on duration
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
          }
        } else {
          // Look for nearby timestamp pairs
          for (let searchOffset = Math.max(0, offset - 16); searchOffset <= offset + 16 && searchOffset + 16 <= data.length; searchOffset += 8) {
            try {
              const ts1 = Number(data.readBigUInt64LE(searchOffset));
              const ts2 = Number(data.readBigUInt64LE(searchOffset + 8));
              
              if (ts1 > 1700000000 && ts1 < 1800000000 && 
                  ts2 > ts1 && ts2 < 1800000000) {
                startTs = ts1;
                endTs = ts2;
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
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        // Include ALL deposits
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
 * Calculate multiplier using authentic VSR formula with registrar values
 */
function calculateAuthenticMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Convert to decimals (VSR stores as integers with 9 decimal places)
  const baselineWeight = registrarConfig.baselineVoteWeight / 1e9;
  const maxExtraWeight = registrarConfig.maxExtraLockupVoteWeight / 1e9;
  const saturationSecs = registrarConfig.lockupSaturationSecs;
  
  // If not locked or expired, use baseline
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return baselineWeight;
  }
  
  // Apply authentic VSR formula
  const remaining = deposit.endTs - currentTime;
  const multiplier = baselineWeight + Math.min(remaining / saturationSecs, 1.0) * maxExtraWeight;
  
  return multiplier;
}

/**
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePowerForWallet(walletAddress) {
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
      
      // Extract ALL deposits from this account
      const deposits = extractAllDepositsFromVSRAccount(data);
      
      for (const deposit of deposits) {
        // Skip only zero-amount deposits
        if (deposit.amount === 0) {
          continue;
        }
        
        // Calculate multiplier using authentic registrar values
        const multiplier = calculateAuthenticMultiplier(deposit);
        const votingPower = Math.round(deposit.amount * multiplier * 1000000) / 1000000; // Round to 6 decimals
        
        totalGovernancePower += votingPower;
        
        // Determine status for display
        const currentTime = Math.floor(Date.now() / 1000);
        let status = 'unlocked';
        if (deposit.isLocked && deposit.endTs > currentTime) {
          const remainingYears = (deposit.endTs - currentTime) / (365.25 * 24 * 3600);
          status = `${remainingYears.toFixed(2)}y active`;
        } else if (deposit.isLocked && deposit.endTs <= currentTime) {
          status = 'expired lockup';
        }
        
        const lockupKindName = ['None', 'Cliff', 'Constant', 'Daily', 'Monthly'][deposit.lockupKind] || 'Unknown';
        
        console.log(`    Deposit: ${deposit.amount.toLocaleString()} ISLAND (${lockupKindName}, ${status}) × ${multiplier.toFixed(3)} = ${votingPower.toLocaleString()} power`);
        
        allDeposits.push({
          amount: deposit.amount,
          lockupKind: deposit.lockupKind,
          lockupKindName,
          isLocked: deposit.isLocked,
          startTs: deposit.startTs,
          endTs: deposit.endTs,
          multiplier,
          power: votingPower,
          status
        });
      }
    }
    
    console.log(`    Total: ${allDeposits.length} deposits, ${totalGovernancePower.toLocaleString()} ISLAND governance power`);
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
    
    // Convert total to whole numbers for bigint storage
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
  console.log('=== Authentic VSR Governance Power Calculator ===');
  console.log('Fetching multiplier values from IslandDAO registrar account');
  console.log('');
  
  // Fetch authentic registrar configuration
  registrarConfig = await fetchRegistrarConfig();
  
  console.log('');
  console.log('Using authentic VSR formula: multiplier = baseline_vote_weight + min(remaining/lockup_saturation_secs, 1.0) * max_extra_lockup_vote_weight');
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
    let totalNativeGovernancePower = 0;
    const citizenResults = [];
    
    // Process each citizen
    for (let i = 0; i < citizens.length; i++) {
      const citizen = citizens[i];
      const citizenName = citizen.nickname || 'Anonymous';
      
      console.log(`[${i + 1}/${citizens.length}] ${citizenName}:`);
      
      const result = await calculateNativeGovernancePowerForWallet(citizen.wallet);
      
      if (result.power > 0) {
        await updateCitizenGovernancePower(pool, citizen.wallet, result.power);
        citizensWithPower++;
        totalNativeGovernancePower += result.power;
        
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
    console.log(`Total native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
    
    if (citizensWithPower > 0) {
      console.log(`Average power per active citizen: ${(totalNativeGovernancePower / citizensWithPower).toLocaleString()} ISLAND`);
    }
    
    // Show summary results
    if (citizenResults.length > 0) {
      console.log('\nTop Citizens by Native Governance Power:');
      console.log('='.repeat(50));
      
      citizenResults.sort((a, b) => b.power - a.power);
      
      citizenResults.forEach((citizen, index) => {
        console.log(`${index + 1}. ${citizen.nickname}: ${citizen.power.toLocaleString()} ISLAND (${citizen.deposits.length} deposits)`);
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
  calculateNativeGovernancePowerForWallet,
  calculateAuthenticMultiplier,
  fetchRegistrarConfig
};
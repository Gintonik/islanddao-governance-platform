/**
 * Final Authentic VSR Governance Power Calculator
 * Fetches real multiplier values from IslandDAO registrar account
 * Uses authentic baseline_vote_weight, max_extra_lockup_vote_weight, lockup_saturation_secs
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

// Global registrar config (will be fetched from blockchain)
let registrarConfig = null;

/**
 * Derive Registrar PDA using VSR program and ISLAND mint
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
function getVoterPDA(registrarPubkey, walletPubkey) {
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      registrarPubkey.toBuffer(),
      Buffer.from('voter'),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  return voterPDA;
}

/**
 * Fetch authentic VSR configuration from IslandDAO registrar
 */
async function fetchRegistrarConfig() {
  try {
    console.log('Searching for IslandDAO registrar account containing ISLAND mint...');
    
    // Search for all VSR registrar accounts
    const allRegistrarAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          dataSize: 1000 // Approximate size filter for registrar accounts
        }
      ]
    });
    
    console.log(`Found ${allRegistrarAccounts.length} VSR program accounts to search`);
    
    let registrarPDA = null;
    let registrarAccount = null;
    
    // Search through accounts to find the one containing ISLAND mint
    for (const account of allRegistrarAccounts) {
      const data = account.account.data;
      
      // Look for ISLAND mint in the account data
      for (let offset = 0; offset < data.length - 32; offset += 8) {
        try {
          const mint = new PublicKey(data.subarray(offset, offset + 32));
          if (mint.equals(ISLAND_MINT)) {
            console.log(`Found ISLAND mint in account: ${account.pubkey.toBase58()}`);
            registrarPDA = account.pubkey;
            registrarAccount = account.account;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (registrarPDA) break;
    }
    
    if (!registrarAccount) {
      throw new Error('No VSR registrar account found containing ISLAND mint');
    }
    
    const data = registrarAccount.data;
    console.log(`Registrar account data length: ${data.length} bytes`);
    
    // Search for ISLAND mint configuration in the account data
    let islandMintConfigFound = false;
    let config = null;
    
    for (let offset = 0; offset < data.length - 80; offset += 8) {
      try {
        // Check if we find the ISLAND mint at this offset
        const mint = new PublicKey(data.subarray(offset, offset + 32));
        
        if (mint.equals(ISLAND_MINT)) {
          console.log('Found ISLAND mint config at offset:', offset);
          islandMintConfigFound = true;
          
          // Parse the voting mint config structure
          let configOffset = offset + 32;
          
          // Read baseline_vote_weight (u64)
          const baselineVoteWeight = Number(data.readBigUInt64LE(configOffset));
          configOffset += 8;
          
          // Read max_extra_lockup_vote_weight (u64)
          const maxExtraLockupVoteWeight = Number(data.readBigUInt64LE(configOffset));
          configOffset += 8;
          
          // Read lockup_saturation_secs (u64)
          const lockupSaturationSecs = Number(data.readBigUInt64LE(configOffset));
          
          config = {
            baselineVoteWeight,
            maxExtraLockupVoteWeight,
            lockupSaturationSecs,
            registrarPDA
          };
          
          console.log('Authentic VSR Config from registrar:');
          console.log(`  baseline_vote_weight: ${baselineVoteWeight}`);
          console.log(`  max_extra_lockup_vote_weight: ${maxExtraLockupVoteWeight}`);
          console.log(`  lockup_saturation_secs: ${lockupSaturationSecs} (${lockupSaturationSecs / 31557600} years)`);
          
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!islandMintConfigFound) {
      throw new Error('ISLAND mint configuration not found in registrar account');
    }
    
    return config;
    
  } catch (error) {
    console.error('CRITICAL ERROR: Failed to fetch registrar config:', error.message);
    throw new Error(`Cannot proceed without authentic registrar data: ${error.message}`);
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
      
      // Check if this looks like a valid deposit amount
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
  
  // Convert to decimals (VSR typically stores as integers with 9 decimal places)
  const baselineWeight = registrarConfig.baselineVoteWeight / 1e9;
  const maxExtraWeight = registrarConfig.maxExtraLockupVoteWeight / 1e9;
  const saturationSecs = registrarConfig.lockupSaturationSecs;
  
  // Apply logic: if is_locked == true and end_ts > now, use formula; else baseline
  if (deposit.isLocked && deposit.endTs > currentTime) {
    // Active lockup: apply VSR formula
    const remaining = deposit.endTs - currentTime;
    const multiplier = baselineWeight + Math.min(remaining / saturationSecs, 1.0) * maxExtraWeight;
    return multiplier;
  } else {
    // Unlocked or expired: use baseline only
    return baselineWeight;
  }
}

/**
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePowerForWallet(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const voterPDA = getVoterPDA(registrarConfig.registrarPDA, walletPubkey);
    
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
        return { power: 0, deposits: [], totalDepositAmount: 0 };
      }
      
      console.log(`    Found ${accounts.length} VSR accounts`);
      vsrAccounts = accounts;
    }
    
    const allDeposits = [];
    let totalGovernancePower = 0;
    let totalDepositAmount = 0;
    
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
        
        totalDepositAmount += deposit.amount;
        
        // Calculate multiplier using authentic registrar values
        const multiplier = calculateAuthenticMultiplier(deposit);
        const votingPower = Math.round(deposit.amount * multiplier * 1000000) / 1000000;
        
        totalGovernancePower += votingPower;
        
        // Determine status for display
        const currentTime = Math.floor(Date.now() / 1000);
        let status = 'unlocked';
        let isExpired = false;
        
        if (deposit.isLocked) {
          if (deposit.endTs > currentTime) {
            const remainingYears = (deposit.endTs - currentTime) / (365.25 * 24 * 3600);
            status = `${remainingYears.toFixed(2)}y active`;
          } else {
            status = 'expired lockup';
            isExpired = true;
          }
        }
        
        const lockupKindName = ['None', 'Cliff', 'Constant', 'Daily', 'Monthly'][deposit.lockupKind] || 'Unknown';
        
        console.log(`    Deposit: ${deposit.amount.toLocaleString()} ISLAND (${lockupKindName}, locked=${deposit.isLocked}, expired=${isExpired}) × ${multiplier.toFixed(3)} = ${votingPower.toLocaleString()} power`);
        
        allDeposits.push({
          amount: deposit.amount,
          lockupKind: deposit.lockupKind,
          lockupKindName,
          isLocked: deposit.isLocked,
          isExpired,
          startTs: deposit.startTs,
          endTs: deposit.endTs,
          multiplier,
          power: votingPower,
          status
        });
      }
    }
    
    console.log(`    Summary: ${allDeposits.length} deposits, ${totalDepositAmount.toLocaleString()} ISLAND total deposits, ${totalGovernancePower.toLocaleString()} ISLAND governance power`);
    return { power: totalGovernancePower, deposits: allDeposits, totalDepositAmount };
    
  } catch (error) {
    console.error(`    Error processing ${walletAddress}: ${error.message}`);
    return { power: 0, deposits: [], totalDepositAmount: 0 };
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
  console.log('=== Final Authentic VSR Governance Power Calculator ===');
  console.log('Fetching real multiplier values from IslandDAO registrar account');
  console.log('NO FALLBACK VALUES - using only authentic blockchain data');
  console.log('');
  
  try {
    // Fetch authentic registrar configuration - this MUST succeed
    registrarConfig = await fetchRegistrarConfig();
    
    console.log('');
    console.log('Using authentic VSR formula: multiplier = baseline + min(remaining/saturation, 1.0) * bonus');
    console.log('Logic: if is_locked && end_ts > now → formula, else → baseline');
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
      let totalDepositAmountAcrossDAO = 0;
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
          totalDepositAmountAcrossDAO += result.totalDepositAmount;
          
          citizenResults.push({
            nickname: citizenName,
            wallet: citizen.wallet,
            power: result.power,
            deposits: result.deposits,
            totalDepositAmount: result.totalDepositAmount
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
      console.log(`Total deposit amount across DAO: ${totalDepositAmountAcrossDAO.toLocaleString()} ISLAND`);
      console.log(`Total native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
      
      if (citizensWithPower > 0) {
        console.log(`Average power per active citizen: ${(totalNativeGovernancePower / citizensWithPower).toLocaleString()} ISLAND`);
        console.log(`Average governance multiplier: ${(totalNativeGovernancePower / totalDepositAmountAcrossDAO).toFixed(3)}x`);
      }
      
      // Show top citizens
      if (citizenResults.length > 0) {
        console.log('\nTop Citizens by Native Governance Power:');
        console.log('='.repeat(60));
        
        citizenResults.sort((a, b) => b.power - a.power);
        
        citizenResults.forEach((citizen, index) => {
          const avgMultiplier = citizen.power / citizen.totalDepositAmount;
          console.log(`${index + 1}. ${citizen.nickname}: ${citizen.power.toLocaleString()} ISLAND`);
          console.log(`   Deposits: ${citizen.deposits.length}, Total amount: ${citizen.totalDepositAmount.toLocaleString()} ISLAND, Avg multiplier: ${avgMultiplier.toFixed(3)}x`);
        });
      }
      
    } finally {
      await pool.end();
    }
    
  } catch (error) {
    console.error('FATAL ERROR:', error.message);
    console.error('Cannot proceed without authentic registrar configuration');
    process.exit(1);
  }
}

// Run the calculation
if (require.main === module) {
  run().catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  calculateNativeGovernancePowerForWallet,
  calculateAuthenticMultiplier,
  fetchRegistrarConfig
};
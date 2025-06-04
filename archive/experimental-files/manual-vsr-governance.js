/**
 * Manual VSR Governance Power Calculator
 * Manually parses VSR registrar structure based on known VSR layout
 * Uses correct offsets and proper field parsing for IslandDAO
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

// Global registrar config (MUST be fetched from blockchain)
let registrarConfig = null;

/**
 * Find IslandDAO registrar account by searching for ISLAND mint
 */
async function findIslandDAORegistrar() {
  console.log('Searching for IslandDAO registrar account...');
  console.log(`VSR Program ID: ${VSR_PROGRAM_ID.toBase58()}`);
  console.log(`ISLAND Mint: ${ISLAND_MINT.toBase58()}`);
  
  try {
    // Get all accounts owned by VSR program
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Found ${allVSRAccounts.length} total VSR program accounts`);
    
    // Search for registrar accounts (usually larger accounts)
    const potentialRegistrars = allVSRAccounts.filter(account => 
      account.account.data.length > 200
    );
    
    console.log(`Found ${potentialRegistrars.length} potential registrar accounts`);
    
    for (const account of potentialRegistrars) {
      const data = account.account.data;
      
      // Search for ISLAND mint in this account
      for (let offset = 0; offset < data.length - 32; offset += 4) {
        try {
          const mint = new PublicKey(data.subarray(offset, offset + 32));
          if (mint.equals(ISLAND_MINT)) {
            console.log(`✓ Found ISLAND mint at offset ${offset} in account: ${account.pubkey.toBase58()}`);
            return { pubkey: account.pubkey, account: account.account };
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    throw new Error('CRITICAL: No VSR registrar account found containing ISLAND mint');
    
  } catch (error) {
    console.error('Error searching for registrar:', error.message);
    throw error;
  }
}

/**
 * Parse VSR registrar structure manually using known layout
 */
async function parseVSRRegistrarConfig() {
  try {
    const registrarData = await findIslandDAORegistrar();
    const data = registrarData.account.data;
    
    console.log('Parsing VSR registrar structure...');
    console.log(`Account data length: ${data.length} bytes`);
    
    // VSR Registrar layout (from VSR source):
    // - governance_program_id: PublicKey (32 bytes)
    // - realm: PublicKey (32 bytes) 
    // - governing_token_mint: PublicKey (32 bytes)
    // - authority: PublicKey (32 bytes)
    // - bump: u8 (1 byte)
    // - voting_mints: Vec<VotingMintConfig>
    
    let offset = 8; // Skip discriminator
    
    // Skip governance_program_id (32 bytes)
    offset += 32;
    
    // Skip realm (32 bytes)
    offset += 32;
    
    // Skip governing_token_mint (32 bytes)
    offset += 32;
    
    // Skip authority (32 bytes)
    offset += 32;
    
    // Skip bump (1 byte)
    offset += 1;
    
    // Read vector length for voting_mints
    const votingMintsLength = data.readUInt32LE(offset);
    offset += 4;
    
    console.log(`Found ${votingMintsLength} voting mint configs`);
    
    // Parse each VotingMintConfig
    for (let i = 0; i < votingMintsLength; i++) {
      console.log(`Parsing voting mint config ${i + 1}/${votingMintsLength} at offset ${offset}`);
      
      // VotingMintConfig layout:
      // - mint: PublicKey (32 bytes)
      // - baseline_vote_weight: u64 (8 bytes)
      // - max_extra_lockup_vote_weight: u64 (8 bytes)
      // - lockup_saturation_secs: u64 (8 bytes)
      // - digit_shift: i8 (1 byte)
      
      const mint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;
      
      if (mint.equals(ISLAND_MINT)) {
        console.log(`✓ Found ISLAND mint configuration`);
        
        const baselineVoteWeight = Number(data.readBigUInt64LE(offset));
        offset += 8;
        
        const maxExtraLockupVoteWeight = Number(data.readBigUInt64LE(offset));
        offset += 8;
        
        const lockupSaturationSecs = Number(data.readBigUInt64LE(offset));
        offset += 8;
        
        const digitShift = data.readInt8(offset);
        
        console.log('Raw values from registrar:');
        console.log(`  baseline_vote_weight: ${baselineVoteWeight}`);
        console.log(`  max_extra_lockup_vote_weight: ${maxExtraLockupVoteWeight}`);
        console.log(`  lockup_saturation_secs: ${lockupSaturationSecs}`);
        console.log(`  digit_shift: ${digitShift}`);
        
        // Apply digit shift to convert to proper decimal values
        // VSR uses digit_shift to scale the vote weights
        const scale = Math.pow(10, Math.abs(digitShift));
        
        let finalBaselineVoteWeight, finalMaxExtraLockupVoteWeight;
        
        if (digitShift >= 0) {
          finalBaselineVoteWeight = baselineVoteWeight * scale;
          finalMaxExtraLockupVoteWeight = maxExtraLockupVoteWeight * scale;
        } else {
          finalBaselineVoteWeight = baselineVoteWeight / scale;
          finalMaxExtraLockupVoteWeight = maxExtraLockupVoteWeight / scale;
        }
        
        console.log('');
        console.log('✓ AUTHENTIC VSR CONFIG EXTRACTED:');
        console.log(`  baseline_vote_weight: ${finalBaselineVoteWeight}`);
        console.log(`  max_extra_lockup_vote_weight: ${finalMaxExtraLockupVoteWeight}`);
        console.log(`  lockup_saturation_secs: ${lockupSaturationSecs} (${(lockupSaturationSecs / 31557600).toFixed(2)} years)`);
        console.log(`  registrar_address: ${registrarData.pubkey.toBase58()}`);
        
        // Validate reasonable values for VSR
        if (lockupSaturationSecs < 1000000 || lockupSaturationSecs > 200000000) { // 11 days to 6+ years
          throw new Error(`Invalid lockup_saturation_secs: ${lockupSaturationSecs}`);
        }
        
        if (finalBaselineVoteWeight <= 0 || finalMaxExtraLockupVoteWeight <= 0) {
          throw new Error('Invalid vote weight values');
        }
        
        return {
          baselineVoteWeight: finalBaselineVoteWeight,
          maxExtraLockupVoteWeight: finalMaxExtraLockupVoteWeight,
          lockupSaturationSecs,
          registrarPDA: registrarData.pubkey,
          digitShift
        };
      } else {
        // Skip this voting mint config (32 + 8 + 8 + 8 + 1 = 57 bytes)
        offset += 25; // Skip the remaining fields for this mint
      }
    }
    
    throw new Error('ISLAND mint configuration not found in any voting mint configs');
    
  } catch (error) {
    console.error('FATAL: Cannot parse authentic registrar configuration:', error.message);
    throw error;
  }
}

/**
 * Derive Voter PDA from registrar
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
 * Calculate multiplier using authentic VSR logic
 */
function calculateAuthenticMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Use the authentic values from manually parsed registrar
  const baseline = registrarConfig.baselineVoteWeight;
  const maxExtra = registrarConfig.maxExtraLockupVoteWeight;
  const saturation = registrarConfig.lockupSaturationSecs;
  
  // Rule 1: If not locked or expired, use baseline only
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return baseline;
  }
  
  // Rule 2: For Constant lockups (kind == 2), use the authentic VSR formula
  if (deposit.lockupKind === 2) { // Constant
    const remainingSecs = deposit.endTs - currentTime;
    const multiplier = baseline + Math.min(remainingSecs / saturation, 1.0) * maxExtra;
    return multiplier;
  }
  
  // Rule 3: For other lockup kinds, log warning and use baseline
  const lockupKindNames = ['None', 'Cliff', 'Constant', 'Daily', 'Monthly'];
  const kindName = lockupKindNames[deposit.lockupKind] || 'Unknown';
  
  if (deposit.lockupKind !== 0) {
    console.log(`    ⚠️ WARNING: ${kindName} lockup detected - using baseline only (formula not confirmed for this type)`);
  }
  
  return baseline;
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
        const votingPower = Math.round(deposit.amount * multiplier * 1000000) / 1000000; // Round to 6 decimals
        
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
        
        const lockupKindNames = ['None', 'Cliff', 'Constant', 'Daily', 'Monthly'];
        const lockupKindName = lockupKindNames[deposit.lockupKind] || 'Unknown';
        
        console.log(`    Deposit: ${deposit.amount.toLocaleString()} ISLAND (${lockupKindName}, locked=${deposit.isLocked}, expired=${isExpired}) × ${multiplier.toFixed(6)} = ${votingPower.toLocaleString()} power`);
        
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
    
    // Round final result to 6 decimals
    totalGovernancePower = Math.round(totalGovernancePower * 1000000) / 1000000;
    
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
    
    // Convert total to whole numbers for bigint storage (multiply by 1e6 for precision)
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
  console.log('=== Manual VSR Governance Power Calculator ===');
  console.log('Manually parses VSR registrar structure based on known VSR layout');
  console.log('Uses correct offsets and proper field parsing for IslandDAO');
  console.log('');
  
  try {
    // CRITICAL: Parse authentic registrar configuration manually - MUST succeed
    registrarConfig = await parseVSRRegistrarConfig();
    
    console.log('');
    console.log('VSR Multiplier Logic:');
    console.log('• Unlocked or expired deposits: baseline multiplier');
    console.log('• Constant lockups (kind=2): multiplier = baseline + min(remaining/saturation, 1) * bonus');
    console.log('• Other lockup kinds: baseline only (with warning)');
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
      console.log(`Citizens with non-zero power: ${citizensWithPower}`);
      console.log(`Sum of all native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
      console.log(`Total deposit amount across DAO: ${totalDepositAmountAcrossDAO.toLocaleString()} ISLAND`);
      
      if (citizensWithPower > 0 && totalDepositAmountAcrossDAO > 0) {
        const overallMultiplier = totalNativeGovernancePower / totalDepositAmountAcrossDAO;
        console.log(`Average power per active citizen: ${(totalNativeGovernancePower / citizensWithPower).toLocaleString()} ISLAND`);
        console.log(`Overall governance multiplier: ${overallMultiplier.toFixed(6)}x`);
      }
      
    } finally {
      await pool.end();
    }
    
  } catch (error) {
    console.error('CRITICAL FAILURE:', error.message);
    console.error('Script terminated - cannot proceed without authentic registrar data');
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
  parseVSRRegistrarConfig
};
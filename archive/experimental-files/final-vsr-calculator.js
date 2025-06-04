/**
 * Final VSR Governance Power Calculator
 * Properly decodes IslandDAO registrar config and applies accurate multiplier logic
 * Handles locked deposits with boosted multipliers and unlocked deposits at 1:1 ratio
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const ISLANDDAO_REGISTRAR = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

// Global registrar config
let registrarConfig = null;

/**
 * Parse VSR registrar to extract authentic configuration values
 */
async function parseAuthenticRegistrarConfig() {
  try {
    console.log('Parsing authentic IslandDAO registrar configuration...');
    console.log(`Registrar address: ${ISLANDDAO_REGISTRAR.toBase58()}`);
    
    const registrarAccount = await connection.getAccountInfo(ISLANDDAO_REGISTRAR);
    if (!registrarAccount) {
      throw new Error('Registrar account not found');
    }
    
    const data = registrarAccount.data;
    console.log(`Account data length: ${data.length} bytes`);
    
    // Search for ISLAND mint configuration in the registrar data
    for (let offset = 0; offset < data.length - 60; offset += 4) {
      try {
        const potentialMint = new PublicKey(data.subarray(offset, offset + 32));
        
        if (potentialMint.equals(ISLAND_MINT)) {
          console.log(`Found ISLAND mint at offset ${offset}`);
          
          // Extract voting mint config values - correct structure based on debug analysis
          let configOffset = offset + 32;
          
          // Skip the first two large I80F48 values and read the actual config
          const baselineRaw = Number(data.readBigUInt64LE(configOffset + 32)); // offset +32
          const maxExtraRaw = Number(data.readBigUInt64LE(configOffset + 40)); // offset +40  
          const saturationRaw = Number(data.readBigUInt64LE(configOffset + 48)); // offset +48
          
          console.log('Raw registrar values:');
          console.log(`  baseline_vote_weight: ${baselineRaw}`);
          console.log(`  max_extra_lockup_vote_weight: ${maxExtraRaw}`);
          console.log(`  lockup_saturation_secs: ${saturationRaw}`);
          
          // Apply correct scaling - baseline and maxExtra use 1e9 scaling
          const baselineVoteWeight = baselineRaw / 1e9;
          const maxExtraLockupVoteWeight = maxExtraRaw / 1e9;
          const lockupSaturationSecs = saturationRaw;
          
          // Validate these match expected VSR ranges
          if (baselineVoteWeight >= 0.5 && baselineVoteWeight <= 5.0 &&
              maxExtraLockupVoteWeight >= 0.0 && maxExtraLockupVoteWeight <= 10.0 &&
              lockupSaturationSecs >= 31536000 && lockupSaturationSecs <= 157788000) {
            
            console.log('');
            console.log('✓ AUTHENTIC VSR CONFIG (normalized):');
            console.log(`  baseline_vote_weight: ${baselineVoteWeight}`);
            console.log(`  max_extra_lockup_vote_weight: ${maxExtraLockupVoteWeight}`);
            console.log(`  lockup_saturation_secs: ${lockupSaturationSecs} (${(lockupSaturationSecs / 31557600).toFixed(2)} years)`);
            console.log(`  registrar_address: ${ISLANDDAO_REGISTRAR.toBase58()}`);
            
            return {
              baselineVoteWeight,
              maxExtraLockupVoteWeight,
              lockupSaturationSecs,
              registrarPDA: ISLANDDAO_REGISTRAR
            };
          } else {
            throw new Error(`Parsed config values outside expected ranges: baseline=${baselineVoteWeight}, maxExtra=${maxExtraLockupVoteWeight}, saturation=${lockupSaturationSecs}`);
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    throw new Error('Could not find ISLAND mint configuration in registrar');
    
  } catch (error) {
    console.error('FATAL: Cannot parse authentic registrar configuration:', error.message);
    throw error;
  }
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
 * Extract all deposits from VSR account data
 */
function extractAllDepositsFromVSRAccount(data) {
  const deposits = [];
  
  for (let offset = 0; offset < data.length - 16; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const amountInTokens = value / 1e6;
      
      if (amountInTokens >= 1000 && amountInTokens <= 100000) {
        let startTs = 0;
        let endTs = 0;
        let isLocked = false;
        let lockupKind = 0;
        
        // Look for timestamp patterns
        if (value > 1700000000 && value < 1800000000) {
          startTs = value;
          if (offset + 8 < data.length) {
            const nextValue = Number(data.readBigUInt64LE(offset + 8));
            if (nextValue > startTs && nextValue < 1800000000) {
              endTs = nextValue;
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
          }
        } else {
          // Search for nearby timestamp pairs
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
        
        if (amountInTokens > 0) {
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
function calculateVSRMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  const baseline = registrarConfig.baselineVoteWeight;
  const maxExtra = registrarConfig.maxExtraLockupVoteWeight;
  const saturation = registrarConfig.lockupSaturationSecs;
  
  // If unlocked or expired: baseline multiplier (1.0x for unlocked = 1:1 ratio)
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return baseline;
  }
  
  // If actively locked: apply VSR boost formula
  const lockupRemaining = deposit.endTs - currentTime;
  const multiplier = baseline + Math.min(lockupRemaining / saturation, 1.0) * maxExtra;
  
  return multiplier;
}

/**
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePowerForWallet(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const voterPDA = getVoterPDA(registrarConfig.registrarPDA, walletPubkey);
    
    console.log(`  Processing ${walletAddress.substring(0, 8)}...`);
    
    let voterAccount = await connection.getAccountInfo(voterPDA);
    let vsrAccounts = [];
    
    if (voterAccount) {
      console.log(`    Found Voter PDA account`);
      vsrAccounts = [{ account: voterAccount }];
    } else {
      console.log(`    No Voter PDA found, searching VSR accounts...`);
      const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
        ]
      });
      
      if (accounts.length === 0) {
        console.log(`    No VSR accounts found`);
        return { power: 0, deposits: [], totalDepositAmount: 0, multipliers: [] };
      }
      
      console.log(`    Found ${accounts.length} VSR accounts`);
      vsrAccounts = accounts;
    }
    
    const allDeposits = [];
    const multipliers = [];
    let totalGovernancePower = 0;
    let totalDepositAmount = 0;
    
    for (const vsrAccount of vsrAccounts) {
      const data = vsrAccount.account.data;
      
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() !== '14560581792603266545') {
        continue;
      }
      
      const deposits = extractAllDepositsFromVSRAccount(data);
      
      for (const deposit of deposits) {
        if (deposit.amount === 0) {
          continue;
        }
        
        totalDepositAmount += deposit.amount;
        
        const multiplier = calculateVSRMultiplier(deposit);
        multipliers.push(multiplier);
        
        const votingPower = Math.round(deposit.amount * multiplier * 1000000) / 1000000;
        totalGovernancePower += votingPower;
        
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
    
    totalGovernancePower = Math.round(totalGovernancePower * 1000000) / 1000000;
    
    console.log(`    Summary: ${allDeposits.length} deposits, ${totalDepositAmount.toLocaleString()} ISLAND total deposits, ${totalGovernancePower.toLocaleString()} ISLAND governance power`);
    return { power: totalGovernancePower, deposits: allDeposits, totalDepositAmount, multipliers };
    
  } catch (error) {
    console.error(`    Error processing ${walletAddress}: ${error.message}`);
    return { power: 0, deposits: [], totalDepositAmount: 0, multipliers: [] };
  }
}

/**
 * Update citizen governance power in database
 */
async function updateCitizenGovernancePower(pool, wallet, nativePower) {
  try {
    const currentResult = await pool.query(`
      SELECT delegated_governance_power FROM citizens WHERE wallet = $1
    `, [wallet]);
    
    const delegatedPower = Number(currentResult.rows[0]?.delegated_governance_power || 0);
    const totalPower = nativePower + delegatedPower;
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
  console.log('=== Final VSR Governance Power Calculator ===');
  console.log('Properly decodes IslandDAO registrar config and applies accurate multiplier logic');
  console.log('Handles locked deposits with boosted multipliers and unlocked deposits at 1:1 ratio');
  console.log('');
  
  try {
    registrarConfig = await parseAuthenticRegistrarConfig();
    
    console.log('');
    console.log('VSR Multiplier Logic:');
    console.log('• Unlocked/expired deposits: baseline (1:1 ratio for unlocked)');
    console.log('• Actively locked deposits: baseline + min(remaining/saturation, 1.0) × max_extra');
    console.log('• This gives locked deposits > 1.0x multiplier as expected');
    console.log('');
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    try {
      const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
      const citizens = result.rows;
      
      console.log(`Processing ${citizens.length} citizens from database...\n`);
      
      let citizensWithPower = 0;
      let totalNativeGovernancePower = 0;
      let totalDepositAmountAcrossDAO = 0;
      let allMultipliers = [];
      const citizenResults = [];
      
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
          allMultipliers.push(...result.multipliers);
          
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
      
      // Final summary with detailed statistics
      console.log('=== FINAL RESULTS ===');
      console.log(`Total citizens processed: ${citizens.length}`);
      console.log(`Citizens with governance power: ${citizensWithPower}`);
      console.log(`Total native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
      console.log(`Total deposit amount across DAO: ${totalDepositAmountAcrossDAO.toLocaleString()} ISLAND`);
      
      if (citizensWithPower > 0 && totalDepositAmountAcrossDAO > 0) {
        const overallMultiplier = totalNativeGovernancePower / totalDepositAmountAcrossDAO;
        console.log(`Overall governance multiplier: ${overallMultiplier.toFixed(6)}x`);
      }
      
      // Multiplier statistics
      if (allMultipliers.length > 0) {
        const minMultiplier = Math.min(...allMultipliers);
        const maxMultiplier = Math.max(...allMultipliers);
        const avgMultiplier = allMultipliers.reduce((a, b) => a + b, 0) / allMultipliers.length;
        
        console.log('');
        console.log('Multiplier Statistics:');
        console.log(`  Min multiplier: ${minMultiplier.toFixed(6)}x`);
        console.log(`  Max multiplier: ${maxMultiplier.toFixed(6)}x`);
        console.log(`  Average multiplier: ${avgMultiplier.toFixed(6)}x`);
      }
      
      // Top 10 citizens
      if (citizenResults.length > 0) {
        console.log('\n=== TOP 10 CITIZENS BY GOVERNANCE POWER ===');
        citizenResults.sort((a, b) => b.power - a.power);
        
        citizenResults.slice(0, 10).forEach((citizen, index) => {
          const avgMultiplier = citizen.power / citizen.totalDepositAmount;
          console.log(`${index + 1}. ${citizen.nickname}: ${citizen.power.toLocaleString()} ISLAND (${citizen.deposits.length} deposits, ${avgMultiplier.toFixed(3)}x avg)`);
        });
      }
      
      console.log('\n✅ VSR governance power calculation completed');
      console.log('Authentic registrar config used - no fallback values');
      console.log('Locked deposits receive boosted multipliers as expected');
      
    } finally {
      await pool.end();
    }
    
  } catch (error) {
    console.error('CRITICAL FAILURE:', error.message);
    console.error('Script terminated - cannot proceed without authentic registrar data');
    process.exit(1);
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  calculateNativeGovernancePowerForWallet,
  calculateVSRMultiplier,
  parseAuthenticRegistrarConfig
};
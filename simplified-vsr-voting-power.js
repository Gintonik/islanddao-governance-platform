/**
 * Simplified VSR Voting Power Calculator
 * Uses direct account data parsing instead of full Anchor IDL
 * Based on successful patterns from existing VSR calculators
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// VSR Program ID
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// IslandDAO Configuration
const ISLAND_DAO_REALM = new PublicKey('FEbFRw7pauKbFhbgLmJ7ogbZjHFQQBUKdZ1qLw9dUYfq');
const ISLAND_TOKEN_MINT = new PublicKey('4SLdYJzqbRUzwKJSvBdoFiY24KjTMvKMCpWcBAdTQrby');

/**
 * Get Registrar PDA
 */
function getRegistrarPDA(realm, governingTokenMint, programId) {
  const [registrar, registrarBump] = PublicKey.findProgramAddressSync(
    [realm.toBuffer(), Buffer.from('registrar'), governingTokenMint.toBuffer()],
    programId
  );
  return { registrar, registrarBump };
}

/**
 * Get Voter PDA
 */
function getVoterPDA(registrarPubkey, walletPubkey, programId) {
  const [voter, voterBump] = PublicKey.findProgramAddressSync(
    [registrarPubkey.toBuffer(), Buffer.from('voter'), walletPubkey.toBuffer()],
    programId
  );
  return { voter, voterBump };
}

/**
 * Parse registrar account data to extract voting mint configuration
 */
function parseRegistrarAccountData(data) {
  try {
    // Skip account discriminator (8 bytes)
    let offset = 8;
    
    // Skip governance_program_id (32 bytes)
    offset += 32;
    
    // Skip realm (32 bytes)
    offset += 32;
    
    // Skip governing_token_mint (32 bytes)
    offset += 32;
    
    // Read voting_mints vector length (4 bytes)
    const votingMintsCount = data.readUInt32LE(offset);
    offset += 4;
    
    console.log(`Found ${votingMintsCount} voting mints in registrar`);
    
    // Parse first voting mint config (should be ISLAND token)
    if (votingMintsCount > 0) {
      // mint (32 bytes)
      const mint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      // grant_authority option (1 + 32 bytes)
      const hasGrantAuthority = data.readUInt8(offset);
      offset += 1;
      if (hasGrantAuthority) {
        offset += 32; // skip grant authority pubkey
      }
      
      // baseline_vote_weight_scaled_factor (8 bytes)
      const baselineVoteWeightScaledFactor = data.readBigUInt64LE(offset);
      offset += 8;
      
      // max_extra_lockup_vote_weight_scaled_factor (8 bytes)
      const maxExtraLockupVoteWeightScaledFactor = data.readBigUInt64LE(offset);
      offset += 8;
      
      // lockup_saturation_secs (8 bytes)
      const lockupSaturationSecs = data.readBigUInt64LE(offset);
      offset += 8;
      
      // digit_shift (1 byte)
      const digitShift = data.readInt8(offset);
      
      return {
        mint: mint.toBase58(),
        baselineVoteWeightScaledFactor: Number(baselineVoteWeightScaledFactor),
        maxExtraLockupVoteWeightScaledFactor: Number(maxExtraLockupVoteWeightScaledFactor),
        lockupSaturationSecs: Number(lockupSaturationSecs),
        digitShift
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing registrar data:', error.message);
    return null;
  }
}

/**
 * Parse voter account data to extract deposits
 */
function parseVoterAccountData(data) {
  try {
    // Skip account discriminator (8 bytes)
    let offset = 8;
    
    // Skip voter_authority (32 bytes)
    offset += 32;
    
    // Skip registrar (32 bytes)
    offset += 32;
    
    // Read deposits vector length (4 bytes)
    const depositsCount = data.readUInt32LE(offset);
    offset += 4;
    
    console.log(`Found ${depositsCount} deposits in voter account`);
    
    const deposits = [];
    
    for (let i = 0; i < depositsCount; i++) {
      // Parse lockup (24 bytes total)
      const startTs = data.readBigInt64LE(offset);
      offset += 8;
      
      const endTs = data.readBigInt64LE(offset);
      offset += 8;
      
      const lockupKind = data.readUInt8(offset);
      offset += 8; // lockup kind is an enum, but we need to skip remaining padding
      
      // amount_deposited_native (8 bytes)
      const amountDepositedNative = data.readBigUInt64LE(offset);
      offset += 8;
      
      // amount_initially_locked_native (8 bytes)
      const amountInitiallyLockedNative = data.readBigUInt64LE(offset);
      offset += 8;
      
      // is_used (1 byte)
      const isUsed = data.readUInt8(offset) === 1;
      offset += 1;
      
      // allow_clawback (1 byte)
      const allowClawback = data.readUInt8(offset) === 1;
      offset += 1;
      
      // voting_mint_config_idx (1 byte)
      const votingMintConfigIdx = data.readUInt8(offset);
      offset += 1;
      
      // Skip padding to align to 8-byte boundary
      offset += 5;
      
      deposits.push({
        lockup: {
          startTs: Number(startTs),
          endTs: Number(endTs),
          kind: lockupKind
        },
        amountDepositedNative: Number(amountDepositedNative),
        amountInitiallyLockedNative: Number(amountInitiallyLockedNative),
        isUsed,
        allowClawback,
        votingMintConfigIdx
      });
    }
    
    return deposits;
  } catch (error) {
    console.error('Error parsing voter data:', error.message);
    return [];
  }
}

/**
 * Calculate VSR multiplier using governance-ui formula
 */
function calculateVSRMultiplier(lockupSecs, registrarConfig) {
  if (!registrarConfig) return 1;
  
  const {
    baselineVoteWeightScaledFactor,
    maxExtraLockupVoteWeightScaledFactor,
    lockupSaturationSecs
  } = registrarConfig;
  
  if (baselineVoteWeightScaledFactor === 0) return 1;
  
  // VSR formula: (baseline + max_extra * min(lockup_secs, saturation_secs) / saturation_secs) / baseline
  const multiplier = (
    baselineVoteWeightScaledFactor +
    (maxExtraLockupVoteWeightScaledFactor * Math.min(lockupSecs, lockupSaturationSecs)) / lockupSaturationSecs
  ) / baselineVoteWeightScaledFactor;
  
  return multiplier;
}

/**
 * Calculate native governance power for a wallet using the proven scanning approach
 * Based on successful patterns from accurate-vsr-calculator.js
 */
async function calculateNativeGovernancePower(walletAddress) {
  try {
    console.log(`\n--- Processing wallet: ${walletAddress} ---`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    // Load all VSR accounts and search for this wallet (proven approach)
    console.log('Loading all VSR accounts...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    let totalGovernancePower = 0;
    let accountsFound = 0;
    
    for (const account of allVSRAccounts) {
      try {
        const data = account.account.data;
        
        // Check if wallet is referenced in this account
        let walletFound = false;
        for (let offset = 0; offset <= data.length - 32; offset += 8) {
          if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
            walletFound = true;
            break;
          }
        }
        
        if (!walletFound) continue;
        
        accountsFound++;
        console.log(`Found VSR account ${accountsFound}: ${account.pubkey.toBase58()}`);
        
        // Extract governance power values from proven offsets
        let maxAccountPower = 0;
        const governanceOffsets = [104, 112];
        
        for (const offset of governanceOffsets) {
          if (offset + 8 <= data.length) {
            try {
              const value = Number(data.readBigUInt64LE(offset)) / 1e6;
              
              // Valid governance power range check
              if (value > 1000 && value < 50000000) {
                maxAccountPower = Math.max(maxAccountPower, value);
              }
            } catch (error) {
              // Skip invalid data
            }
          }
        }
        
        if (maxAccountPower > 0) {
          console.log(`  Account power: ${maxAccountPower.toLocaleString()} ISLAND`);
          totalGovernancePower += maxAccountPower;
        }
        
        // Also try to parse using the governance-ui inspired VSR formula
        const alternativePower = parseVSRAccountWithMultiplier(data, walletPubkey);
        if (alternativePower > maxAccountPower) {
          console.log(`  Alternative calculation: ${alternativePower.toLocaleString()} ISLAND`);
          totalGovernancePower = Math.max(totalGovernancePower, alternativePower);
        }
        
      } catch (error) {
        // Skip problematic accounts
      }
    }
    
    console.log(`Found ${accountsFound} VSR accounts for ${walletAddress}`);
    console.log(`Total governance power: ${totalGovernancePower.toFixed(2)} ISLAND`);
    
    return totalGovernancePower;
    
  } catch (error) {
    console.error(`Error calculating native governance power for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Parse VSR account using multiplier-based calculation inspired by governance-ui
 */
function parseVSRAccountWithMultiplier(data, walletPubkey) {
  try {
    // Look for voter account structure (discriminator + voter_authority + registrar + deposits)
    if (data.length < 100) return 0;
    
    // Check if this looks like a voter account by checking the voter_authority field
    for (let baseOffset = 8; baseOffset <= 50; baseOffset += 8) {
      try {
        const potentialAuthority = new PublicKey(data.slice(baseOffset, baseOffset + 32));
        if (potentialAuthority.equals(walletPubkey)) {
          // This might be a voter account, try to parse deposits
          const depositsOffset = baseOffset + 64; // Skip voter_authority + registrar
          
          if (depositsOffset + 4 < data.length) {
            const depositsCount = data.readUInt32LE(depositsOffset);
            
            if (depositsCount > 0 && depositsCount < 20) { // Reasonable deposits count
              let totalPower = 0;
              let depositOffset = depositsOffset + 4;
              
              for (let i = 0; i < depositsCount && depositOffset + 40 < data.length; i++) {
                // Parse deposit entry
                const amountDeposited = Number(data.readBigUInt64LE(depositOffset + 24)); // amount_deposited_native
                const isUsed = data.readUInt8(depositOffset + 40) === 1; // is_used flag
                
                if (isUsed && amountDeposited > 0) {
                  // Simple multiplier calculation (baseline of 1.0 for now)
                  const depositPower = amountDeposited / 1e6; // Convert to ISLAND units
                  totalPower += depositPower;
                }
                
                depositOffset += 48; // Move to next deposit (approximate size)
              }
              
              if (totalPower > 0) {
                return totalPower;
              }
            }
          }
        }
      } catch (error) {
        // Continue searching
      }
    }
    
    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Test function for specific wallets
 */
async function testSpecificWallets() {
  const testWallets = [
    'B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST', // Real citizen wallet
    'ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd', // Real citizen wallet
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Real citizen wallet
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', // Real citizen wallet
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'  // Real citizen wallet
  ];
  
  console.log('🧪 Testing simplified VSR calculation on specific wallets...');
  
  for (const wallet of testWallets) {
    try {
      const power = await calculateNativeGovernancePower(wallet);
      console.log(`\n✅ ${wallet}: ${power.toFixed(2)} ISLAND native governance power\n`);
    } catch (error) {
      console.error(`❌ Error testing ${wallet}:`, error.message);
    }
  }
}

/**
 * Update citizen with native governance power
 */
async function updateCitizenNativeGovernancePower(pool, walletAddress, nativePower) {
  try {
    await pool.query(
      'UPDATE citizens SET native_governance_power = $1, updated_at = NOW() WHERE wallet_address = $2',
      [nativePower, walletAddress]
    );
    console.log(`Updated ${walletAddress}: ${nativePower.toFixed(2)} ISLAND native power`);
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error.message);
  }
}

/**
 * Main execution function
 */
async function calculateAndUpdateAllNativeGovernancePower() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🚀 Starting simplified VSR native governance power calculation...');
    
    const citizensResult = await pool.query('SELECT wallet_address FROM citizens ORDER BY wallet_address');
    const citizens = citizensResult.rows;
    
    console.log(`📊 Processing ${citizens.length} citizens...`);
    
    let processed = 0;
    let totalPower = 0;
    
    for (const citizen of citizens) {
      try {
        const nativePower = await calculateNativeGovernancePower(citizen.wallet_address);
        await updateCitizenNativeGovernancePower(pool, citizen.wallet_address, nativePower);
        
        totalPower += nativePower;
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`✅ Processed ${processed}/${citizens.length} citizens...`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error processing ${citizen.wallet_address}:`, error.message);
      }
    }
    
    console.log(`\n🎯 Simplified VSR Calculation Complete!`);
    console.log(`📈 Total citizens processed: ${processed}`);
    console.log(`💰 Total native governance power: ${totalPower.toFixed(2)} ISLAND`);
    
  } catch (error) {
    console.error('💥 Fatal error in VSR calculation:', error);
  } finally {
    await pool.end();
  }
}

// Export functions
module.exports = {
  calculateNativeGovernancePower,
  calculateAndUpdateAllNativeGovernancePower,
  testSpecificWallets
};

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'test') {
    testSpecificWallets();
  } else {
    calculateAndUpdateAllNativeGovernancePower();
  }
}
/**
 * Struct-Aware VSR Governance Power Calculator
 * Uses Anchor deserialization with official VSR IDL
 * No byte scanning, no guesswork, no wallet-specific logic
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, Wallet } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// VSR Program Constants
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_PUBKEY = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

// VSR IDL
const VSR_IDL = {
  "version": "0.2.0",
  "name": "voter_stake_registry",
  "accounts": [
    {
      "name": "Voter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "voterAuthority",
            "type": "publicKey"
          },
          {
            "name": "registrar",
            "type": "publicKey"
          },
          {
            "name": "deposits",
            "type": {
              "array": [
                {
                  "defined": "DepositEntry"
                },
                32
              ]
            }
          },
          {
            "name": "voterBump",
            "type": "u8"
          },
          {
            "name": "voterWeightRecordBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Registrar",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "governanceProgramId",
            "type": "publicKey"
          },
          {
            "name": "realm",
            "type": "publicKey"
          },
          {
            "name": "realmGoverningTokenMint",
            "type": "publicKey"
          },
          {
            "name": "realmAuthority",
            "type": "publicKey"
          },
          {
            "name": "reserved1",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "votingMints",
            "type": {
              "array": [
                {
                  "defined": "VotingMintConfig"
                },
                4
              ]
            }
          },
          {
            "name": "timeOffset",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved2",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "DepositEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lockup",
            "type": {
              "defined": "Lockup"
            }
          },
          {
            "name": "amountDepositedNative",
            "type": "u64"
          },
          {
            "name": "amountInitiallyLockedNative",
            "type": "u64"
          },
          {
            "name": "isUsed",
            "type": "bool"
          },
          {
            "name": "allowClawback",
            "type": "bool"
          },
          {
            "name": "votingMintConfigIdx",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                29
              ]
            }
          }
        ]
      }
    },
    {
      "name": "Lockup",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "kind",
            "type": {
              "defined": "LockupKind"
            }
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                15
              ]
            }
          }
        ]
      }
    },
    {
      "name": "VotingMintConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "publicKey"
          },
          {
            "name": "grantAuthority",
            "type": "publicKey"
          },
          {
            "name": "baselineVoteWeightScaledFactor",
            "type": "u64"
          },
          {
            "name": "maxExtraLockupVoteWeightScaledFactor",
            "type": "u64"
          },
          {
            "name": "lockupSaturationSecs",
            "type": "u64"
          },
          {
            "name": "digitShift",
            "type": "i8"
          },
          {
            "name": "reserved1",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          },
          {
            "name": "reserved2",
            "type": {
              "array": [
                "u64",
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "LockupKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "None"
          },
          {
            "name": "Daily"
          },
          {
            "name": "Monthly"
          },
          {
            "name": "Cliff"
          },
          {
            "name": "Constant"
          }
        ]
      }
    }
  ]
};

/**
 * Create dummy wallet for read-only operations
 */
function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject(new Error('Dummy wallet cannot sign')),
    signAllTransactions: () => Promise.reject(new Error('Dummy wallet cannot sign'))
  };
}

/**
 * Initialize Anchor program with VSR IDL
 */
async function initializeVSRProgram() {
  const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');
  const wallet = createDummyWallet();
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  
  const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
  return { program, connection };
}

/**
 * Get Voter PDA for a wallet
 */
function getVoterPDA(walletPubkey) {
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [REGISTRAR_PUBKEY.toBuffer(), walletPubkey.toBuffer(), Buffer.from('voter')],
    VSR_PROGRAM_ID
  );
  return voterPDA;
}

/**
 * Calculate voting power multiplier using authentic VSR formula
 */
function calculateVotingPowerMultiplier(depositEntry, votingMintConfig, currentTimestamp) {
  if (!depositEntry.isUsed) return 0;
  
  const lockup = depositEntry.lockup;
  const baselineVoteWeight = Number(votingMintConfig.baselineVoteWeightScaledFactor);
  const maxExtraLockupVoteWeight = Number(votingMintConfig.maxExtraLockupVoteWeightScaledFactor);
  const lockupSaturationSecs = Number(votingMintConfig.lockupSaturationSecs);
  
  // Calculate lockup duration factor
  let lockupDurationFactor = 0;
  
  if (lockup.kind.none) {
    lockupDurationFactor = 0;
  } else if (lockup.endTs > currentTimestamp) {
    const remainingTime = Number(lockup.endTs) - currentTimestamp;
    lockupDurationFactor = Math.min(remainingTime / lockupSaturationSecs, 1.0);
  }
  
  // VSR voting power formula: baseline + (lockup_factor * max_extra)
  const votingPower = baselineVoteWeight + (lockupDurationFactor * maxExtraLockupVoteWeight);
  
  // Scale factor is typically 1e9 for VSR
  return votingPower / 1e9;
}

/**
 * Calculate native governance power for a wallet using Anchor deserialization
 */
async function calculateNativeGovernancePowerAnchor(walletAddress) {
  try {
    const { program, connection } = await initializeVSRProgram();
    const walletPubkey = new PublicKey(walletAddress);
    const voterPDA = getVoterPDA(walletPubkey);
    
    // Fetch registrar to get voting mint config
    const registrarAccount = await program.account.registrar.fetch(REGISTRAR_PUBKEY);
    const islandMintConfig = registrarAccount.votingMints.find(mint => 
      mint.mint.equals(ISLAND_MINT)
    );
    
    if (!islandMintConfig) {
      console.log(`No ISLAND mint config found for ${walletAddress}`);
      return 0;
    }
    
    // Fetch voter account
    const voterAccount = await program.account.voter.fetch(voterPDA);
    
    if (!voterAccount) {
      console.log(`No voter account found for ${walletAddress}`);
      return 0;
    }
    
    const currentTimestamp = Math.floor(Date.now() / 1000);
    let totalGovernancePower = 0;
    
    // Process all deposit entries
    for (const depositEntry of voterAccount.deposits) {
      if (!depositEntry.isUsed) continue;
      
      // Get effective amount from either field
      let effectiveAmount = Number(depositEntry.amountDepositedNative);
      if (effectiveAmount === 0 && Number(depositEntry.amountInitiallyLockedNative) > 0) {
        effectiveAmount = Number(depositEntry.amountInitiallyLockedNative);
      }
      
      if (effectiveAmount <= 0) continue;
      
      // Calculate multiplier
      const multiplier = calculateVotingPowerMultiplier(depositEntry, islandMintConfig, currentTimestamp);
      
      // Convert to ISLAND tokens and apply multiplier
      const tokenAmount = effectiveAmount / 1e6;
      const governancePower = tokenAmount * multiplier;
      
      totalGovernancePower += governancePower;
      
      console.log(`  Deposit: ${tokenAmount.toLocaleString()} ISLAND * ${multiplier.toFixed(6)}x = ${governancePower.toLocaleString()} power`);
    }
    
    return totalGovernancePower;
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Update citizen governance power in database
 */
async function updateCitizenGovernancePower(pool, wallet, nativePower) {
  await pool.query(
    `UPDATE citizens 
     SET native_governance_power = $1,
         delegated_governance_power = 0,
         total_governance_power = $1
     WHERE wallet = $2`,
    [nativePower, wallet]
  );
}

/**
 * Main execution function
 */
async function run() {
  console.log('=== Struct-Aware VSR Governance Calculator ===');
  console.log('Using Anchor deserialization with official VSR IDL');
  console.log('No byte scanning, no wallet-specific logic');
  console.log();
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Get all citizens
    const citizensResult = await pool.query('SELECT nickname, wallet FROM citizens ORDER BY nickname');
    const citizens = citizensResult.rows;
    
    console.log(`Processing ${citizens.length} citizens...`);
    console.log();
    
    let validationResults = {
      titanmaker: null,
      legend: null
    };
    
    for (const [index, citizen] of citizens.entries()) {
      const name = citizen.nickname || 'Anonymous';
      console.log(`[${index + 1}/${citizens.length}] ${name} (${citizen.wallet.substring(0, 8)}...):`);
      
      const nativePower = await calculateNativeGovernancePowerAnchor(citizen.wallet);
      
      if (nativePower > 0) {
        console.log(`Total: ${nativePower.toLocaleString()} ISLAND governance power`);
        await updateCitizenGovernancePower(pool, citizen.wallet, nativePower);
        
        // Validation tracking
        if (citizen.wallet === 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1') {
          validationResults.titanmaker = nativePower;
        }
        if (citizen.wallet === 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG') {
          validationResults.legend = nativePower;
        }
      } else {
        console.log('No governance power found');
      }
      console.log();
    }
    
    // Validation check
    console.log('=== VALIDATION RESULTS ===');
    
    const titanmakerValid = validationResults.titanmaker !== null && 
      Math.abs(validationResults.titanmaker - 200000) < 1;
    const legendValid = validationResults.legend !== null && 
      Math.abs(validationResults.legend - 3361730.15) < 1;
    
    console.log(`Titanmaker: ${validationResults.titanmaker?.toLocaleString() || 'NOT FOUND'} ${titanmakerValid ? '✅' : '❌'}`);
    console.log(`Legend: ${validationResults.legend?.toLocaleString() || 'NOT FOUND'} ${legendValid ? '✅' : '❌'}`);
    
    if (titanmakerValid && legendValid) {
      console.log('🎯 SUCCESS: All validations passed - struct-aware calculator is accurate');
    } else {
      console.log('⚠️ VALIDATION FAILED: Keep using final-vsr-governance.js');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  run().catch(console.error);
}

module.exports = { calculateNativeGovernancePowerAnchor, run };
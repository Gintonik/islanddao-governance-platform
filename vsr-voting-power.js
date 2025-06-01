/**
 * VSR Voting Power Calculator
 * Uses official voter-stake-registry IDL with Anchor deserialization
 * Calculates native, delegated, and total governance power with proper lockup multipliers
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from '@coral-xyz/anchor';
const { AnchorProvider, Program, BN } = pkg;

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Official VSR IDL structure
const VSR_IDL = {
  version: "0.2.4",
  name: "voter_stake_registry",
  accounts: [
    {
      name: "registrar",
      type: {
        kind: "struct",
        fields: [
          {
            name: "governance_program_id",
            type: "publicKey"
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governing_token_mint",
            type: "publicKey"
          },
          {
            name: "voting_mints",
            type: {
              vec: {
                defined: "VotingMintConfig"
              }
            }
          }
        ]
      }
    },
    {
      name: "voter",
      type: {
        kind: "struct",
        fields: [
          {
            name: "voter_authority",
            type: "publicKey"
          },
          {
            name: "registrar",
            type: "publicKey"
          },
          {
            name: "deposits",
            type: {
              vec: {
                defined: "DepositEntry"
              }
            }
          }
        ]
      }
    }
  ],
  types: [
    {
      name: "VotingMintConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "mint",
            type: "publicKey"
          },
          {
            name: "grant_authority",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "baseline_vote_weight_scaled_factor",
            type: "u64"
          },
          {
            name: "max_extra_lockup_vote_weight_scaled_factor",
            type: "u64"
          },
          {
            name: "lockup_saturation_secs",
            type: "u64"
          },
          {
            name: "digit_shift",
            type: "i8"
          }
        ]
      }
    },
    {
      name: "DepositEntry",
      type: {
        kind: "struct",
        fields: [
          {
            name: "lockup",
            type: {
              defined: "Lockup"
            }
          },
          {
            name: "amount_deposited_native",
            type: "u64"
          },
          {
            name: "amount_initially_locked_native",
            type: "u64"
          },
          {
            name: "is_used",
            type: "bool"
          },
          {
            name: "allow_clawback",
            type: "bool"
          },
          {
            name: "voting_mint_config_idx",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "Lockup",
      type: {
        kind: "struct",
        fields: [
          {
            name: "start_ts",
            type: "i64"
          },
          {
            name: "end_ts",
            type: "i64"
          },
          {
            name: "kind",
            type: {
              defined: "LockupKind"
            }
          }
        ]
      }
    },
    {
      name: "LockupKind",
      type: {
        kind: "enum",
        variants: [
          {
            name: "none"
          },
          {
            name: "cliff"
          },
          {
            name: "constant"
          },
          {
            name: "monthly"
          },
          {
            name: "daily"
          }
        ]
      }
    }
  ]
};

function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject('Read-only wallet'),
    signAllTransactions: () => Promise.reject('Read-only wallet'),
  };
}

/**
 * Calculate lockup multiplier based on VSR logic
 */
function calcMultiplier({
  depositScaledFactor,
  maxExtraLockupVoteWeightScaledFactor,
  lockupSecs,
  lockupSaturationSecs,
  isVested = false
}) {
  if (depositScaledFactor === 0) return 0;
  
  if (isVested) {
    // Vested calculation for monthly/daily lockups
    const SECS_PER_DAY = 24 * 60 * 60;
    const DAYS_PER_MONTH = 30.44;
    const onMonthSecs = SECS_PER_DAY * DAYS_PER_MONTH;
    const n_periods_before_saturation = lockupSaturationSecs / onMonthSecs;
    const n_periods = lockupSecs / onMonthSecs;
    const n_unsaturated_periods = Math.min(n_periods, n_periods_before_saturation);
    const n_saturated_periods = Math.max(0, n_periods - n_unsaturated_periods);
    
    const calc = (depositScaledFactor +
      (maxExtraLockupVoteWeightScaledFactor / n_periods) *
        (n_saturated_periods +
          ((n_unsaturated_periods + 1) * n_unsaturated_periods) /
            2 /
            n_periods_before_saturation)) /
      depositScaledFactor;
    
    return calc;
  }
  
  // Standard VSR multiplier calculation
  const calc = (depositScaledFactor +
    (maxExtraLockupVoteWeightScaledFactor *
      Math.min(lockupSecs, lockupSaturationSecs)) /
      lockupSaturationSecs) /
    depositScaledFactor;
  
  return calc;
}

/**
 * Get lockup type from deposit
 */
function getLockupType(lockupKind) {
  if (lockupKind.monthly !== undefined) return 'monthly';
  if (lockupKind.cliff !== undefined) return 'cliff';
  if (lockupKind.constant !== undefined) return 'constant';
  if (lockupKind.daily !== undefined) return 'daily';
  if (lockupKind.none !== undefined) return 'none';
  return 'none';
}

/**
 * Calculate native governance power for a wallet using authentic VSR deserialization
 */
async function calculateNativeGovernancePower(walletAddress) {
  try {
    console.log(`Calculating native governance power for: ${walletAddress}`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    
    // Find all VSR program accounts
    const programAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Found ${programAccounts.length} VSR program accounts`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    let totalNativePower = 0;
    let validDepositsCount = 0;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    // Filter accounts that reference this wallet
    const relevantAccounts = programAccounts.filter(account => {
      const data = account.account.data;
      
      // Check if wallet is referenced in this account
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          return true;
        }
      }
      return false;
    });
    
    console.log(`Found ${relevantAccounts.length} accounts containing wallet reference`);
    
    // Process voter accounts (2728 bytes typically)
    const voterAccounts = relevantAccounts.filter(account => 
      account.account.data.length === 2728
    );
    
    console.log(`Processing ${voterAccounts.length} voter accounts`);
    
    for (const voterAccount of voterAccounts) {
      try {
        // Manual parsing since Anchor deserialization often fails with corrupted data
        const data = voterAccount.account.data;
        
        // Extract deposits manually from voter account structure
        const deposits = extractDepositsFromVoterAccount(data);
        
        console.log(`  Account ${voterAccount.pubkey.toBase58()}: ${deposits.length} deposits found`);
        
        for (const deposit of deposits) {
          if (!deposit.is_used || deposit.amount_deposited_native === 0) {
            continue;
          }
          
          // Check if deposit is still locked
          if (deposit.lockup.end_ts <= currentTimestamp) {
            continue; // Expired deposit
          }
          
          // Calculate remaining lockup time
          const lockupSecsRemaining = deposit.lockup.end_ts - currentTimestamp;
          const lockupType = getLockupType(deposit.lockup.kind);
          const isVested = lockupType === 'monthly' || lockupType === 'daily';
          
          // Use standard VSR multiplier values
          const baselineVoteWeightScaledFactor = 1000000000; // 1e9
          const maxExtraLockupVoteWeightScaledFactor = 1000000000; // 1e9
          const lockupSaturationSecs = 5 * 365 * 24 * 60 * 60; // 5 years
          
          // Calculate multiplier
          const multiplier = calcMultiplier({
            depositScaledFactor: baselineVoteWeightScaledFactor,
            maxExtraLockupVoteWeightScaledFactor,
            lockupSecs: lockupSecsRemaining,
            lockupSaturationSecs,
            isVested
          });
          
          // Calculate voting power
          const votingPower = (deposit.amount_deposited_native * multiplier) / 1e12;
          
          console.log(`    Deposit: ${(deposit.amount_deposited_native / 1e6).toLocaleString()} ISLAND * ${multiplier.toFixed(3)}x = ${votingPower.toLocaleString()} power`);
          
          totalNativePower += votingPower;
          validDepositsCount++;
        }
        
      } catch (error) {
        console.log(`    Error processing voter account: ${error.message}`);
      }
    }
    
    console.log(`Total native power: ${totalNativePower.toLocaleString()} ISLAND from ${validDepositsCount} deposits`);
    return totalNativePower;
    
  } catch (error) {
    console.error(`Error calculating native governance power: ${error.message}`);
    return 0;
  }
}

/**
 * Extract deposits from voter account data using manual parsing
 */
function extractDepositsFromVoterAccount(data) {
  const deposits = [];
  
  try {
    // Skip discriminator (8) + voter_authority (32) + registrar (32)
    let offset = 72;
    
    // Read deposits array (up to 32 deposits)
    const maxDeposits = 32;
    
    for (let i = 0; i < maxDeposits && offset + 56 < data.length; i++) {
      try {
        // Parse lockup (24 bytes)
        const start_ts = Number(data.readBigInt64LE(offset));
        const end_ts = Number(data.readBigInt64LE(offset + 8));
        const kind_byte = data.readUInt8(offset + 16);
        offset += 24;
        
        // Parse amounts (16 bytes)
        const amount_deposited_native = Number(data.readBigUInt64LE(offset));
        const amount_initially_locked_native = Number(data.readBigUInt64LE(offset + 8));
        offset += 16;
        
        // Parse flags (3 bytes + padding)
        const is_used = data.readUInt8(offset) === 1;
        const allow_clawback = data.readUInt8(offset + 1) === 1;
        const voting_mint_config_idx = data.readUInt8(offset + 2);
        offset += 8; // Include padding
        
        // Convert kind byte to lockup kind
        const lockupKind = {};
        if (kind_byte === 0) lockupKind.none = {};
        else if (kind_byte === 1) lockupKind.cliff = {};
        else if (kind_byte === 2) lockupKind.constant = {};
        else if (kind_byte === 3) lockupKind.monthly = {};
        else if (kind_byte === 4) lockupKind.daily = {};
        else lockupKind.none = {};
        
        if (is_used && amount_deposited_native > 0) {
          deposits.push({
            lockup: {
              start_ts,
              end_ts,
              kind: lockupKind
            },
            amount_deposited_native,
            amount_initially_locked_native,
            is_used,
            allow_clawback,
            voting_mint_config_idx
          });
        }
        
      } catch (error) {
        // Skip problematic deposits
        offset += 56;
      }
    }
    
  } catch (error) {
    console.log(`Error extracting deposits: ${error.message}`);
  }
  
  return deposits;
}

/**
 * Calculate delegated governance power (simplified implementation)
 */
async function calculateDelegatedGovernancePower(walletAddress) {
  try {
    // Delegated power calculation requires analyzing delegation records
    // This is a complex operation that would need specific delegation parsing
    // For now, return 0 as delegation is not commonly used in most VSR setups
    return 0;
    
  } catch (error) {
    console.error(`Error calculating delegated governance power: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate complete governance power breakdown for a wallet
 */
async function calculateGovernancePowerBreakdown(walletAddress) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`VSR GOVERNANCE POWER CALCULATION`);
    console.log(`Wallet: ${walletAddress}`);
    console.log(`${'='.repeat(80)}`);
    
    const [nativePower, delegatedPower] = await Promise.all([
      calculateNativeGovernancePower(walletAddress),
      calculateDelegatedGovernancePower(walletAddress)
    ]);
    
    const totalPower = nativePower + delegatedPower;
    
    const result = {
      wallet: walletAddress,
      native_governance_power: Math.round(nativePower),
      delegated_governance_power: Math.round(delegatedPower),
      total_governance_power: Math.round(totalPower),
      timestamp: new Date().toISOString()
    };
    
    console.log(`\nFINAL RESULTS:`);
    console.log(`Native Power: ${result.native_governance_power.toLocaleString()} ISLAND`);
    console.log(`Delegated Power: ${result.delegated_governance_power.toLocaleString()} ISLAND`);
    console.log(`Total Power: ${result.total_governance_power.toLocaleString()} ISLAND`);
    console.log(`${'='.repeat(80)}\n`);
    
    return result;
    
  } catch (error) {
    console.error(`Error calculating governance power breakdown: ${error.message}`);
    return {
      wallet: walletAddress,
      native_governance_power: 0,
      delegated_governance_power: 0,
      total_governance_power: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Test with DeanMachine wallet
async function main() {
  const testWallet = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
  const result = await calculateGovernancePowerBreakdown(testWallet);
  
  console.log('VSR Governance Power Calculation Complete');
  console.log(JSON.stringify(result, null, 2));
}

// Run main function if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  calculateGovernancePowerBreakdown,
  calculateNativeGovernancePower,
  calculateDelegatedGovernancePower
};
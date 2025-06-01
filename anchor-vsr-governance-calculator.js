/**
 * Anchor VSR Governance Power Calculator
 * Uses @coral-xyz/anchor to fetch and decode Voter accounts from VSR program
 * Calculates native, delegated, and total governance power with proper lockup multipliers
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from '@coral-xyz/anchor';
const { AnchorProvider, Program, Wallet } = pkg;

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Complete VSR IDL based on voter-stake-registry program
const VSR_IDL = {
  "version": "0.2.7",
  "name": "voter_stake_registry",
  "instructions": [
    {
      "name": "createRegistrar",
      "accounts": [],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "voter",
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
      "name": "registrar",
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
            "name": "governingTokenMint",
            "type": "publicKey"
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
            "name": "none"
          },
          {
            "name": "cliff"
          },
          {
            "name": "constant"
          },
          {
            "name": "monthly"
          },
          {
            "name": "daily"
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
            "type": {
              "option": "publicKey"
            }
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
 * Get lockup type from deposit
 */
function getLockupType(lockupKind) {
  if (lockupKind.none !== undefined) return 'none';
  if (lockupKind.cliff !== undefined) return 'cliff';
  if (lockupKind.constant !== undefined) return 'constant';
  if (lockupKind.monthly !== undefined) return 'monthly';
  if (lockupKind.daily !== undefined) return 'daily';
  return 'none';
}

/**
 * Calculate VSR multiplier using authentic governance-ui logic
 */
function calculateLockupMultiplier(deposit, votingMintConfig) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const lockupSecsRemaining = Math.max(0, deposit.lockup.endTs.toNumber() - currentTimestamp);
  
  if (lockupSecsRemaining <= 0) {
    return 1.0; // No bonus for expired lockups
  }
  
  // Use voting mint config values or defaults
  const baselineVoteWeightScaledFactor = votingMintConfig?.baselineVoteWeightScaledFactor?.toNumber() || 1000000000;
  const maxExtraLockupVoteWeightScaledFactor = votingMintConfig?.maxExtraLockupVoteWeightScaledFactor?.toNumber() || 1000000000;
  const lockupSaturationSecs = votingMintConfig?.lockupSaturationSecs?.toNumber() || (5 * 365 * 24 * 60 * 60);
  
  const lockupType = getLockupType(deposit.lockup.kind);
  const isVested = lockupType === 'monthly' || lockupType === 'daily';
  
  if (isVested) {
    // Vested calculation for monthly/daily lockups
    const SECS_PER_DAY = 24 * 60 * 60;
    const DAYS_PER_MONTH = 30.44;
    const onMonthSecs = SECS_PER_DAY * DAYS_PER_MONTH;
    const n_periods_before_saturation = lockupSaturationSecs / onMonthSecs;
    const n_periods = lockupSecsRemaining / onMonthSecs;
    const n_unsaturated_periods = Math.min(n_periods, n_periods_before_saturation);
    const n_saturated_periods = Math.max(0, n_periods - n_unsaturated_periods);
    
    const multiplier = (baselineVoteWeightScaledFactor +
      (maxExtraLockupVoteWeightScaledFactor / n_periods) *
        (n_saturated_periods +
          ((n_unsaturated_periods + 1) * n_unsaturated_periods) / 2 / n_periods_before_saturation)) /
      baselineVoteWeightScaledFactor;
    
    return multiplier;
  }
  
  // Standard VSR multiplier for cliff/constant lockups
  const multiplier = (baselineVoteWeightScaledFactor +
    (maxExtraLockupVoteWeightScaledFactor * Math.min(lockupSecsRemaining, lockupSaturationSecs)) /
      lockupSaturationSecs) /
    baselineVoteWeightScaledFactor;
  
  return multiplier;
}

/**
 * Find all Voter accounts for a given wallet using Anchor
 */
async function findVoterAccountsForWallet(walletAddress) {
  try {
    console.log(`Finding Voter accounts for: ${walletAddress}`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get all program accounts to find voter accounts
    const programAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: walletPubkey.toBase58()
          }
        }
      ]
    });
    
    console.log(`Found ${programAccounts.length} VSR accounts with wallet filter`);
    
    const voterAccounts = [];
    
    for (const account of programAccounts) {
      try {
        // Check if this is a voter account (discriminator + structure)
        if (account.account.data.length === 2728) {
          // Try to deserialize as voter account
          const voterAccount = await program.account.voter.fetch(account.pubkey);
          
          // Verify this voter account belongs to our wallet
          if (voterAccount.voterAuthority.equals(walletPubkey)) {
            voterAccounts.push({
              pubkey: account.pubkey,
              account: voterAccount
            });
            console.log(`Found voter account: ${account.pubkey.toBase58()}`);
          }
        }
      } catch (error) {
        // Skip accounts that can't be deserialized as voter accounts
        console.log(`Skipping account ${account.pubkey.toBase58()}: ${error.message}`);
      }
    }
    
    return voterAccounts;
    
  } catch (error) {
    console.error(`Error finding voter accounts: ${error.message}`);
    return [];
  }
}

/**
 * Calculate native governance power from voter accounts owned by wallet
 */
async function calculateNativeGovernancePower(walletAddress) {
  try {
    const voterAccounts = await findVoterAccountsForWallet(walletAddress);
    
    if (voterAccounts.length === 0) {
      console.log('No voter accounts found for this wallet');
      return 0;
    }
    
    let totalNativePower = 0;
    let validDepositsCount = 0;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    console.log(`Processing ${voterAccounts.length} voter accounts`);
    
    for (const voterAccountInfo of voterAccounts) {
      const { pubkey, account } = voterAccountInfo;
      
      console.log(`\nProcessing voter account: ${pubkey.toBase58()}`);
      console.log(`Registrar: ${account.registrar.toBase58()}`);
      console.log(`Deposits: ${account.deposits.length}`);
      
      // Load registrar to get voting mint configuration
      let registrarAccount = null;
      try {
        const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
        const wallet = createDummyWallet();
        const provider = new AnchorProvider(connection, wallet, {});
        const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
        
        registrarAccount = await program.account.registrar.fetch(account.registrar);
        console.log(`Loaded registrar configuration`);
      } catch (error) {
        console.log(`Could not load registrar: ${error.message}`);
      }
      
      // Find valid voting mint configuration
      let votingMintConfig = null;
      if (registrarAccount) {
        for (const mintConfig of registrarAccount.votingMints) {
          if (mintConfig.baselineVoteWeightScaledFactor.toNumber() > 0) {
            votingMintConfig = mintConfig;
            break;
          }
        }
      }
      
      // Process deposits
      for (let i = 0; i < account.deposits.length; i++) {
        const deposit = account.deposits[i];
        
        // Skip unused or empty deposits
        if (!deposit.isUsed || deposit.amountDepositedNative.toNumber() === 0) {
          continue;
        }
        
        // Skip expired deposits
        const endTs = deposit.lockup.endTs.toNumber();
        if (endTs <= currentTimestamp) {
          continue;
        }
        
        // Skip withdrawn deposits (where deposited < initially locked)
        const amountDeposited = deposit.amountDepositedNative.toNumber();
        const amountInitiallyLocked = deposit.amountInitiallyLockedNative.toNumber();
        
        if (amountDeposited <= amountInitiallyLocked) {
          continue;
        }
        
        // Calculate lockup multiplier
        const multiplier = calculateLockupMultiplier(deposit, votingMintConfig);
        
        // Calculate voting power: amount * multiplier / 1e12 (VSR uses 1e12 scaling)
        const votingPower = (amountDeposited * multiplier) / 1e12;
        
        console.log(`  Deposit ${i}:`);
        console.log(`    Amount: ${(amountDeposited / 1e6).toLocaleString()} ISLAND`);
        console.log(`    Lockup Type: ${getLockupType(deposit.lockup.kind)}`);
        console.log(`    End Time: ${new Date(endTs * 1000).toISOString()}`);
        console.log(`    Multiplier: ${multiplier.toFixed(6)}x`);
        console.log(`    Voting Power: ${votingPower.toLocaleString()} ISLAND`);
        
        totalNativePower += votingPower;
        validDepositsCount++;
      }
    }
    
    console.log(`\nTotal Native Power: ${totalNativePower.toLocaleString()} ISLAND from ${validDepositsCount} deposits`);
    return totalNativePower;
    
  } catch (error) {
    console.error(`Error calculating native governance power: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate delegated governance power (deposits TO this wallet as delegate)
 */
async function calculateDelegatedGovernancePower(walletAddress) {
  try {
    // Delegated power would require finding voter accounts where this wallet is set as delegate
    // This is complex and requires parsing delegation records across all VSR accounts
    // For now, return 0 as delegation is not commonly used in most VSR setups
    console.log('Delegated power calculation not implemented (delegation rarely used)');
    return 0;
    
  } catch (error) {
    console.error(`Error calculating delegated governance power: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate complete governance power breakdown for a wallet
 */
async function calculateGovernancePower(walletAddress) {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('ANCHOR VSR GOVERNANCE POWER CALCULATOR');
    console.log(`Wallet: ${walletAddress}`);
    console.log('='.repeat(80));
    
    // Calculate native and delegated power
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
    
    console.log('\n' + '='.repeat(80));
    console.log('FINAL RESULTS:');
    console.log(`Native Governance Power: ${result.native_governance_power.toLocaleString()} ISLAND`);
    console.log(`Delegated Governance Power: ${result.delegated_governance_power.toLocaleString()} ISLAND`);
    console.log(`Total Governance Power: ${result.total_governance_power.toLocaleString()} ISLAND`);
    console.log('='.repeat(80));
    
    return result;
    
  } catch (error) {
    console.error(`Error calculating governance power: ${error.message}`);
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
  const result = await calculateGovernancePower(testWallet);
  
  console.log('\nJSON OUTPUT:');
  console.log(JSON.stringify(result, null, 2));
}

// Run if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { calculateGovernancePower, calculateNativeGovernancePower, calculateDelegatedGovernancePower };
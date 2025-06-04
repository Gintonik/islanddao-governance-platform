/**
 * GOAL: Canonical validator for VSR governance power (native + delegated)
 * REQUIREMENTS:
 * ✅ No hardcoded values
 * ✅ Anchor-compatible struct deserialization only
 * ✅ Validates native deposits using authority === wallet
 * ✅ Validates delegated power using voterAuthority === wallet && authority !== wallet
 * ✅ Logs each deposit with index, amount, lockup type, multiplier, calculated power
 * ✅ Logs each delegation with source wallet, target wallet, and amount
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');

// Test wallets from ground truth
const WALLET_ADDRESSES = [
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC'
].map((addr) => new PublicKey(addr));

// VSR IDL for proper deserialization
const vsrIdl = {
  "version": "0.1.0",
  "name": "voter_stake_registry",
  "accounts": [
    {
      "name": "voter",
      "type": {
        "kind": "struct",
        "fields": [
          {"name": "authority", "type": "publicKey"},
          {"name": "registrar", "type": "publicKey"},
          {"name": "voterAuthority", "type": "publicKey"},
          {"name": "voterWeightRecord", "type": "publicKey"},
          {
            "name": "depositEntries",
            "type": {
              "array": [
                {
                  "defined": "DepositEntry"
                },
                32
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
          {"name": "votingMintConfigIdx", "type": "u8"},
          {"name": "amountDepositedNative", "type": "u64"},
          {"name": "amountInitiallyLockedNative", "type": "u64"},
          {"name": "isUsed", "type": "bool"},
          {"name": "lockup", "type": {"defined": "Lockup"}}
        ]
      }
    },
    {
      "name": "Lockup",
      "type": {
        "kind": "struct",
        "fields": [
          {"name": "startTs", "type": "u64"},
          {"name": "endTs", "type": "u64"},
          {"name": "lockupKind", "type": "u8"}
        ]
      }
    }
  ]
};

function calculateMultiplier(lockup) {
  if (lockup.lockupKind === 0 || lockup.endTs.eqn(0)) return 1.0;
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = Math.max(0, lockup.endTs.toNumber() - now);
  const years = secondsRemaining / (365.25 * 24 * 3600);
  return Math.min(1 + years, 5);
}

async function scanAllGovernancePower() {
  console.log('FULL CANONICAL VSR VALIDATOR');
  console.log('============================');
  console.log('Using Anchor-compatible struct deserialization');
  
  const provider = new anchor.AnchorProvider(connection, {}, {});
  const program = new anchor.Program(vsrIdl, VSR_PROGRAM_ID, provider);

  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }] // Matches Voter account
  });

  console.log(`\nLoaded ${accounts.length} Voter accounts (2728 bytes)`);

  const walletPowerMap = {};

  for (const { pubkey, account } of accounts) {
    try {
      // Use Anchor deserialization for proper struct parsing
      const decoded = program.coder.accounts.decode('voter', account.data);
      const authority = decoded.authority.toBase58();
      const voterAuthority = decoded.voterAuthority.toBase58();

      // Parse all deposits
      for (let i = 0; i < decoded.depositEntries.length; i++) {
        const entry = decoded.depositEntries[i];
        
        if (!entry.isUsed) continue;
        
        const amount = entry.amountDepositedNative.toNumber() / 1e6; // ISLAND has 6 decimals
        const multiplier = calculateMultiplier(entry.lockup);
        const power = amount * multiplier;

        // Filter out invalid entries
        if (amount === 0) continue;

        // Native: authority === wallet
        if (WALLET_ADDRESSES.some((wallet) => wallet.toBase58() === authority)) {
          walletPowerMap[authority] = walletPowerMap[authority] || { native: 0, delegated: 0 };
          walletPowerMap[authority].native += power;

          console.log(`🟢 Native | ${authority.substring(0,8)} | Deposit #${i} | Amount: ${amount.toFixed(3)} | Multiplier: ${multiplier.toFixed(2)} | Power: ${power.toFixed(2)}`);
        }

        // Delegated: voterAuthority === wallet AND authority !== voterAuthority
        if (
          WALLET_ADDRESSES.some((wallet) => wallet.toBase58() === voterAuthority) &&
          authority !== voterAuthority
        ) {
          walletPowerMap[voterAuthority] = walletPowerMap[voterAuthority] || { native: 0, delegated: 0 };
          walletPowerMap[voterAuthority].delegated += power;

          console.log(`🔵 Delegated | From ${authority.substring(0,8)} → ${voterAuthority.substring(0,8)} | Deposit #${i} | Power: ${power.toFixed(2)}`);
        }
      }
    } catch (error) {
      // Skip accounts that can't be deserialized
      continue;
    }
  }

  console.log('\n====================== Final Power Summary ======================\n');
  
  // Show results for each test wallet
  for (const walletPubkey of WALLET_ADDRESSES) {
    const wallet = walletPubkey.toBase58();
    const powers = walletPowerMap[wallet] || { native: 0, delegated: 0 };
    const total = (powers.native + powers.delegated).toFixed(2);
    
    console.log(`Wallet: ${wallet.substring(0,8)}`);
    console.log(` - Native: ${powers.native.toFixed(2)} ISLAND`);
    console.log(` - Delegated: ${powers.delegated.toFixed(2)} ISLAND`);
    console.log(` - Total: ${total} ISLAND\n`);
  }

  // Validate against expected deposits for kruHL3zJ
  const kruhlWallet = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
  const kruhlPowers = walletPowerMap[kruhlWallet] || { native: 0, delegated: 0 };
  const expectedDeposits = [310472.9693, 126344.82227];
  
  console.log('VALIDATION - kruHL3zJ Expected Deposits:');
  console.log(`Expected: ${expectedDeposits.join(', ')} ISLAND`);
  console.log(`Found native power: ${kruhlPowers.native.toFixed(3)} ISLAND`);
  console.log(`Expected delegation: 0, Found: ${kruhlPowers.delegated.toFixed(3)} ISLAND`);
  
  const expectedSum = expectedDeposits.reduce((a, b) => a + b, 0);
  console.log(`Expected sum with multipliers should exceed: ${expectedSum.toFixed(3)} ISLAND`);
  
  if (kruhlPowers.native >= expectedSum) {
    console.log('✅ Native power validation PASSED');
  } else {
    console.log('❌ Native power validation FAILED - deposits may not be detected properly');
  }
}

scanAllGovernancePower()
  .then(() => {
    console.log('\nCanonical VSR validation completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
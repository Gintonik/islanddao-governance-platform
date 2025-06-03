// File: audit-key-wallets.js

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import vsrIdl from './vsr-idl.json' assert { type: 'json' };
import dotenv from 'dotenv';
dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const provider = new anchor.AnchorProvider(connection, {}, {});
const program = new anchor.Program(vsrIdl, new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ'), provider);

// Benchmark wallets
const WALLET_KEYS = {
  takisoul: '7pPJt2xoEoPDNwfw2Hikzcc28JYkFmv6G4q7Mgnzvh5Z',
  kru: 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
  fywb: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
  delegateTo4pT6: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'
};

function calculateMultiplier(lockup) {
  if (lockup.lockupKind === 0 || lockup.endTs.eqn(0)) return 1.0;
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = Math.max(0, lockup.endTs.toNumber() - now);
  const years = secondsRemaining / (365.25 * 24 * 3600);
  return Math.min(1 + years, 5);
}

async function auditWallet(label, walletBase58) {
  const wallet = new PublicKey(walletBase58);
  const accounts = await connection.getProgramAccounts(program.programId, {
    filters: [{ dataSize: 2728 }],
  });

  let native = 0;
  let delegated = 0;

  console.log(`\n🔍 AUDIT: ${label} (${walletBase58})\n`);

  for (const { pubkey, account } of accounts) {
    const decoded = program.coder.accounts.decode('voter', account.data);
    const authority = decoded.authority.toBase58();
    const voterAuthority = decoded.voterAuthority.toBase58();

    for (let i = 0; i < decoded.depositEntries.length; i++) {
      const entry = decoded.depositEntries[i];
      const amount = entry.amountDepositedNative.toNumber() / 1e6; // ISLAND has 6 decimals
      const multiplier = calculateMultiplier(entry.lockup);
      const power = amount * multiplier;
      const lockupKind = entry.lockup.lockupKind;
      const lockupEndTs = entry.lockup.endTs.toNumber();

      if (amount === 0 || !entry.isUsed) continue;

      const isNative = authority === walletBase58;
      const isDelegated = voterAuthority === walletBase58 && authority !== walletBase58;

      if (isNative) native += power;
      if (isDelegated) delegated += power;

      if (isNative || isDelegated) {
        const tag = isNative ? '🟢 Native' : '🔵 Delegated';
        console.log(`${tag} | Deposit #${i} | Amount: ${amount.toFixed(6)} | Multiplier: ${multiplier.toFixed(2)} | Power: ${power.toFixed(2)}\n  ↳ LockupKind: ${lockupKind} | EndTs: ${lockupEndTs} | Authority: ${authority} | VoterAuthority: ${voterAuthority}`);
      }
    }
  }

  const total = native + delegated;
  console.log(`\n✅ SUMMARY — ${label} (${walletBase58})`);
  console.log(`   Native Power   : ${native.toFixed(2)} ISLAND`);
  console.log(`   Delegated Power: ${delegated.toFixed(2)} ISLAND`);
  console.log(`   Total Power    : ${total.toFixed(2)} ISLAND`);
  console.log(`--------------------------------------------------\n`);
}

console.log('AUDIT KEY WALLETS - LINE BY LINE INSPECTION');
console.log('===========================================');
console.log('Inspecting every deposit with multiplier logic and authority attribution');

(async () => {
  for (const [label, wallet] of Object.entries(WALLET_KEYS)) {
    await auditWallet(label, wallet);
  }
  
  console.log('\n✅ Next Steps:');
  console.log('- Review each deposit line-by-line');
  console.log('- Confirm multiplier logic matches VSR specification');
  console.log('- Verify authority attribution is correct');
  console.log('- Check for any unexpected delegation patterns');
})();
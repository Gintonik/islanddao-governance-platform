// File: audit-key-wallets.js

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Wallets to audit
const WALLET_KEYS = {
  takisoul: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
  delegationRecipient: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
  kruhl: 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
  fywb: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG'
};

function calculateMultiplier(lockupKind, lockupEndTs) {
  if (lockupKind === 0 || lockupEndTs === 0) return 1.0;
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = Math.max(0, lockupEndTs - now);
  const years = secondsRemaining / (365.25 * 24 * 3600);
  return Math.min(1 + years, 5);
}

/**
 * Parse all deposits from VSR account using comprehensive search
 */
function parseAllDeposits(data) {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Direct offset scanning for deposits
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    try {
      const rawAmount = Number(data.readBigUInt64LE(offset));
      if (rawAmount > 0) {
        const amount = rawAmount / 1e6; // ISLAND has 6 decimals
        const key = Math.round(amount * 1000);
        
        if (amount >= 1000 && amount <= 50000000 && !seenAmounts.has(key)) {
          seenAmounts.add(key);
          
          let lockupKind = 0;
          let lockupEndTs = 0;
          
          // Extract lockup data from surrounding bytes
          if (offset + 48 <= data.length) {
            try {
              lockupKind = data[offset + 24] || 0;
              lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
            } catch (e) {
              // Use defaults
            }
          }
          
          const multiplier = calculateMultiplier(lockupKind, lockupEndTs);
          
          deposits.push({
            amount,
            lockupKind,
            lockupEndTs,
            multiplier,
            power: amount * multiplier,
            isActive: lockupKind !== 0 && lockupEndTs > Math.floor(Date.now() / 1000),
            offset
          });
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return deposits;
}

async function auditWallet(walletLabel, walletBase58) {
  console.log(`\n🔍 Auditing ${walletLabel}: ${walletBase58.substring(0,8)}...`);
  
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  let nativeTotal = 0;
  let delegatedTotal = 0;
  let depositIndex = 0;
  
  for (const { pubkey, account } of accounts) {
    const data = account.data;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      const matchesNative = authority === walletBase58;
      const matchesDelegated = voterAuthority === walletBase58 && authority !== walletBase58;
      
      if (!matchesNative && !matchesDelegated) continue;
      
      const deposits = parseAllDeposits(data);
      
      for (const deposit of deposits) {
        const { amount, multiplier, power, lockupKind, lockupEndTs, isActive } = deposit;
        
        const type = matchesNative ? '🟢 Native' : '🔵 Delegated';
        const reason = matchesNative
          ? 'authority === wallet'
          : 'voterAuthority === wallet && authority !== wallet';
        
        if (matchesNative) nativeTotal += power;
        else delegatedTotal += power;
        
        const lockupStatus = isActive ? 'ACTIVE' : 'EXPIRED';
        const lockupInfo = lockupKind !== 0 
          ? `Lockup: Kind=${lockupKind}, End=${new Date(lockupEndTs * 1000).toISOString().split('T')[0]}, ${lockupStatus}`
          : 'No Lockup';
        
        console.log(
          `${type} | Deposit #${depositIndex++} | Amount: ${amount.toLocaleString()} | Multiplier: ${multiplier.toFixed(2)} | Power: ${power.toLocaleString()}`
        );
        console.log(
          `  ↳ Authority: ${authority.substring(0,8)}... | VoterAuthority: ${voterAuthority.substring(0,8)}... | Reason: ${reason}`
        );
        console.log(
          `  ↳ ${lockupInfo} | Account: ${pubkey.toBase58().substring(0,8)}...`
        );
        console.log();
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log(`✅ Summary for ${walletLabel}:`);
  console.log(`   - Native Power: ${nativeTotal.toLocaleString()}`);
  console.log(`   - Delegated Power: ${delegatedTotal.toLocaleString()}`);
  console.log(`   - Total: ${(nativeTotal + delegatedTotal).toLocaleString()}`);
  
  // Specific validation for takisoul (7pPJt2xo)
  if (walletLabel === 'takisoul') {
    console.log(`\n🎯 Takisoul Validation:`);
    if (nativeTotal > 8700000) {
      console.log(`   ✅ Native power exceeds 8.7M: ${nativeTotal.toLocaleString()}`);
    } else {
      console.log(`   ⚠️ Native power below expected 8.7M: ${nativeTotal.toLocaleString()}`);
    }
    
    if (delegatedTotal === 0) {
      console.log(`   ✅ No delegated power (expected)`);
    } else {
      console.log(`   ❌ Unexpected delegated power: ${delegatedTotal.toLocaleString()}`);
    }
  }
  
  // Specific validation for kruhl
  if (walletLabel === 'kruhl') {
    const expectedDeposits = [310472.9693, 126344.82227];
    console.log(`\n🎯 KruHL3zJ Validation:`);
    console.log(`   Expected deposits: ${expectedDeposits.join(', ')}`);
    
    if (delegatedTotal === 0) {
      console.log(`   ✅ No delegated power (expected)`);
    } else {
      console.log(`   ❌ Unexpected delegated power: ${delegatedTotal.toLocaleString()}`);
    }
  }
  
  console.log('\n' + '─'.repeat(80));
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
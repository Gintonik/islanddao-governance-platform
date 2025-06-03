/**
 * Debug False Delegations
 * Analyze why kruHL3zJ shows delegated power when it should have none
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse authorities from VSR account data
 */
function parseVSRAuthorities(data) {
  try {
    if (data.length >= 104) {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      return { authority, voterAuthority };
    }
    
    if (data.length >= 72) {
      try {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
        return { authority, voterAuthority };
      } catch (error) {
        return null;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Debug specific delegation account
 */
async function debugDelegationAccount(accountPubkey, targetWallet) {
  console.log(`\nDebugging account: ${accountPubkey}`);
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
  if (!accountInfo) {
    console.log('Account not found');
    return false;
  }
  
  const data = accountInfo.data;
  console.log(`Account size: ${data.length} bytes`);
  
  const authorities = parseVSRAuthorities(data);
  if (!authorities) {
    console.log('Could not parse authorities');
    return false;
  }
  
  const { authority, voterAuthority } = authorities;
  console.log(`Authority: ${authority}`);
  console.log(`VoterAuthority: ${voterAuthority}`);
  console.log(`Target wallet: ${targetWallet}`);
  
  // Check delegation logic
  const voterAuthorityMatches = voterAuthority === targetWallet;
  const authorityDiffers = authority !== targetWallet;
  const isDelegation = voterAuthorityMatches && authorityDiffers;
  
  console.log(`VoterAuthority === target: ${voterAuthorityMatches}`);
  console.log(`Authority !== target: ${authorityDiffers}`);
  console.log(`Is valid delegation: ${isDelegation}`);
  
  if (!isDelegation) {
    console.log('❌ This should NOT be counted as delegation');
    if (authority === targetWallet) {
      console.log('   Reason: This is a NATIVE account (authority === wallet)');
    }
    if (voterAuthority !== targetWallet) {
      console.log('   Reason: VoterAuthority does not match target wallet');
    }
  } else {
    console.log('✅ This is a valid delegation');
  }
  
  return isDelegation;
}

/**
 * Debug kruHL3zJ delegation detection
 */
async function debugKruHL3zJ() {
  console.log('DEBUGGING FALSE DELEGATIONS FOR kruHL3zJ');
  console.log('==========================================');
  
  const targetWallet = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
  
  // Get all VSR accounts
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  console.log(`Loaded ${allAccounts.length} VSR accounts`);
  
  let validDelegations = 0;
  let falseDelegations = 0;
  let nativeAccounts = 0;
  
  for (const { pubkey, account } of allAccounts) {
    const authorities = parseVSRAuthorities(account.data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Check if this account is related to our target wallet
    if (authority === targetWallet) {
      nativeAccounts++;
      console.log(`\nNATIVE account: ${pubkey.toBase58()}`);
      console.log(`  Authority: ${authority.substring(0,8)}`);
      console.log(`  VoterAuthority: ${voterAuthority.substring(0,8)}`);
    }
    
    if (voterAuthority === targetWallet && authority !== targetWallet) {
      validDelegations++;
      console.log(`\nVALID delegation: ${pubkey.toBase58()}`);
      console.log(`  From: ${authority.substring(0,8)}`);
      console.log(`  To: ${voterAuthority.substring(0,8)}`);
    }
    
    if (voterAuthority === targetWallet && authority === targetWallet) {
      falseDelegations++;
      console.log(`\nFALSE delegation (should be native): ${pubkey.toBase58()}`);
      console.log(`  Authority: ${authority.substring(0,8)}`);
      console.log(`  VoterAuthority: ${voterAuthority.substring(0,8)}`);
    }
  }
  
  console.log(`\n\nSUMMARY FOR ${targetWallet.substring(0,8)}:`);
  console.log(`Native accounts: ${nativeAccounts}`);
  console.log(`Valid delegations: ${validDelegations}`);
  console.log(`False delegations: ${falseDelegations}`);
  
  if (falseDelegations > 0) {
    console.log('\n❌ FOUND FALSE DELEGATIONS - Scanner logic needs fixing');
  } else if (validDelegations === 0) {
    console.log('\n✅ NO DELEGATIONS FOUND - This wallet should have 0 delegated power');
  } else {
    console.log('\n⚠️ VALID DELEGATIONS FOUND - Need to verify if these are correct');
  }
}

// Run the debug
debugKruHL3zJ()
  .then(() => {
    console.log('\nFalse delegation debug completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
  });
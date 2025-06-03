/**
 * Debug Authority Parsing
 * Analyze specific accounts to understand why kruHL3zJ shows false delegated power
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse authorities with detailed debugging
 */
function parseVSRAuthoritiesDebug(data, accountPubkey) {
  console.log(`\nDebugging authority parsing for: ${accountPubkey}`);
  console.log(`Account size: ${data.length} bytes`);
  
  try {
    if (data.length >= 104) {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      console.log(`Authority (offset 8-40): ${authority}`);
      console.log(`VoterAuthority (offset 72-104): ${voterAuthority}`);
      console.log(`Are they equal? ${authority === voterAuthority}`);
      
      return { authority, voterAuthority };
    }
    
    if (data.length >= 72) {
      try {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
        
        console.log(`Alternative parsing - Authority (8-40): ${authority}`);
        console.log(`Alternative parsing - VoterAuthority (40-72): ${voterAuthority}`);
        console.log(`Are they equal? ${authority === voterAuthority}`);
        
        return { authority, voterAuthority };
      } catch (error) {
        console.log(`Alternative parsing failed: ${error.message}`);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.log(`Authority parsing failed: ${error.message}`);
    return null;
  }
}

/**
 * Debug kruHL3zJ false delegation
 */
async function debugKruHL3zJFalseDelegation() {
  console.log('DEBUGGING kruHL3zJ FALSE DELEGATION');
  console.log('===================================');
  
  const targetWallet = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
  console.log(`Target wallet: ${targetWallet}`);
  
  // Get the specific delegation account identified earlier
  const delegationAccount = '7udRqrKsYCtqfLjUuitqriB1PSwmyTNQRcQsQWczR26w';
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(delegationAccount));
  if (!accountInfo) {
    console.log('Delegation account not found');
    return;
  }
  
  const data = accountInfo.data;
  const authorities = parseVSRAuthoritiesDebug(data, delegationAccount);
  
  if (authorities) {
    const { authority, voterAuthority } = authorities;
    
    console.log('\nDelegation Logic Check:');
    console.log(`voterAuthority === targetWallet: ${voterAuthority === targetWallet}`);
    console.log(`authority !== targetWallet: ${authority !== targetWallet}`);
    console.log(`authority !== voterAuthority: ${authority !== voterAuthority}`);
    
    const isValidDelegation = (
      voterAuthority === targetWallet && 
      authority !== targetWallet && 
      authority !== voterAuthority
    );
    
    console.log(`\nIs valid delegation: ${isValidDelegation}`);
    
    if (!isValidDelegation) {
      console.log('\n❌ This should NOT be counted as delegation');
      if (authority === voterAuthority) {
        console.log('   Reason: Self-owned deposit (authority === voterAuthority)');
      }
      if (authority === targetWallet) {
        console.log('   Reason: Native deposit (authority === targetWallet)');
      }
    } else {
      console.log('\n✅ This is a valid delegation');
    }
  }
  
  // Also check the native account for kruHL3zJ
  console.log('\n\nChecking native account:');
  const nativeAccount = '5cSWVmahnt6DoWPpxkJRAXAMEeX2DDmbdNieT3HSQy3x';
  
  const nativeAccountInfo = await connection.getAccountInfo(new PublicKey(nativeAccount));
  if (nativeAccountInfo) {
    const nativeAuthorities = parseVSRAuthoritiesDebug(nativeAccountInfo.data, nativeAccount);
    
    if (nativeAuthorities) {
      console.log(`\nNative account check:`);
      console.log(`Authority === targetWallet: ${nativeAuthorities.authority === targetWallet}`);
      console.log(`This should be counted as NATIVE power`);
    }
  }
}

// Run the debug
debugKruHL3zJFalseDelegation()
  .then(() => {
    console.log('\nAuthority parsing debug completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
  });
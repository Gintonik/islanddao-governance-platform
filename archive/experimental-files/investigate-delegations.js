/**
 * Investigate Delegation Patterns
 * Check if test wallet 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4 receives delegations
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

function parseVoterAuthorities(data) {
  try {
    if (data.length < 96) return null;
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

async function findDelegationsForWallet() {
  const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  
  console.log('🔍 SEARCHING FOR DELEGATIONS TO TEST WALLET');
  console.log(`Target: ${targetWallet}`);
  
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  console.log(`Scanning ${voterAccounts.length} VSR accounts...`);
  
  let delegationCount = 0;
  const delegations = [];
  
  for (const { pubkey, account } of voterAccounts) {
    const data = account.data;
    if (data.length < 100) continue;
    
    const authorities = parseVoterAuthorities(data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Check for delegation: voterAuthority === target AND authority !== target
    if (voterAuthority === targetWallet && authority !== targetWallet) {
      delegationCount++;
      delegations.push({
        account: pubkey.toBase58(),
        authority,
        voterAuthority
      });
      
      console.log(`✅ Delegation ${delegationCount}:`);
      console.log(`   Account: ${pubkey.toBase58()}`);
      console.log(`   Delegating Authority: ${authority}`);
      console.log(`   Target VoterAuthority: ${voterAuthority}`);
    }
  }
  
  console.log(`\n📊 RESULTS: Found ${delegationCount} delegations to ${targetWallet}`);
  return delegations;
}

findDelegationsForWallet()
  .then(delegations => {
    if (delegations.length === 0) {
      console.log('❌ No delegations found for test wallet');
    } else {
      console.log(`✅ Found ${delegations.length} delegations`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
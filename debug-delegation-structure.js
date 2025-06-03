/**
 * Debug Delegation Structure
 * Investigates Voter account authority patterns to understand delegation relationships
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse authority and voterAuthority from Voter account
 */
function parseVoterAuthorities(data) {
  try {
    if (data.length < 96) return null;
    
    // authority at offset 8, voterAuthority at offset 40
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
    
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

/**
 * Analyze delegation patterns in VSR accounts
 */
async function analyzeDelegationPatterns() {
  console.log('🔍 ANALYZING DELEGATION PATTERNS IN VSR ACCOUNTS');
  console.log('================================================');
  
  try {
    // Load all VSR Voter accounts
    console.log('📊 Loading all VSR Voter accounts...');
    const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`   Found ${voterAccounts.length} total accounts`);
    
    let totalVoterAccounts = 0;
    let delegationCandidates = 0;
    let uniqueAuthorities = new Set();
    let uniqueVoterAuthorities = new Set();
    let delegationMap = new Map();
    
    // Analyze all accounts
    for (const { pubkey, account } of voterAccounts) {
      const data = account.data;
      
      // Skip non-Voter accounts (check discriminator)
      if (data.length < 100) continue;
      
      const authorities = parseVoterAuthorities(data);
      if (!authorities) continue;
      
      totalVoterAccounts++;
      const { authority, voterAuthority } = authorities;
      
      uniqueAuthorities.add(authority);
      uniqueVoterAuthorities.add(voterAuthority);
      
      // Check for delegation pattern: voterAuthority !== authority
      if (voterAuthority !== authority) {
        delegationCandidates++;
        
        if (!delegationMap.has(voterAuthority)) {
          delegationMap.set(voterAuthority, []);
        }
        delegationMap.get(voterAuthority).push({
          account: pubkey.toBase58(),
          authority,
          voterAuthority
        });
        
        if (delegationCandidates <= 20) {
          console.log(`🔗 Delegation candidate ${delegationCandidates}:`);
          console.log(`   Account: ${pubkey.toBase58().substring(0,8)}...`);
          console.log(`   Authority: ${authority.substring(0,8)}...`);
          console.log(`   VoterAuthority: ${voterAuthority.substring(0,8)}...`);
        }
      }
    }
    
    console.log('\n📊 DELEGATION ANALYSIS SUMMARY:');
    console.log(`   Total Voter Accounts: ${totalVoterAccounts}`);
    console.log(`   Unique Authorities: ${uniqueAuthorities.size}`);
    console.log(`   Unique Voter Authorities: ${uniqueVoterAuthorities.size}`);
    console.log(`   Delegation Candidates: ${delegationCandidates}`);
    
    if (delegationCandidates > 0) {
      console.log('\n🎯 TOP DELEGATION TARGETS:');
      const sortedDelegations = Array.from(delegationMap.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 10);
        
      for (const [voterAuthority, delegations] of sortedDelegations) {
        console.log(`   ${voterAuthority.substring(0,8)}... receives ${delegations.length} delegation(s)`);
        
        // Check if this matches our test wallet
        if (voterAuthority === '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4') {
          console.log(`   🎯 MATCH: Test wallet found with ${delegations.length} delegations!`);
          for (const delegation of delegations) {
            console.log(`      From: ${delegation.authority.substring(0,8)}...`);
          }
        }
      }
      
      // Also check all delegations for our test wallet
      if (delegationMap.has('4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4')) {
        const testDelegations = delegationMap.get('4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4');
        console.log(`\n🎯 TEST WALLET DELEGATIONS FOUND: ${testDelegations.length}`);
        for (const delegation of testDelegations) {
          console.log(`   From: ${delegation.authority}`);
          console.log(`   Account: ${delegation.account}`);
        }
      } else {
        console.log('\n❌ Test wallet 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4 not found in delegation targets');
      }
    } else {
      console.log('\n❌ NO DELEGATION PATTERNS FOUND');
      console.log('   All Voter accounts have authority === voterAuthority');
    }
    
    return {
      totalVoterAccounts,
      delegationCandidates,
      delegationMap
    };
    
  } catch (error) {
    console.error('❌ Error analyzing delegation patterns:', error);
    throw error;
  }
}

// Run the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeDelegationPatterns()
    .then(result => {
      console.log('\n✅ Delegation pattern analysis completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    });
}
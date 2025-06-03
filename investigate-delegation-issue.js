/**
 * Investigate Delegation Issue
 * Focused analysis of why delegation detection isn't working
 */

import { Connection, PublicKey } from '@solana/web3.js';

// Configuration
const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Test case analysis: kruHL3zJ wallet
 * Expected: 30,999 native + 1,337,238 delegated = 1,368,237 total
 */
async function investigateKruHL3zJ() {
  const walletAddress = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
  
  console.log('🔍 INVESTIGATING kruHL3zJ DELEGATION ISSUE');
  console.log('==========================================');
  console.log(`Target: ${walletAddress}`);
  console.log('Expected: 30,999 native + 1,337,238 delegated');
  console.log('Current result: 1,368,237 native + 0 delegated\n');
  
  // Check VoterWeightRecord
  console.log('📊 VoterWeightRecord Analysis:');
  try {
    const vwrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 176 },
        { memcmp: { offset: 72, bytes: walletAddress } }
      ]
    });
    
    for (const { pubkey, account } of vwrAccounts) {
      const powerRaw = Number(account.data.readBigUInt64LE(104));
      const power = powerRaw / 1e6;
      console.log(`   VWR: ${power.toLocaleString()} ISLAND from ${pubkey.toBase58()}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  
  // Check owned Voter accounts (authority = walletAddress)
  console.log('\n📋 Owned Voter Accounts (authority = wallet):');
  try {
    const ownedAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 3312 },
        { memcmp: { offset: 40, bytes: walletAddress } }
      ]
    });
    
    console.log(`   Found ${ownedAccounts.length} owned accounts`);
    
    for (const { pubkey, account } of ownedAccounts) {
      const data = account.data;
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      const isDelegated = voterAuthority !== walletAddress;
      
      console.log(`   Account: ${pubkey.toBase58()}`);
      console.log(`   VoterAuthority: ${voterAuthority}`);
      console.log(`   Delegation status: ${isDelegated ? 'DELEGATED OUT' : 'SELF'}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  
  // Check delegated Voter accounts (voterAuthority = walletAddress, authority != walletAddress)
  console.log('\n📥 Delegated Voter Accounts (voterAuthority = wallet, authority != wallet):');
  try {
    const delegatedAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 3312 },
        { memcmp: { offset: 72, bytes: walletAddress } }
      ]
    });
    
    console.log(`   Found ${delegatedAccounts.length} accounts with wallet as voterAuthority`);
    
    let delegationCount = 0;
    for (const { pubkey, account } of delegatedAccounts) {
      const data = account.data;
      const authority = new PublicKey(data.slice(40, 72)).toBase58();
      const isDelegation = authority !== walletAddress;
      
      if (isDelegation) {
        delegationCount++;
        console.log(`   Delegation ${delegationCount}:`);
        console.log(`      Account: ${pubkey.toBase58()}`);
        console.log(`      Authority (delegator): ${authority}`);
        console.log(`      VoterAuthority (delegate): ${walletAddress}`);
      }
    }
    
    if (delegationCount === 0) {
      console.log('   ❌ No delegations found - this explains why delegated power = 0');
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
}

/**
 * Test the hypothesis: Are the validation expectations incorrect?
 */
async function testValidationHypothesis() {
  console.log('\n🧪 TESTING VALIDATION HYPOTHESIS');
  console.log('=================================');
  console.log('Hypothesis: The validation expectations may be based on outdated');
  console.log('or incorrect assumptions about delegation relationships.\n');
  
  const testCases = [
    {
      wallet: 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
      expectedNative: 30999,
      expectedDelegated: 1337238
    },
    {
      wallet: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
      expectedNative: 12625.581,
      expectedDelegated: 4190000
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`🔍 Testing ${testCase.wallet.substring(0,8)}...:`);
    console.log(`   Expected: ${testCase.expectedNative.toLocaleString()} native + ${testCase.expectedDelegated.toLocaleString()} delegated`);
    
    try {
      // Quick check for actual delegations
      const delegatedAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
        filters: [
          { dataSize: 3312 },
          { memcmp: { offset: 72, bytes: testCase.wallet } }
        ]
      });
      
      let actualDelegations = 0;
      for (const { account } of delegatedAccounts) {
        const authority = new PublicKey(account.data.slice(40, 72)).toBase58();
        if (authority !== testCase.wallet) {
          actualDelegations++;
        }
      }
      
      console.log(`   Actual delegations found: ${actualDelegations}`);
      console.log(`   Status: ${actualDelegations > 0 ? '✅ Has delegations' : '❌ No delegations'}`);
      
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
    console.log('');
  }
}

// Run investigation
async function runInvestigation() {
  await investigateKruHL3zJ();
  await testValidationHypothesis();
  
  console.log('\n💡 CONCLUSION:');
  console.log('==============');
  console.log('If no actual delegations are found on-chain, then our scanner');
  console.log('is working correctly and the validation expectations may need');
  console.log('to be updated to reflect the current on-chain state.');
}

runInvestigation().catch(console.error);
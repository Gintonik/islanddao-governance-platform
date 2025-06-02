/**
 * Canonical VSR Governance Power Calculator
 * Uses only Voter accounts from VSR program with proper deposit entry parsing
 * Calculates governance power from locked deposits with multipliers > 1.0
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse deposit entry from Voter account
 */
function parseDepositEntry(data, entryOffset) {
  try {
    // isUsed: byte at offset +0
    const isUsed = data[entryOffset];
    if (isUsed === 0) {
      return null;
    }
    
    // amount: u64 at offset +8
    const amountRaw = Number(data.readBigUInt64LE(entryOffset + 8));
    const amount = amountRaw / 1e6; // Convert from micro-ISLAND to ISLAND
    
    if (amount === 0) {
      return null;
    }
    
    // multiplierNumerator: u64 at offset +48
    const multiplierNumerator = Number(data.readBigUInt64LE(entryOffset + 48));
    
    // multiplierDenominator: u64 at offset +56
    const multiplierDenominator = Number(data.readBigUInt64LE(entryOffset + 56));
    
    let multiplier = 1.0;
    if (multiplierDenominator > 0) {
      multiplier = multiplierNumerator / multiplierDenominator;
    }
    
    // Only include locked deposits with multiplier > 1.0
    if (multiplier <= 1.0) {
      return null;
    }
    
    // Extract timestamps for deduplication
    let startTs = 0;
    let endTs = 0;
    
    try {
      // Look for timestamp patterns in lockup structure (approximate offsets)
      for (let tsOffset = entryOffset + 16; tsOffset <= entryOffset + 40; tsOffset += 8) {
        if (tsOffset + 8 <= data.length) {
          const potential = Number(data.readBigInt64LE(tsOffset));
          
          // Check if this could be a timestamp (reasonable range)
          if (potential > 1600000000 && potential < 2000000000) {
            if (startTs === 0) {
              startTs = potential;
            } else if (endTs === 0 && potential > startTs) {
              endTs = potential;
              break;
            }
          }
        }
      }
    } catch (e) {
      // Use amount as fallback for deduplication
      startTs = Math.floor(amount);
      endTs = Math.floor(multiplier * 1000);
    }
    
    const governancePower = amount * multiplier;
    
    return {
      amount,
      multiplierNumerator,
      multiplierDenominator,
      multiplier,
      governancePower,
      startTs,
      endTs,
      isUsed
    };
    
  } catch (error) {
    return null;
  }
}

/**
 * Calculate governance power for a wallet using Voter accounts
 */
async function calculateGovernancePowerFromVoter(walletAddress) {
  console.log(`🔍 Calculating governance power for: ${walletAddress}`);
  
  // Get all Voter accounts (2728 bytes) for this wallet
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } } // authority field
    ]
  });
  
  console.log(`📊 Found ${voterAccounts.length} Voter accounts`);
  
  const allDeposits = [];
  const depositKeys = new Set();
  let totalGovernancePower = 0;
  
  for (const [accountIndex, { pubkey, account }] of voterAccounts.entries()) {
    console.log(`\n📋 Processing Voter account ${accountIndex + 1}: ${pubkey.toBase58()}`);
    
    const data = account.data;
    let accountDeposits = 0;
    
    // Parse up to 32 deposit entries (88 bytes each)
    for (let i = 0; i < 32; i++) {
      const entryOffset = 72 + (i * 88);
      
      if (entryOffset + 88 > data.length) break;
      
      const deposit = parseDepositEntry(data, entryOffset);
      
      if (deposit) {
        // Create unique key for deduplication: amount|startTs|endTs
        const depositKey = `${deposit.amount}|${deposit.startTs}|${deposit.endTs}`;
        
        if (depositKeys.has(depositKey)) {
          console.log(`  ⚠️  [${i}] Duplicate deposit skipped: ${deposit.amount} ISLAND`);
          continue;
        }
        
        depositKeys.add(depositKey);
        allDeposits.push(deposit);
        totalGovernancePower += deposit.governancePower;
        accountDeposits++;
        
        console.log(`  ✅ [${i}] ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier.toFixed(6)}x = ${deposit.governancePower.toLocaleString()} power`);
        console.log(`       (numerator: ${deposit.multiplierNumerator}, denominator: ${deposit.multiplierDenominator})`);
      }
    }
    
    console.log(`📈 Account ${accountIndex + 1}: ${accountDeposits} valid locked deposits`);
  }
  
  console.log(`\n🏆 Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  
  return {
    wallet: walletAddress,
    nativeGovernancePower: totalGovernancePower,
    deposits: allDeposits,
    voterAccounts: voterAccounts.length
  };
}

/**
 * Test canonical Voter account parsing
 */
async function testCanonicalVoterCalculation() {
  console.log('🧪 CANONICAL VSR VOTER ACCOUNT CALCULATOR');
  console.log('=========================================');
  
  const testWallets = [
    { address: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expected: 8709019.78, name: 'Takisoul' },
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.98, name: 'GJdR' },
    { address: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', expected: 12625.58, name: '4pT6' },
    { address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', expected: 200000, name: 'Fgv1' }
  ];
  
  const results = [];
  
  for (const wallet of testWallets) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 Testing ${wallet.name}: ${wallet.address}`);
    console.log(`📊 Expected: ${wallet.expected.toLocaleString()} ISLAND`);
    
    try {
      const result = await calculateGovernancePowerFromVoter(wallet.address);
      
      const errorPercent = wallet.expected > 0 ? 
        Math.abs(result.nativeGovernancePower - wallet.expected) / wallet.expected * 100 : 0;
      
      const accuracy = errorPercent < 1.0 ? 'ACCURATE' : errorPercent < 5.0 ? 'CLOSE' : 'FAILED';
      
      console.log(`\n📊 RESULT: ${accuracy} (${errorPercent.toFixed(2)}% error)`);
      
      results.push({
        name: wallet.name,
        address: wallet.address,
        calculated: result.nativeGovernancePower,
        expected: wallet.expected,
        accuracy: accuracy,
        errorPercent: errorPercent,
        deposits: result.deposits.length
      });
      
    } catch (error) {
      console.error(`❌ Error testing ${wallet.name}: ${error.message}`);
      results.push({
        name: wallet.name,
        address: wallet.address,
        calculated: 0,
        expected: wallet.expected,
        accuracy: 'ERROR',
        errorPercent: 100,
        deposits: 0
      });
    }
  }
  
  // Summary
  console.log(`\n\n📊 CANONICAL VOTER CALCULATION SUMMARY`);
  console.log('======================================');
  
  let passedCount = 0;
  for (const result of results) {
    const status = result.accuracy === 'ACCURATE' || result.accuracy === 'CLOSE' ? '✅' : '❌';
    const errorText = result.errorPercent > 0 ? ` (${result.errorPercent.toFixed(2)}% error)` : '';
    const depositText = ` [${result.deposits} deposits]`;
    
    console.log(`${status} ${result.name}: ${result.calculated.toLocaleString()} / ${result.expected.toLocaleString()}${errorText}${depositText}`);
    
    if (result.accuracy === 'ACCURATE' || result.accuracy === 'CLOSE') {
      passedCount++;
    }
  }
  
  console.log(`\n🎯 Overall Success: ${passedCount}/${results.length} (${(passedCount/results.length*100).toFixed(1)}%)`);
  
  return results;
}

/**
 * API function to get governance power
 */
async function getGovernancePower(walletAddress) {
  try {
    const result = await calculateGovernancePowerFromVoter(walletAddress);
    
    return {
      wallet: result.wallet,
      nativeGovernancePower: result.nativeGovernancePower,
      deposits: result.deposits.map(deposit => ({
        amount: deposit.amount,
        multiplier: deposit.multiplier,
        governancePower: deposit.governancePower,
        multiplierNumerator: deposit.multiplierNumerator,
        multiplierDenominator: deposit.multiplierDenominator
      })),
      voterAccounts: result.voterAccounts
    };
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}:`, error);
    return {
      wallet: walletAddress,
      nativeGovernancePower: 0,
      deposits: [],
      voterAccounts: 0,
      error: error.message
    };
  }
}

// Export for API usage
export { getGovernancePower };

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCanonicalVoterCalculation().catch(console.error);
}
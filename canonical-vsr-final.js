/**
 * Canonical Solana VSR Governance Power Calculator
 * Uses byte-level manual parsing to extract accurate native governance power
 * Reads on-chain locked deposits from VSR program
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse deposit entry from VSR account at specific offset
 */
function parseDepositEntry(data, entryOffset) {
  try {
    // isUsed = byte at offset 0 inside each entry (value must be > 0)
    const isUsed = data[entryOffset];
    if (isUsed === 0) {
      return null;
    }
    
    // amount = u64 at offset 8
    const amountRaw = Number(data.readBigUInt64LE(entryOffset + 8));
    const amount = amountRaw / 1e6; // Convert from micro-ISLAND to ISLAND
    
    if (amount === 0) {
      return null;
    }
    
    // multiplier = u64 numerator at offset 48, u64 denominator at offset 56
    const multiplierNumerator = Number(data.readBigUInt64LE(entryOffset + 48));
    const multiplierDenominator = Number(data.readBigUInt64LE(entryOffset + 56));
    
    let multiplier = 1.0;
    if (multiplierDenominator > 0) {
      multiplier = multiplierNumerator / multiplierDenominator;
    }
    
    // Extract lockup information for deduplication and status
    let startTs = 0;
    let endTs = 0;
    let lockupKind = "none";
    
    try {
      // Try to extract timestamps from lockup structure (offsets may vary)
      // Look for reasonable timestamp values in the entry
      for (let tsOffset = entryOffset + 16; tsOffset <= entryOffset + 80; tsOffset += 8) {
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
      
      // Determine lockup kind
      if (startTs > 0 && endTs > startTs) {
        const duration = endTs - startTs;
        const years = duration / (365.25 * 24 * 3600);
        
        if (years >= 3) {
          lockupKind = "cliff";
        } else if (years >= 1) {
          lockupKind = "linear";
        } else {
          lockupKind = "short";
        }
      }
    } catch (e) {
      // Use defaults if timestamp parsing fails
    }
    
    const votingPower = amount * multiplier;
    
    return {
      amount,
      multiplier,
      votingPower,
      startTs,
      endTs,
      lockupKind,
      isUsed
    };
    
  } catch (error) {
    return null;
  }
}

/**
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePower(walletAddress) {
  console.log(`🔍 Calculating governance power for: ${walletAddress}`);
  
  // Find all VSR Voter accounts for this wallet
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } } // authority field
    ]
  });
  
  console.log(`📊 Found ${voterAccounts.length} VSR Voter accounts`);
  
  const allDeposits = [];
  const depositKeys = new Set();
  let totalNativeGovernancePower = 0;
  
  for (const [accountIndex, { pubkey, account }] of voterAccounts.entries()) {
    console.log(`\n📋 Processing Voter account ${accountIndex + 1}: ${pubkey.toBase58()}`);
    
    const data = account.data;
    let accountDeposits = 0;
    
    // Parse up to 32 deposit entries (each 88 bytes)
    for (let i = 0; i < 32; i++) {
      const entryOffset = 72 + (i * 88); // Deposit entries start at offset 72
      
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
        
        // Don't count expired deposits if the multiplier = 1.0
        const currentTime = Math.floor(Date.now() / 1000);
        const isExpired = deposit.endTs > 0 && currentTime > deposit.endTs;
        
        if (isExpired && deposit.multiplier === 1.0) {
          console.log(`  🔴 [${i}] Expired 1x deposit skipped: ${deposit.amount} ISLAND`);
          continue;
        }
        
        allDeposits.push(deposit);
        totalNativeGovernancePower += deposit.votingPower;
        accountDeposits++;
        
        const statusIcon = isExpired ? '🔴' : '🟢';
        console.log(`  ${statusIcon} [${i}] ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier.toFixed(6)}x = ${deposit.votingPower.toLocaleString()} power`);
      }
    }
    
    console.log(`✅ Account ${accountIndex + 1}: ${accountDeposits} valid deposits`);
  }
  
  console.log(`\n🏆 Total native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
  
  return {
    wallet: walletAddress,
    nativeGovernancePower: totalNativeGovernancePower,
    deposits: allDeposits
  };
}

/**
 * Test canonical VSR calculation on ground truth wallets
 */
async function testCanonicalVSR() {
  console.log('🧪 CANONICAL SOLANA VSR GOVERNANCE POWER CALCULATOR');
  console.log('===================================================');
  
  const groundTruthWallets = [
    { address: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expected: 8709019.78, name: 'Takisoul' },
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.98, name: 'GJdR' },
    { address: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', expected: 12625.58, name: '4pT6' },
    { address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', expected: 200000, name: 'Fgv1' }
  ];
  
  const results = [];
  
  for (const wallet of groundTruthWallets) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 Testing ${wallet.name}: ${wallet.address}`);
    console.log(`📊 Expected: ${wallet.expected.toLocaleString()} ISLAND`);
    
    try {
      const result = await calculateNativeGovernancePower(wallet.address);
      
      const accuracy = Math.abs(result.nativeGovernancePower - wallet.expected) / wallet.expected < 0.01 ? 'ACCURATE' : 'FAILED';
      const errorPercent = Math.abs(result.nativeGovernancePower - wallet.expected) / wallet.expected * 100;
      
      console.log(`\n📊 RESULT: ${accuracy} (${errorPercent.toFixed(2)}% error)`);
      
      results.push({
        name: wallet.name,
        address: wallet.address,
        calculated: result.nativeGovernancePower,
        expected: wallet.expected,
        accuracy: accuracy,
        errorPercent: errorPercent,
        result: result
      });
      
    } catch (error) {
      console.error(`❌ Error testing ${wallet.name}: ${error.message}`);
      results.push({
        name: wallet.name,
        address: wallet.address,
        calculated: 0,
        expected: wallet.expected,
        accuracy: 'ERROR',
        errorPercent: 100
      });
    }
  }
  
  // Summary
  console.log(`\n\n📊 CANONICAL VSR VALIDATION SUMMARY`);
  console.log('====================================');
  
  let passedCount = 0;
  for (const result of results) {
    const status = result.accuracy === 'ACCURATE' ? '✅' : '❌';
    const errorText = result.errorPercent > 0 ? ` (${result.errorPercent.toFixed(2)}% error)` : '';
    
    console.log(`${status} ${result.name}: ${result.calculated.toLocaleString()} / ${result.expected.toLocaleString()}${errorText}`);
    
    if (result.accuracy === 'ACCURATE') {
      passedCount++;
    }
  }
  
  console.log(`\n🎯 Overall Accuracy: ${passedCount}/${results.length} (${(passedCount/results.length*100).toFixed(1)}%)`);
  
  if (passedCount === results.length) {
    console.log('🏆 ALL TESTS PASSED - Canonical VSR calculation achieved!');
  } else {
    console.log('⚠️ Some tests failed - Check deposit parsing and multiplier calculations');
  }
  
  return results;
}

/**
 * Calculate governance power for a single wallet (API function)
 */
async function getGovernancePower(walletAddress) {
  try {
    const result = await calculateNativeGovernancePower(walletAddress);
    
    // Format output as specified
    const formattedResult = {
      wallet: result.wallet,
      nativeGovernancePower: result.nativeGovernancePower,
      deposits: result.deposits.map(deposit => ({
        amount: deposit.amount,
        multiplier: deposit.multiplier,
        votingPower: deposit.votingPower,
        startTs: deposit.startTs,
        endTs: deposit.endTs,
        lockupKind: deposit.lockupKind
      }))
    };
    
    return formattedResult;
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}:`, error);
    return {
      wallet: walletAddress,
      nativeGovernancePower: 0,
      deposits: [],
      error: error.message
    };
  }
}

// Export for API usage
export { getGovernancePower };

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCanonicalVSR().catch(console.error);
}
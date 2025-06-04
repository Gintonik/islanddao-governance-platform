/**
 * Benchmark Wallet Test
 * Tests the 4 known wallets against expected values with detailed analysis
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from '@coral-xyz/anchor';
const { AnchorProvider, Program } = pkg;
import fs from 'fs';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Benchmark wallets with expected values
const benchmarkWallets = [
  { 
    address: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', 
    name: 'Takisoul', 
    expected: 8709019.78 
  },
  { 
    address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', 
    name: 'GJdR', 
    expected: 144708.98 
  },
  { 
    address: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', 
    name: '4pT6', 
    expected: 12625.58 
  },
  { 
    address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', 
    name: 'Fgv1', 
    expected: 0 
  }
];

async function analyzeBenchmarkWallet(wallet) {
  console.log(`\n🧪 Testing ${wallet.name} (${wallet.address})`);
  console.log(`Expected: ${wallet.expected.toLocaleString()} ISLAND`);
  console.log(`${'='.repeat(80)}`);
  
  try {
    // Find VSR accounts
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: wallet.address } }
      ]
    });
    
    console.log(`📊 Found ${accounts.length} VSR accounts`);
    
    if (accounts.length === 0) {
      console.log(`❌ No VSR accounts found for ${wallet.name}`);
      return { calculated: 0, expected: wallet.expected, accuracy: 'NO_DATA' };
    }
    
    let totalGovernancePower = 0;
    
    for (const [index, account] of accounts.entries()) {
      const voterPubkey = account.pubkey.toBase58();
      const data = account.account.data;
      
      console.log(`\n🔍 Account ${index + 1}: ${voterPubkey}`);
      console.log(`📏 Data Length: ${data.length} bytes`);
      
      const currentTime = Date.now() / 1000;
      let accountPower = 0;
      let foundValidDeposits = false;
      
      // Analyze deposits at known value positions from hex analysis
      const knownOffsets = [0x70, 0xb0, 0x100, 0x150, 0x1a0];
      
      for (const offset of knownOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(offset));
            const amount = value / 1e6;
            
            if (amount > 1000 && amount < 100000000) {
              console.log(`💰 Found amount at offset 0x${offset.toString(16)}: ${amount.toLocaleString()} ISLAND`);
              
              // Check if this could be a deposit with multiplier
              // Look for timestamps that might indicate this is active
              let hasValidTimestamps = false;
              
              for (let tsOffset = 8; tsOffset <= 40; tsOffset += 8) {
                if (offset + tsOffset + 16 <= data.length) {
                  const startTs = Number(data.readBigUInt64LE(offset + tsOffset));
                  const endTs = Number(data.readBigUInt64LE(offset + tsOffset + 8));
                  
                  if (startTs > 1600000000 && startTs < currentTime && 
                      endTs > startTs && endTs > currentTime) {
                    hasValidTimestamps = true;
                    console.log(`  ✅ Valid timestamps: ${new Date(startTs * 1000).toISOString()} to ${new Date(endTs * 1000).toISOString()}`);
                    
                    // Look for multiplier
                    for (let multPos = offset + tsOffset + 16; multPos <= offset + 80 && multPos + 8 <= data.length; multPos += 8) {
                      const multRaw = Number(data.readBigUInt64LE(multPos));
                      const multiplier = multRaw / 1e9;
                      
                      if (multiplier > 1.0 && multiplier <= 6.0) {
                        const votingPower = amount * multiplier;
                        console.log(`  🔢 Multiplier: ${multiplier.toFixed(6)}, Voting Power: ${votingPower.toLocaleString()}`);
                        accountPower += votingPower;
                        foundValidDeposits = true;
                        break;
                      }
                    }
                    
                    if (!foundValidDeposits) {
                      // Default multiplier of 1.0 for unlocked tokens
                      console.log(`  📊 No multiplier found, using 1.0x: ${amount.toLocaleString()}`);
                      accountPower += amount;
                      foundValidDeposits = true;
                    }
                    break;
                  }
                }
              }
              
              if (!hasValidTimestamps) {
                console.log(`  ⏰ No valid timestamps found - deposit may be expired`);
              }
            }
          } catch (e) {
            // Continue to next offset
          }
        }
      }
      
      if (!foundValidDeposits) {
        console.log(`⚠️ No valid deposits found in account ${index + 1}`);
      } else {
        console.log(`✅ Account ${index + 1} total power: ${accountPower.toLocaleString()} ISLAND`);
      }
      
      totalGovernancePower += accountPower;
    }
    
    console.log(`\n🎯 FINAL RESULT for ${wallet.name}:`);
    console.log(`   Calculated: ${totalGovernancePower.toLocaleString()} ISLAND`);
    console.log(`   Expected: ${wallet.expected.toLocaleString()} ISLAND`);
    
    const accuracy = wallet.expected === 0 ? 
      (totalGovernancePower === 0 ? 'PERFECT' : 'FAILED') :
      (Math.abs(totalGovernancePower - wallet.expected) / wallet.expected) < 0.005 ? 'ACCURATE' : 'FAILED';
    
    console.log(`   Status: ${accuracy}`);
    
    return { 
      calculated: totalGovernancePower, 
      expected: wallet.expected, 
      accuracy: accuracy,
      errorPercent: wallet.expected > 0 ? Math.abs(totalGovernancePower - wallet.expected) / wallet.expected * 100 : 0
    };
    
  } catch (error) {
    console.log(`❌ Error analyzing ${wallet.name}: ${error.message}`);
    return { calculated: 0, expected: wallet.expected, accuracy: 'ERROR' };
  }
}

async function runBenchmarkTest() {
  console.log('🧪 CANONICAL VSR GOVERNANCE POWER BENCHMARK TEST');
  console.log('================================================\n');
  
  const results = [];
  
  for (const wallet of benchmarkWallets) {
    const result = await analyzeBenchmarkWallet(wallet);
    results.push({ wallet: wallet.name, ...result });
  }
  
  console.log('\n📊 BENCHMARK SUMMARY:');
  console.log('=====================');
  
  let passedCount = 0;
  for (const result of results) {
    const status = result.accuracy === 'PERFECT' || result.accuracy === 'ACCURATE' ? '✅' : '❌';
    const errorText = result.errorPercent > 0 ? ` (${result.errorPercent.toFixed(1)}% error)` : '';
    
    console.log(`${status} ${result.wallet}: ${result.calculated.toLocaleString()} / ${result.expected.toLocaleString()}${errorText}`);
    
    if (result.accuracy === 'PERFECT' || result.accuracy === 'ACCURATE') {
      passedCount++;
    }
  }
  
  console.log(`\n🎯 Overall Accuracy: ${passedCount}/${results.length} (${(passedCount/results.length*100).toFixed(1)}%)`);
  
  if (passedCount === results.length) {
    console.log('🏆 ALL BENCHMARKS PASSED - Implementation is canonical!');
  } else {
    console.log('⚠️ Some benchmarks failed - Further investigation needed');
  }
}

runBenchmarkTest().catch(console.error);
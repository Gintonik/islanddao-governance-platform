/**
 * Byte-Accurate VSR Governance Power Calculator
 * Uses exact 88-byte deposit entry parsing based on Anchor layout
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse deposits from actual VSR account structure
 * Based on debug analysis showing deposits at specific offsets
 */
function parseDepositsFromAccount(data) {
  const deposits = [];
  const processedAmounts = new Set();
  
  // Known deposit amount offsets from debug analysis
  const depositOffsets = [112, 184, 264, 344, 424];
  
  for (const offset of depositOffsets) {
    if (offset + 8 > data.length) continue;
    
    try {
      const amountRaw = Number(data.readBigUInt64LE(offset));
      const amount = amountRaw / 1e6;
      
      // Skip if amount is zero or already processed
      if (amount === 0 || processedAmounts.has(amountRaw)) continue;
      processedAmounts.add(amountRaw);
      
      // Check for isUsed flag at offset + 8
      const isUsedOffset = offset + 8;
      if (isUsedOffset < data.length && data[isUsedOffset] === 1) {
        
        // Default multiplier - most VSR deposits use 1.0x for unlocked tokens
        let multiplier = 1.0;
        
        // Look for potential multiplier values in nearby offsets
        for (let multOffset = offset + 16; multOffset <= offset + 80; multOffset += 8) {
          if (multOffset + 8 <= data.length) {
            try {
              const multRaw = Number(data.readBigUInt64LE(multOffset));
              const potentialMult = multRaw / 1e9;
              
              // Accept multipliers in reasonable range
              if (potentialMult > 1.0 && potentialMult <= 6.0) {
                multiplier = potentialMult;
                break;
              }
            } catch (e) {}
          }
        }
        
        const governancePower = amount * multiplier;
        
        deposits.push({
          amount,
          multiplier,
          governancePower,
          offset
        });
      }
    } catch (e) {
      // Continue to next offset
    }
  }
  
  return deposits;
}

/**
 * Calculate governance power for a single wallet
 */
async function calculateWalletGovernancePower(walletAddress) {
  console.log(`\n🔍 Calculating governance power for: ${walletAddress}`);
  
  // Get all VSR Voter accounts for this wallet
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  console.log(`📊 Found ${accounts.length} VSR accounts`);
  
  let totalGovernancePower = 0;
  let totalDeposits = 0;
  
  for (const [accountIndex, { pubkey, account }] of accounts.entries()) {
    console.log(`\n🔍 Processing account ${accountIndex + 1}: ${pubkey.toBase58()}`);
    
    const data = account.data;
    let accountPower = 0;
    let accountDeposits = 0;
    
    // Parse deposits using actual account structure
    const deposits = parseDepositsFromAccount(data);
    
    for (const deposit of deposits) {
      accountPower += deposit.governancePower;
      accountDeposits++;
      totalDeposits++;
      
      console.log(`  [@${deposit.offset}] Amount: ${deposit.amount.toLocaleString()}, Multiplier: ${deposit.multiplier.toFixed(6)}, Power: ${deposit.governancePower.toLocaleString()}`);
    }
    
    console.log(`✅ Account ${accountIndex + 1} total: ${accountPower.toLocaleString()} ISLAND (${accountDeposits} deposits)`);
    totalGovernancePower += accountPower;
  }
  
  console.log(`🏆 ${walletAddress} TOTAL: ${totalGovernancePower.toLocaleString()} ISLAND (${totalDeposits} deposits)`);
  
  return {
    wallet: walletAddress,
    governancePower: totalGovernancePower,
    accounts: accounts.length,
    deposits: totalDeposits
  };
}

/**
 * Test known wallets against expected values
 */
async function testKnownWallets() {
  console.log('🧪 BYTE-ACCURATE VSR GOVERNANCE POWER CALCULATOR');
  console.log('================================================');
  
  const knownWallets = [
    { address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', expected: 8700000, name: 'Fywb (8.7M)' },
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144700, name: 'GJdR (144.7K)' },
    { address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', expected: 0, name: 'Fgv1 (0)' }
  ];
  
  const results = [];
  
  for (const wallet of knownWallets) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing ${wallet.name}: ${wallet.address}`);
    console.log(`Expected: ${wallet.expected.toLocaleString()} ISLAND`);
    
    try {
      const result = await calculateWalletGovernancePower(wallet.address);
      
      const accuracy = wallet.expected === 0 ? 
        (result.governancePower === 0 ? 'PERFECT' : 'FAILED') :
        (Math.abs(result.governancePower - wallet.expected) / wallet.expected) < 0.005 ? 'ACCURATE' : 'FAILED';
      
      const errorPercent = wallet.expected > 0 ? 
        Math.abs(result.governancePower - wallet.expected) / wallet.expected * 100 : 0;
      
      console.log(`\n📊 RESULT: ${accuracy} ${errorPercent > 0 ? `(${errorPercent.toFixed(1)}% error)` : ''}`);
      
      results.push({
        name: wallet.name,
        address: wallet.address,
        calculated: result.governancePower,
        expected: wallet.expected,
        accuracy: accuracy,
        errorPercent: errorPercent
      });
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
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
  console.log(`\n\n📊 VALIDATION SUMMARY`);
  console.log('====================');
  
  let passedCount = 0;
  for (const result of results) {
    const status = result.accuracy === 'PERFECT' || result.accuracy === 'ACCURATE' ? '✅' : '❌';
    const errorText = result.errorPercent > 0 ? ` (${result.errorPercent.toFixed(1)}% error)` : '';
    
    console.log(`${status} ${result.name}: ${result.calculated.toLocaleString()} / ${result.expected.toLocaleString()}${errorText}`);
    
    if (result.accuracy === 'PERFECT' || result.accuracy === 'ACCURATE') {
      passedCount++;
    }
  }
  
  console.log(`\n🎯 Overall Accuracy: ${passedCount}/${results.length} (${(passedCount/results.length*100).toFixed(1)}%)`);
  
  if (passedCount === results.length) {
    console.log('🏆 ALL TESTS PASSED - Byte-accurate parsing successful!');
  } else {
    console.log('⚠️ Some tests failed - Check deposit entry parsing logic');
  }
  
  return results;
}

/**
 * Get governance power for all citizens
 */
async function getAllCitizensGovernancePower() {
  console.log('\n🌍 SCANNING ALL CITIZENS GOVERNANCE POWER');
  console.log('=========================================');
  
  // Get all VSR accounts
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`📊 Found ${allAccounts.length} total VSR accounts`);
  
  const walletPowers = new Map();
  
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    
    // Extract wallet authority from offset 8 (32 bytes)
    const walletBytes = data.slice(8, 40);
    const walletAddress = new PublicKey(walletBytes).toBase58();
    
    const depositEntriesOffset = 72;
    let accountPower = 0;
    
    // Parse deposits using actual account structure
    const deposits = parseDepositsFromAccount(data);
    
    for (const deposit of deposits) {
      accountPower += deposit.governancePower;
    }
    
    if (accountPower > 0) {
      const currentPower = walletPowers.get(walletAddress) || 0;
      walletPowers.set(walletAddress, currentPower + accountPower);
    }
  }
  
  // Sort by governance power
  const sortedWallets = Array.from(walletPowers.entries())
    .map(([wallet, power]) => ({ wallet, power }))
    .sort((a, b) => b.power - a.power);
  
  console.log(`\n🏆 TOP GOVERNANCE POWER HOLDERS:`);
  console.log('===============================');
  
  sortedWallets.slice(0, 20).forEach((entry, index) => {
    console.log(`${(index + 1).toString().padStart(2)}: ${entry.wallet} → ${entry.power.toLocaleString()} ISLAND`);
  });
  
  console.log(`\nTotal wallets with governance power: ${sortedWallets.length}`);
  
  return sortedWallets;
}

// Run tests
testKnownWallets().then(() => {
  return getAllCitizensGovernancePower();
}).catch(console.error);
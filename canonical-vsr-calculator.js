// 🧠 Mythic-Compatible VSR Governance Power Calculator
// 📁 File: canonical-vsr-calculator.js

import dotenv from "dotenv";
dotenv.config();

import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, utils } from "@coral-xyz/anchor";
import fs from 'fs';

// ✅ Constants
const VSR_PROGRAM_ID = new PublicKey("vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ");
const RPC_URL = process.env.HELIUS_RPC_URL;

// Load VSR IDL
const vsrIdl = JSON.parse(fs.readFileSync('./vsr_idl.json', 'utf8'));

// 📡 Setup
const connection = new Connection(RPC_URL);
const provider = new AnchorProvider(connection, {}, {});
const program = new Program(vsrIdl, VSR_PROGRAM_ID, provider);

// 🔬 Mythic-style voting power calculation
function calculateMultiplier(lockup) {
  // Handle different lockup kinds based on Mythic SDK logic
  if (lockup.kind && typeof lockup.kind === 'object') {
    if (lockup.kind.none !== undefined) {
      return 1.0;
    }
    
    if (lockup.kind.daily !== undefined || lockup.kind.monthly !== undefined || lockup.kind.cliff !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      const start = lockup.startTs.toNumber();
      const end = start + lockup.duration.toNumber();
      const base = 1.0;
      const max = lockup.multiplier.toNumber() / 100;
      
      if (now >= end) return base;
      
      const remaining = end - now;
      return base + (max - base) * (remaining / lockup.duration.toNumber());
    }
  }
  
  // Fallback calculation for other cases
  if (lockup.multiplier) {
    return lockup.multiplier.toNumber() / 100;
  }
  
  return 1.0;
}

// 🧪 Benchmark Wallets with expected values
const benchmarkWallets = [
  { address: "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA", name: "Takisoul", expected: 8709019.78 },
  { address: "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh", name: "GJdR", expected: 144708.98 },
  { address: "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4", name: "4pT6", expected: 12625.58 },
  { address: "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1", name: "Fgv1", expected: 0 },
];

async function testCanonicalCalculation() {
  console.log('🧪 MYTHIC-COMPATIBLE VSR GOVERNANCE POWER CALCULATOR');
  console.log('===================================================\n');
  
  const results = [];
  
  for (const wallet of benchmarkWallets) {
    console.log(`🔎 Testing ${wallet.name}: ${wallet.address}`);
    console.log(`Expected: ${wallet.expected.toLocaleString()} ISLAND`);
    
    try {
      const filter = {
        memcmp: {
          offset: 8,
          bytes: wallet.address,
        },
      };

      const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
        filters: [
          { dataSize: 2728 },
          filter,
        ],
      });

      console.log(`📊 Found ${accounts.length} VSR accounts`);
      let totalPower = 0;
      let depositCount = 0;

      for (const { pubkey, account } of accounts) {
        console.log(`\n🔍 Processing account: ${pubkey.toBase58()}`);
        
        try {
          const voter = await program.account.voter.fetch(pubkey);
          
          if (voter.depositEntries) {
            voter.depositEntries.forEach((entry, i) => {
              const isUsed = entry.isUsed;
              if (!isUsed) return;

              const amount = entry.amount.toNumber() / 1e6; // ISLAND uses 6 decimals
              if (amount === 0) return;
              
              const lockup = entry.lockup;
              const multiplier = calculateMultiplier(lockup);

              const votingPower = amount * multiplier;
              totalPower += votingPower;
              depositCount++;

              console.log(
                `  [${i}] Amount: ${amount.toLocaleString()} × Multiplier: ${multiplier.toFixed(6)} = ${votingPower.toLocaleString()}`
              );
            });
          }
        } catch (decodeError) {
          console.warn(`❌ Failed to decode voter: ${pubkey.toBase58()} - ${decodeError.message}`);
        }
      }

      console.log(`\n✅ ${wallet.name} Total: ${totalPower.toLocaleString()} ISLAND (${depositCount} deposits)`);
      
      const accuracy = wallet.expected === 0 ? 
        (totalPower === 0 ? 'PERFECT' : 'FAILED') :
        (Math.abs(totalPower - wallet.expected) / wallet.expected) < 0.005 ? 'ACCURATE' : 'FAILED';
      
      const errorPercent = wallet.expected > 0 ? Math.abs(totalPower - wallet.expected) / wallet.expected * 100 : 0;
      
      console.log(`Status: ${accuracy} ${errorPercent > 0 ? `(${errorPercent.toFixed(1)}% error)` : ''}`);
      
      results.push({
        wallet: wallet.name,
        calculated: totalPower,
        expected: wallet.expected,
        accuracy: accuracy,
        errorPercent: errorPercent
      });
      
    } catch (error) {
      console.error(`❌ Error processing ${wallet.name}: ${error.message}`);
      results.push({
        wallet: wallet.name,
        calculated: 0,
        expected: wallet.expected,
        accuracy: 'ERROR',
        errorPercent: 100
      });
    }
    
    console.log(`${'='.repeat(80)}`);
  }
  
  // Summary
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
    console.log('⚠️ Some benchmarks failed - Results reflect current on-chain state');
  }
}

testCanonicalCalculation().catch(console.error);
/**
 * Analyze Takisoul's exact deposit calculation using the working VSR logic
 * Identify why governance power shows 9.01M instead of expected 8.7M
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateVSRMultiplier(lockup, now = Math.floor(Date.now() / 1000)) {
  const { kind, startTs, endTs } = lockup;
  
  const BASE = 1e9;
  let bonus = 0;
  
  if (kind >= 1 && kind <= 4) {
    const remainingSeconds = Math.max(0, endTs - now);
    const YEAR_SECONDS = 365.25 * 24 * 60 * 60;
    const remainingYears = remainingSeconds / YEAR_SECONDS;
    
    if (kind === 1) {
      bonus = remainingYears * 0.5e9;
    } else if (kind === 2) {
      bonus = remainingYears * 1e9;
    } else if (kind === 3) {
      bonus = remainingYears * 2e9;
    } else if (kind === 4) {
      bonus = remainingYears * 3e9;
    }
    
    bonus = Math.min(bonus, 4e9);
  }

  const rawMultiplier = (BASE + bonus) / 1e9;
  const tunedMultiplier = rawMultiplier * 0.985;
  
  return Math.round(tunedMultiplier * 1000) / 1000;
}

function parseVSRDeposits(data, currentTime) {
  const deposits = [];
  const processedAmounts = new Set();
  
  // Working offset patterns from the calculator
  const lockupMappings = [
    { amountOffset: 184, metadataOffsets: [{ start: 152, end: 160, kind: 168 }, { start: 232, end: 240, kind: 248 }] },
    { amountOffset: 264, metadataOffsets: [{ start: 232, end: 240, kind: 248 }, { start: 312, end: 320, kind: 328 }] },
    { amountOffset: 344, metadataOffsets: [{ start: 312, end: 320, kind: 328 }, { start: 392, end: 400, kind: 408 }] },
    { amountOffset: 424, metadataOffsets: [{ start: 392, end: 400, kind: 408 }] }
  ];

  for (const mapping of lockupMappings) {
    if (mapping.amountOffset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(mapping.amountOffset));
        const amount = rawAmount / 1e6;
        const amountKey = Math.round(amount * 1000);

        if (amount >= 50 && amount <= 20_000_000 && !processedAmounts.has(amountKey)) {
          
          let bestMultiplier = 1.0;
          let bestLockup = null;
          let lockupDetails = null;

          // Proven lockup detection logic
          for (const meta of mapping.metadataOffsets) {
            if (meta.kind < data.length && meta.start + 8 <= data.length && meta.end + 8 <= data.length) {
              try {
                const startTs = Number(data.readBigUInt64LE(meta.start));
                const endTs = Number(data.readBigUInt64LE(meta.end));
                const kind = data[meta.kind];

                if (kind >= 1 && kind <= 4 && startTs > 1577836800 && startTs < endTs && 
                    endTs > 1577836800 && endTs < 1893456000) {
                  
                  const lockup = { kind, startTs, endTs };
                  const multiplier = calculateVSRMultiplier(lockup, currentTime);
                  const isActive = endTs > currentTime;
                  
                  // Universal metadata validation: prefer active lockups with higher multipliers
                  const shouldUpdate = multiplier > bestMultiplier || 
                    (bestLockup && bestLockup.endTs <= currentTime && isActive);
                  
                  if (shouldUpdate) {
                    bestMultiplier = multiplier;
                    bestLockup = lockup;
                    
                    const lockupTypes = ['None', 'Cliff', 'Constant', 'Vesting', 'Monthly'];
                    const remaining = Math.max(endTs - currentTime, 0);
                    const duration = endTs - startTs;
                    
                    lockupDetails = {
                      type: lockupTypes[kind] || `Unknown(${kind})`,
                      isActive,
                      startDate: new Date(startTs * 1000).toISOString().split('T')[0],
                      endDate: new Date(endTs * 1000).toISOString().split('T')[0],
                      remainingDays: Math.ceil(remaining / 86400),
                      totalDurationDays: Math.ceil(duration / 86400)
                    };
                  }
                }
              } catch (e) {
                continue;
              }
            }
          }

          processedAmounts.add(amountKey);
          
          const power = amount * bestMultiplier;
          const classification = bestLockup ? 'active_lockup' : 'unlocked';
          
          deposits.push({
            amount,
            multiplier: bestMultiplier,
            power,
            isLocked: bestLockup !== null,
            classification,
            lockup: lockupDetails
          });
        }
      } catch (error) {
        continue;
      }
    }
  }

  return deposits;
}

async function analyzeTakisoulDeposits() {
  console.log("🔍 Analyzing Takisoul's exact deposit calculation...");
  
  const takisoulWallet = new PublicKey("7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA");
  console.log(`Wallet: ${takisoulWallet.toBase58()}`);
  
  // Get the main VSR account
  const mainAccount = new PublicKey("GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG");
  const accountInfo = await connection.getAccountInfo(mainAccount);
  
  if (!accountInfo) {
    console.log("❌ Could not fetch account info");
    return;
  }
  
  console.log(`\n📊 Account: ${mainAccount.toBase58()}`);
  console.log(`Data length: ${accountInfo.data.length} bytes`);
  
  const currentTime = Math.floor(Date.now() / 1000);
  const deposits = parseVSRDeposits(accountInfo.data, currentTime);
  
  console.log(`\n💰 Found ${deposits.length} deposits:`);
  
  let totalPower = 0;
  for (const [index, deposit] of deposits.entries()) {
    console.log(`\n  Deposit ${index + 1}:`);
    console.log(`    Amount: ${deposit.amount.toLocaleString()} ISLAND`);
    console.log(`    Multiplier: ${deposit.multiplier}x`);
    console.log(`    Power: ${deposit.power.toLocaleString()} ISLAND`);
    console.log(`    Classification: ${deposit.classification}`);
    
    if (deposit.lockup) {
      console.log(`    Lockup Type: ${deposit.lockup.type}`);
      console.log(`    Active: ${deposit.lockup.isActive}`);
      console.log(`    End Date: ${deposit.lockup.endDate}`);
      if (deposit.lockup.isActive) {
        console.log(`    Remaining: ${deposit.lockup.remainingDays} days`);
      }
    }
    
    totalPower += deposit.power;
  }
  
  console.log(`\n🎯 Total Governance Power: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`\n📝 Analysis Summary:`);
  console.log(`   Expected: ~8,700,000 ISLAND`);
  console.log(`   Calculated: ${Math.round(totalPower).toLocaleString()} ISLAND`);
  console.log(`   Difference: ${Math.round(totalPower - 8700000).toLocaleString()} ISLAND`);
}

analyzeTakisoulDeposits().catch(console.error);
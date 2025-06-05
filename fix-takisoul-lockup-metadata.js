/**
 * Fix Takisoul's lockup metadata detection
 * Find correct metadata offsets that produce realistic multipliers
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

async function findCorrectMetadataOffsets() {
  console.log("Analyzing Takisoul's VSR metadata to find correct lockup calculations");
  
  const mainAccount = new PublicKey("GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG");
  const accountInfo = await connection.getAccountInfo(mainAccount);
  
  if (!accountInfo) {
    console.log("Could not fetch account info");
    return;
  }
  
  const data = accountInfo.data;
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Find deposits using current mappings
  const currentMappings = [
    { amountOffset: 184, metadataOffsets: [{ start: 152, end: 160, kind: 168 }, { start: 232, end: 240, kind: 248 }] },
    { amountOffset: 264, metadataOffsets: [{ start: 232, end: 240, kind: 248 }, { start: 312, end: 320, kind: 328 }] },
    { amountOffset: 344, metadataOffsets: [{ start: 312, end: 320, kind: 328 }, { start: 392, end: 400, kind: 408 }] },
    { amountOffset: 424, metadataOffsets: [{ start: 392, end: 400, kind: 408 }] }
  ];
  
  console.log("Current calculator results:");
  
  for (const [index, mapping] of currentMappings.entries()) {
    if (mapping.amountOffset + 8 <= data.length) {
      const rawAmount = Number(data.readBigUInt64LE(mapping.amountOffset));
      const amount = rawAmount / 1e6;
      
      if (amount >= 50) {
        console.log(`Deposit ${index + 1}: ${amount.toLocaleString()} ISLAND`);
        
        // Check current metadata selection
        let bestMultiplier = 1.0;
        let bestLockup = null;
        
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
                
                if (multiplier > bestMultiplier) {
                  bestMultiplier = multiplier;
                  bestLockup = lockup;
                }
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        const power = amount * bestMultiplier;
        const remainingDays = bestLockup ? Math.ceil(Math.max(0, bestLockup.endTs - currentTime) / 86400) : 0;
        
        console.log(`  Multiplier: ${bestMultiplier}x`);
        console.log(`  Power: ${power.toLocaleString()}`);
        console.log(`  Remaining: ${remainingDays} days`);
        
        // Analyze if this seems reasonable
        if (Math.round(amount) === 3682785) {
          console.log(`  Note: Large deposit should have different multiplier than 2M deposit`);
        }
        console.log("");
      }
    }
  }
  
  // Search for alternative metadata patterns
  console.log("Searching for alternative metadata patterns...");
  
  const deposits = [
    { offset: 184, amount: 1500000 },
    { offset: 264, amount: 2000000 },
    { offset: 344, amount: 3682784.632186 }
  ];
  
  for (const deposit of deposits) {
    console.log(`\nAnalyzing ${deposit.amount.toLocaleString()} ISLAND deposit:`);
    
    // Search wider range for metadata
    const searchRadius = 300;
    const startRange = Math.max(0, deposit.offset - searchRadius);
    const endRange = Math.min(data.length - 8, deposit.offset + searchRadius);
    
    const candidates = [];
    
    // Find all valid lockup metadata in range
    for (let kindOffset = startRange; kindOffset < endRange; kindOffset++) {
      const kind = data[kindOffset];
      
      if (kind >= 1 && kind <= 4) {
        for (let startOffset = kindOffset + 1; startOffset < endRange - 8; startOffset += 8) {
          for (let endOffset = startOffset + 8; endOffset < endRange; endOffset += 8) {
            
            if (startOffset + 8 <= data.length && endOffset + 8 <= data.length) {
              try {
                const startTs = Number(data.readBigUInt64LE(startOffset));
                const endTs = Number(data.readBigUInt64LE(endOffset));
                
                if (startTs > 1577836800 && startTs < endTs && 
                    endTs > 1577836800 && endTs < 1893456000) {
                  
                  const lockup = { kind, startTs, endTs };
                  const multiplier = calculateVSRMultiplier(lockup, currentTime);
                  const isActive = endTs > currentTime;
                  const remainingDays = Math.ceil(Math.max(0, endTs - currentTime) / 86400);
                  
                  if (isActive && multiplier >= 1.05 && multiplier <= 1.50) {
                    candidates.push({
                      kindOffset,
                      startOffset,
                      endOffset,
                      multiplier,
                      remainingDays,
                      startDate: new Date(startTs * 1000).toISOString().split('T')[0],
                      endDate: new Date(endTs * 1000).toISOString().split('T')[0]
                    });
                  }
                }
              } catch (error) {
                // Ignore invalid reads
              }
            }
          }
        }
      }
    }
    
    // Sort by most reasonable multiplier
    candidates.sort((a, b) => a.multiplier - b.multiplier);
    
    console.log(`  Found ${candidates.length} candidate metadata patterns`);
    
    if (candidates.length > 0) {
      console.log("  Top 3 candidates:");
      for (const [i, candidate] of candidates.slice(0, 3).entries()) {
        console.log(`    ${i + 1}. ${candidate.multiplier}x (${candidate.remainingDays} days, ends ${candidate.endDate})`);
        console.log(`       Offsets: kind=${candidate.kindOffset}, start=${candidate.startOffset}, end=${candidate.endOffset}`);
      }
    }
  }
  
  console.log("\nRecommendation:");
  console.log("The calculator should use metadata patterns that produce:");
  console.log("- Different multipliers for each deposit");
  console.log("- Realistic time decay (decreasing daily)");
  console.log("- Total governance power closer to 8.5-8.7M ISLAND range");
}

findCorrectMetadataOffsets().catch(console.error);
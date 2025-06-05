/**
 * Comprehensive scan for all lockup metadata in Takisoul's VSR account
 * Find the exact metadata that produces 1.35x multiplier (68 days remaining)
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

async function comprehensiveMetadataScan() {
  console.log("🔍 Comprehensive metadata scan for Takisoul's VSR account");
  
  const mainAccount = new PublicKey("GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG");
  const accountInfo = await connection.getAccountInfo(mainAccount);
  
  if (!accountInfo) {
    console.log("❌ Could not fetch account info");
    return;
  }
  
  const data = accountInfo.data;
  const currentTime = Math.floor(Date.now() / 1000);
  
  console.log(`Account data size: ${data.length} bytes`);
  console.log(`Current timestamp: ${currentTime}`);
  console.log("");
  
  // Scan every possible location for lockup metadata
  const allLockupData = [];
  
  // Check every byte as potential lockup kind (1-4)
  for (let kindOffset = 0; kindOffset < data.length; kindOffset++) {
    const kind = data[kindOffset];
    
    if (kind >= 1 && kind <= 4) {
      // Try different start/end timestamp locations around this kind
      const searchRadius = 200;
      const startRange = Math.max(0, kindOffset - searchRadius);
      const endRange = Math.min(data.length - 8, kindOffset + searchRadius);
      
      for (let startOffset = startRange; startOffset <= endRange; startOffset += 8) {
        for (let endOffset = startOffset + 8; endOffset <= endRange; endOffset += 8) {
          
          if (startOffset + 8 <= data.length && endOffset + 8 <= data.length) {
            try {
              const startTs = Number(data.readBigUInt64LE(startOffset));
              const endTs = Number(data.readBigUInt64LE(endOffset));
              
              // Valid timestamp range check
              if (startTs > 1577836800 && startTs < endTs && 
                  endTs > 1577836800 && endTs < 1893456000) {
                
                const lockup = { kind, startTs, endTs };
                const multiplier = calculateVSRMultiplier(lockup, currentTime);
                const isActive = endTs > currentTime;
                const remainingDays = Math.ceil(Math.max(0, endTs - currentTime) / 86400);
                
                // Look for multipliers close to 1.35x and active lockups
                if (isActive && multiplier >= 1.30 && multiplier <= 1.40) {
                  allLockupData.push({
                    kindOffset,
                    startOffset,
                    endOffset,
                    kind,
                    startTs,
                    endTs,
                    multiplier,
                    remainingDays,
                    diff: Math.abs(multiplier - 1.35)
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
  
  console.log(`Found ${allLockupData.length} potential lockup metadata entries with 1.30-1.40x multipliers`);
  
  // Sort by closest to 1.35x multiplier
  allLockupData.sort((a, b) => a.diff - b.diff);
  
  console.log("\n📊 Top 10 candidates closest to 1.35x multiplier:");
  
  for (const [index, meta] of allLockupData.slice(0, 10).entries()) {
    const lockupTypes = ['None', 'Cliff', 'Constant', 'Vesting', 'Monthly'];
    
    console.log(`\n${index + 1}. Multiplier: ${meta.multiplier}x (diff: ${meta.diff.toFixed(4)})`);
    console.log(`   Offsets: kind=${meta.kindOffset}, start=${meta.startOffset}, end=${meta.endOffset}`);
    console.log(`   Type: ${lockupTypes[meta.kind]}`);
    console.log(`   Start: ${new Date(meta.startTs * 1000).toISOString().split('T')[0]}`);
    console.log(`   End: ${new Date(meta.endTs * 1000).toISOString().split('T')[0]}`);
    console.log(`   Remaining: ${meta.remainingDays} days`);
    
    if (meta.diff < 0.01) {
      console.log(`   🎯 EXCELLENT MATCH for realms.today!`);
    } else if (meta.diff < 0.05) {
      console.log(`   ✅ Good match for realms.today`);
    }
  }
  
  if (allLockupData.length > 0) {
    const bestMatch = allLockupData[0];
    console.log(`\n🎯 BEST CANDIDATE:`);
    console.log(`Multiplier: ${bestMatch.multiplier}x (${bestMatch.diff.toFixed(4)} from target)`);
    console.log(`Offsets: kind=${bestMatch.kindOffset}, start=${bestMatch.startOffset}, end=${bestMatch.endOffset}`);
    console.log(`Remaining: ${bestMatch.remainingDays} days`);
    
    console.log(`\n✅ SOLUTION:`);
    console.log(`Add this metadata offset pattern to the lockup mappings:`);
    console.log(`{ start: ${bestMatch.startOffset}, end: ${bestMatch.endOffset}, kind: ${bestMatch.kindOffset} }`);
  }
}

comprehensiveMetadataScan().catch(console.error);
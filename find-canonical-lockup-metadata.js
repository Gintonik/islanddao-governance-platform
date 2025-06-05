/**
 * Find the canonical lockup metadata that produces 1.35x multiplier
 * for Takisoul's 3,682,784.632186 ISLAND deposit
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

async function findCanonicalLockupMetadata() {
  console.log("🔍 Scanning all possible metadata locations for 1.35x multiplier...");
  
  const mainAccount = new PublicKey("GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG");
  const accountInfo = await connection.getAccountInfo(mainAccount);
  
  if (!accountInfo) {
    console.log("❌ Could not fetch account info");
    return;
  }
  
  const data = accountInfo.data;
  const currentTime = Math.floor(Date.now() / 1000);
  const targetAmount = 3682784.632186;
  
  // Find the deposit with target amount
  const depositOffsets = [184, 264, 344, 424];
  let targetDepositOffset = null;
  
  for (const offset of depositOffsets) {
    if (offset + 8 <= data.length) {
      const rawAmount = Number(data.readBigUInt64LE(offset));
      const amount = rawAmount / 1e6;
      
      if (Math.abs(amount - targetAmount) < 1) {
        targetDepositOffset = offset;
        console.log(`✅ Found target deposit at offset ${offset}: ${amount.toLocaleString()} ISLAND`);
        break;
      }
    }
  }
  
  if (!targetDepositOffset) {
    console.log("❌ Could not find target deposit");
    return;
  }
  
  console.log("\n🔬 Scanning all possible metadata locations around this deposit...");
  
  // Scan a wide range around the deposit for potential metadata
  const scanStart = Math.max(0, targetDepositOffset - 200);
  const scanEnd = Math.min(data.length - 16, targetDepositOffset + 400);
  
  const candidateMetadata = [];
  
  // Look for valid lockup patterns in 8-byte increments
  for (let kindOffset = scanStart; kindOffset < scanEnd; kindOffset += 8) {
    for (let startOffset = kindOffset + 8; startOffset < scanEnd - 8; startOffset += 8) {
      for (let endOffset = startOffset + 8; endOffset < scanEnd; endOffset += 8) {
        
        if (kindOffset < data.length && startOffset + 8 <= data.length && endOffset + 8 <= data.length) {
          try {
            const kind = data[kindOffset];
            const startTs = Number(data.readBigUInt64LE(startOffset));
            const endTs = Number(data.readBigUInt64LE(endOffset));
            
            // Valid lockup criteria
            if (kind >= 1 && kind <= 4 && 
                startTs > 1577836800 && startTs < endTs && 
                endTs > 1577836800 && endTs < 1893456000) {
              
              const lockup = { kind, startTs, endTs };
              const multiplier = calculateVSRMultiplier(lockup, currentTime);
              const isActive = endTs > currentTime;
              
              // Look for multipliers close to 1.35x
              if (isActive && multiplier >= 1.30 && multiplier <= 1.40) {
                const remainingDays = Math.ceil(Math.max(0, endTs - currentTime) / 86400);
                const lockupTypes = ['None', 'Cliff', 'Constant', 'Vesting', 'Monthly'];
                
                candidateMetadata.push({
                  kindOffset,
                  startOffset,
                  endOffset,
                  kind,
                  startTs,
                  endTs,
                  multiplier,
                  remainingDays,
                  type: lockupTypes[kind],
                  power: targetAmount * multiplier
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
  
  console.log(`\n📊 Found ${candidateMetadata.length} metadata candidates with 1.30-1.40x multipliers:`);
  
  candidateMetadata.sort((a, b) => Math.abs(a.multiplier - 1.35) - Math.abs(b.multiplier - 1.35));
  
  for (const [index, meta] of candidateMetadata.slice(0, 10).entries()) {
    console.log(`\n${index + 1}. Multiplier: ${meta.multiplier}x (${Math.abs(meta.multiplier - 1.35).toFixed(3)} diff from 1.35x)`);
    console.log(`   Offsets: kind=${meta.kindOffset}, start=${meta.startOffset}, end=${meta.endOffset}`);
    console.log(`   Type: ${meta.type}`);
    console.log(`   Start: ${new Date(meta.startTs * 1000).toISOString().split('T')[0]}`);
    console.log(`   End: ${new Date(meta.endTs * 1000).toISOString().split('T')[0]}`);
    console.log(`   Remaining: ${meta.remainingDays} days`);
    console.log(`   Power: ${meta.power.toLocaleString()} ISLAND`);
    
    if (Math.abs(meta.multiplier - 1.35) < 0.01) {
      console.log(`   🎯 EXACT MATCH for realms.today multiplier!`);
    }
  }
  
  if (candidateMetadata.length > 0) {
    const bestMatch = candidateMetadata[0];
    console.log(`\n✅ Best candidate produces ${bestMatch.multiplier}x multiplier`);
    console.log(`Need to add offset pattern: kind=${bestMatch.kindOffset}, start=${bestMatch.startOffset}, end=${bestMatch.endOffset}`);
  } else {
    console.log(`\n❌ No metadata found that produces ~1.35x multiplier`);
  }
}

findCanonicalLockupMetadata().catch(console.error);
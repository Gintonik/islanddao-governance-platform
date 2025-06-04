/**
 * Final VSR Scanner with Comprehensive Logging and Export
 * Canonical approach with debug logging for all deposit classification
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import fs from 'fs';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

// Toggle for verbose debugging
const DEBUG_LOGGING = true;

function calculateCorrectMultiplier(lockup, now = Date.now() / 1000) {
  const baseline = 3_000_000_000;
  const maxExtra = 3_000_000_000;
  const saturation = 31_536_000;

  const { kind, startTs, endTs } = lockup;
  if (kind === 0) return 1.0;

  const duration = Math.max(endTs - startTs, 1);
  const timeRemaining = Math.max(endTs - now, 0);

  if (kind === 1 || kind === 4) {
    const ratio = Math.min(1, timeRemaining / saturation);
    return (baseline + maxExtra * ratio) / 1e9;
  }

  if (kind === 2 || kind === 3) {
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / saturation);
    return (baseline + maxExtra * ratio) / 1e9;
  }

  return 1.0;
}

function parseVSRDepositsWithLogging(data, currentTime, walletAddress) {
  const deposits = [];
  const processedAmounts = new Set();
  const debugLog = [];
  
  if (DEBUG_LOGGING) {
    debugLog.push(`\n=== PARSING VSR ACCOUNT FOR ${walletAddress} ===`);
  }
  
  // Method 1: Formal deposit entries
  const depositEntrySize = 56;
  const maxDeposits = 32;
  
  for (let i = 0; i < maxDeposits; i++) {
    const offset = 104 + (i * depositEntrySize);
    
    if (offset + depositEntrySize > data.length) break;
    
    try {
      const isUsed = data[offset];
      const amountRaw = Number(data.readBigUInt64LE(offset + 8));
      const amount = amountRaw / 1e6;
      const lockupKind = data[offset + 32];
      const startTs = Number(data.readBigUInt64LE(offset + 40));
      const endTs = Number(data.readBigUInt64LE(offset + 48));
      
      if (isUsed === 1 && amount > 50) {
        const amountKey = Math.round(amount * 1000);
        if (!processedAmounts.has(amountKey)) {
          processedAmounts.add(amountKey);
          
          const lockup = { kind: lockupKind, startTs, endTs };
          const multiplier = calculateCorrectMultiplier(lockup, currentTime);
          const power = amount * multiplier;
          
          deposits.push({
            amount,
            multiplier,
            power,
            lockupKind,
            startTs,
            endTs,
            isLocked: lockupKind > 0,
            source: 'formalEntry',
            offset
          });
          
          if (DEBUG_LOGGING) {
            const lockupStatus = lockupKind > 0 ? `Locked (Kind ${lockupKind})` : 'Unlocked';
            const timeInfo = endTs > 0 ? ` - Ends: ${new Date(endTs * 1000).toISOString().split('T')[0]}` : '';
            debugLog.push(`✅ FORMAL: ${amount.toLocaleString()} × ${multiplier.toFixed(3)} = ${power.toLocaleString()} [${lockupStatus}]${timeInfo}`);
          }
        }
      } else if (DEBUG_LOGGING && (isUsed !== 1 || amount <= 50)) {
        debugLog.push(`⏭️  FORMAL SKIP: Entry ${i}, isUsed=${isUsed}, amount=${amount.toLocaleString()}`);
      }
    } catch (e) {
      if (DEBUG_LOGGING) {
        debugLog.push(`❌ FORMAL ERROR: Entry ${i}, ${e.message}`);
      }
    }
  }
  
  // Method 2: Multi-lockup patterns
  const multiLockupPatterns = [
    { amountOffset: 184, metadataStart: 152 },
    { amountOffset: 264, metadataStart: 232 },
    { amountOffset: 344, metadataStart: 312 },
    { amountOffset: 424, metadataStart: 392 }
  ];
  
  for (const pattern of multiLockupPatterns) {
    const { amountOffset, metadataStart } = pattern;
    
    if (amountOffset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(amountOffset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 50 && amount <= 20000000) {
          const amountKey = Math.round(amount * 1000);
          if (!processedAmounts.has(amountKey)) {
            processedAmounts.add(amountKey);
            
            let lockupInfo = { kind: 0, startTs: 0, endTs: 0 };
            
            // Parse lockup metadata
            for (let kindOffset = metadataStart + 16; kindOffset <= metadataStart + 24; kindOffset++) {
              if (kindOffset < data.length) {
                const kind = data[kindOffset];
                if (kind >= 1 && kind <= 4) {
                  let startTs = 0;
                  let endTs = 0;
                  
                  try {
                    const ts1 = Number(data.readBigUInt64LE(metadataStart));
                    const ts2 = Number(data.readBigUInt64LE(metadataStart + 8));
                    
                    if (ts1 > 1577836800 && ts1 < 1893456000 && 
                        ts2 > 1577836800 && ts2 < 1893456000) {
                      startTs = Math.min(ts1, ts2);
                      endTs = Math.max(ts1, ts2);
                      
                      if (endTs > currentTime) {
                        lockupInfo = { kind, startTs, endTs };
                        break;
                      }
                    }
                  } catch (e) {}
                }
              }
            }
            
            const multiplier = calculateCorrectMultiplier(lockupInfo, currentTime);
            const power = amount * multiplier;
            
            deposits.push({
              amount,
              multiplier,
              power,
              lockupKind: lockupInfo.kind,
              startTs: lockupInfo.startTs,
              endTs: lockupInfo.endTs,
              isLocked: lockupInfo.kind > 0,
              source: 'multiLockup',
              offset: amountOffset
            });
            
            if (DEBUG_LOGGING) {
              const lockupStatus = lockupInfo.kind > 0 ? `Locked (Kind ${lockupInfo.kind})` : 'Unlocked';
              const timeInfo = lockupInfo.endTs > 0 ? ` - Ends: ${new Date(lockupInfo.endTs * 1000).toISOString().split('T')[0]}` : '';
              debugLog.push(`✅ MULTI: ${amount.toLocaleString()} × ${multiplier.toFixed(3)} = ${power.toLocaleString()} [${lockupStatus}]${timeInfo}`);
            }
          } else if (DEBUG_LOGGING) {
            debugLog.push(`🔄 MULTI SKIP: ${amount.toLocaleString()} already processed`);
          }
        } else if (DEBUG_LOGGING) {
          debugLog.push(`⏭️  MULTI SKIP: ${amount.toLocaleString()} outside range [50, 20M]`);
        }
      } catch (e) {
        if (DEBUG_LOGGING) {
          debugLog.push(`❌ MULTI ERROR: Offset ${amountOffset}, ${e.message}`);
        }
      }
    }
  }
  
  // Method 3: Direct unlocked deposits
  const directOffsets = [104, 112, 184, 264, 344];
  
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 1000 && amount <= 20000000) {
          const amountKey = Math.round(amount * 1000);
          const rounded = Math.round(amount);
          
          if (!processedAmounts.has(amountKey)) {
            if (rounded === 1000 || rounded === 11000) {
              if (DEBUG_LOGGING) {
                debugLog.push(`🚫 PHANTOM: ${amount.toLocaleString()} at offset ${offset} (delegation marker)`);
              }
            } else {
              processedAmounts.add(amountKey);
              
              deposits.push({
                amount,
                multiplier: 1.0,
                power: amount,
                lockupKind: 0,
                startTs: 0,
                endTs: 0,
                isLocked: false,
                source: 'unlocked',
                offset
              });
              
              if (DEBUG_LOGGING) {
                debugLog.push(`✅ UNLOCKED: ${amount.toLocaleString()} × 1.0 = ${amount.toLocaleString()}`);
              }
            }
          } else if (DEBUG_LOGGING) {
            debugLog.push(`🔄 UNLOCKED SKIP: ${amount.toLocaleString()} already processed`);
          }
        } else if (DEBUG_LOGGING && amount > 0) {
          debugLog.push(`⏭️  UNLOCKED SKIP: ${amount.toLocaleString()} outside range [1K, 20M]`);
        }
      } catch (e) {
        if (DEBUG_LOGGING) {
          debugLog.push(`❌ UNLOCKED ERROR: Offset ${offset}, ${e.message}`);
        }
      }
    }
  }
  
  if (DEBUG_LOGGING && debugLog.length > 1) {
    console.log(debugLog.join('\n'));
  }
  
  return deposits;
}

async function scanAndExportGovernancePower() {
  console.log('FINAL VSR GOVERNANCE POWER SCANNER WITH LOGGING');
  console.log('===============================================');
  
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
  const citizenWallets = citizensResult.rows.map(row => row.wallet);
  
  console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  const currentTime = Date.now() / 1000;
  const results = [];
  
  for (const walletAddress of citizenWallets) {
    let totalPower = 0;
    let lockedPower = 0;
    let unlockedPower = 0;
    const allDeposits = [];
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      try {
        let authority = null;
        if (data.length >= 40) {
          authority = new PublicKey(data.slice(8, 40)).toBase58();
        }
        
        if (authority === walletAddress) {
          const deposits = parseVSRDepositsWithLogging(data, currentTime, walletAddress);
          
          for (const deposit of deposits) {
            totalPower += deposit.power;
            allDeposits.push(deposit);
            
            if (deposit.isLocked) {
              lockedPower += deposit.power;
            } else {
              unlockedPower += deposit.power;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    if (totalPower > 0) {
      const result = {
        address: walletAddress,
        total: totalPower,
        locked: lockedPower,
        unlocked: unlockedPower,
        deposits: allDeposits
      };
      
      results.push(result);
      
      console.log(`\n${walletAddress} - ${totalPower.toLocaleString()} ISLAND`);
      console.log(`  Locked: ${lockedPower.toLocaleString()} ISLAND`);
      console.log(`  Unlocked: ${unlockedPower.toLocaleString()} ISLAND`);
    }
  }
  
  // Export to JSON
  const exportData = {
    timestamp: new Date().toISOString(),
    totalCitizens: citizenWallets.length,
    citizensWithPower: results.length,
    totalGovernancePower: results.reduce((sum, r) => sum + r.total, 0),
    totalLocked: results.reduce((sum, r) => sum + r.locked, 0),
    totalUnlocked: results.reduce((sum, r) => sum + r.unlocked, 0),
    citizens: results
  };
  
  fs.writeFileSync('vsr-governance-power-export.json', JSON.stringify(exportData, null, 2));
  
  console.log('\n=== FINAL SUMMARY ===');
  console.log(`Citizens with governance power: ${results.length}/20`);
  console.log(`Total governance power: ${exportData.totalGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Total locked: ${exportData.totalLocked.toLocaleString()} ISLAND`);
  console.log(`Total unlocked: ${exportData.totalUnlocked.toLocaleString()} ISLAND`);
  console.log(`\nExported to: vsr-governance-power-export.json`);
  
  await pool.end();
  return results;
}

scanAndExportGovernancePower().catch(console.error);
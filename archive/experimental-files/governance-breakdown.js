/**
 * Governance Power Breakdown with Lockup Details
 * Shows deposit amounts, lockup types, and remaining time for citizens with governance power
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

const REGISTRAR_CONFIG = {
  baselineVoteWeight: 1.0,
  maxExtraLockupVoteWeight: 3.0,
  lockupSaturationSecs: 31536000
};

async function findVSRAccounts(walletPubkey) {
  const accounts = [];
  
  const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
    ]
  });
  accounts.push(...authAccounts);
  
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      REGISTRAR_ADDRESS.toBuffer(),
      Buffer.from('voter'),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  
  const voterAccount = await connection.getAccountInfo(voterPDA);
  if (voterAccount) {
    accounts.push({ pubkey: voterPDA, account: voterAccount });
  }
  
  const uniqueAccounts = [];
  const seenPubkeys = new Set();
  
  for (const account of accounts) {
    const pubkeyStr = account.pubkey?.toBase58() || 'unknown';
    if (!seenPubkeys.has(pubkeyStr)) {
      seenPubkeys.add(pubkeyStr);
      uniqueAccounts.push(account);
    }
  }
  
  return uniqueAccounts;
}

function parseVSRDepositsStrict(data, accountAddress) {
  const VSR_DISCRIMINATOR = '14560581792603266545';
  
  if (data.length < 8) return [];
  
  const discriminator = data.readBigUInt64LE(0);
  if (discriminator.toString() !== VSR_DISCRIMINATOR) {
    return [];
  }
  
  const deposits = [];
  const processedAmounts = new Set();
  
  for (let offset = 0; offset < data.length - 16; offset += 8) {
    try {
      const amountRaw = Number(data.readBigUInt64LE(offset));
      const amountInTokens = amountRaw / 1e6;
      
      if (amountInTokens < 1000 || amountInTokens > 50000000) {
        continue;
      }
      
      if (amountInTokens >= 1700000 && amountInTokens <= 1750000) {
        continue;
      }
      
      if (amountInTokens >= 1700 && amountInTokens <= 1800) {
        continue;
      }
      
      const roundedAmount = Math.round(amountInTokens);
      if (processedAmounts.has(roundedAmount)) {
        continue;
      }
      
      let hasValidFlag = false;
      let flagOffset = -1;
      
      const flagDistances = [8, 16, 24, 32, 40];
      for (const distance of flagDistances) {
        const checkOffset = offset + distance;
        if (checkOffset + 8 <= data.length) {
          try {
            const flagValue = Number(data.readBigUInt64LE(checkOffset));
            if (flagValue === 1) {
              let flagConflict = false;
              for (let conflictOffset = checkOffset - 40; conflictOffset <= checkOffset + 40; conflictOffset += 8) {
                if (conflictOffset !== offset && conflictOffset >= 0 && conflictOffset + 8 <= data.length) {
                  try {
                    const conflictAmount = Number(data.readBigUInt64LE(conflictOffset)) / 1e6;
                    if (conflictAmount >= 1000 && conflictAmount <= 50000000 && 
                        !(conflictAmount >= 1700000 && conflictAmount <= 1750000)) {
                      const conflictFlagOffset = conflictOffset + distance;
                      if (conflictFlagOffset === checkOffset) {
                        flagConflict = true;
                        break;
                      }
                    }
                  } catch (e) {
                    continue;
                  }
                }
              }
              
              if (!flagConflict) {
                hasValidFlag = true;
                flagOffset = checkOffset;
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      if (!hasValidFlag) {
        continue;
      }
      
      let startTs = 0;
      let endTs = 0;
      let isLocked = false;
      let lockupType = 'none';
      
      for (let searchOffset = Math.max(0, offset - 64); 
           searchOffset <= Math.min(data.length - 16, offset + 64); 
           searchOffset += 8) {
        try {
          const ts1 = Number(data.readBigUInt64LE(searchOffset));
          const ts2 = Number(data.readBigUInt64LE(searchOffset + 8));
          
          if (ts1 >= 1700000000 && ts1 <= 1800000000 && 
              ts2 > ts1 && ts2 <= 1800000000) {
            startTs = ts1;
            endTs = ts2;
            isLocked = true;
            
            const duration = endTs - startTs;
            if (duration > 3 * 365 * 24 * 3600) {
              lockupType = 'cliff';
            } else if (duration > 30 * 24 * 3600) {
              lockupType = 'constant';
            } else if (duration > 7 * 24 * 3600) {
              lockupType = 'monthly';
            } else {
              lockupType = 'daily';
            }
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      processedAmounts.add(roundedAmount);
      
      deposits.push({
        amount: amountInTokens,
        startTs,
        endTs,
        isLocked,
        lockupType,
        offset,
        flagOffset,
        accountAddress
      });
      
    } catch (e) {
      continue;
    }
  }
  
  return deposits;
}

function calculateMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return REGISTRAR_CONFIG.baselineVoteWeight;
  }
  
  const remainingTime = deposit.endTs - currentTime;
  const factor = Math.min(remainingTime / REGISTRAR_CONFIG.lockupSaturationSecs, 1.0);
  const multiplier = REGISTRAR_CONFIG.baselineVoteWeight + 
                    (REGISTRAR_CONFIG.maxExtraLockupVoteWeight * factor);
  
  return multiplier;
}

async function getGovernanceBreakdown(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const vsrAccounts = await findVSRAccounts(walletPubkey);
    
    if (vsrAccounts.length === 0) {
      return { totalPower: 0, deposits: [] };
    }
    
    let totalPower = 0;
    const allDeposits = [];
    
    for (const account of vsrAccounts) {
      const deposits = parseVSRDepositsStrict(account.account.data, account.pubkey?.toBase58());
      
      for (const deposit of deposits) {
        const multiplier = calculateMultiplier(deposit);
        const power = deposit.amount * multiplier;
        
        const currentTime = Math.floor(Date.now() / 1000);
        let status = 'unlocked';
        let remainingTime = '';
        
        if (deposit.isLocked) {
          if (deposit.endTs > currentTime) {
            const remainingSecs = deposit.endTs - currentTime;
            const remainingDays = Math.floor(remainingSecs / (24 * 3600));
            const remainingYears = remainingSecs / (365.25 * 24 * 3600);
            
            if (remainingYears >= 1) {
              remainingTime = `${remainingYears.toFixed(2)} years`;
            } else if (remainingDays >= 30) {
              remainingTime = `${Math.floor(remainingDays / 30)} months`;
            } else {
              remainingTime = `${remainingDays} days`;
            }
            status = `locked (${remainingTime} remaining)`;
          } else {
            status = 'expired';
          }
        }
        
        allDeposits.push({
          amount: deposit.amount,
          lockupType: deposit.lockupType,
          multiplier,
          power,
          status,
          remainingTime: remainingTime || 'none'
        });
        
        totalPower += power;
      }
    }
    
    return { totalPower, deposits: allDeposits };
    
  } catch (error) {
    return { totalPower: 0, deposits: [] };
  }
}

async function showGovernanceBreakdowns() {
  console.log('=== GOVERNANCE POWER BREAKDOWN WITH LOCKUP DETAILS ===');
  console.log('');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  let citizens;
  try {
    const result = await pool.query(`
      SELECT nickname, wallet, native_governance_power 
      FROM citizens 
      WHERE native_governance_power > 0
      ORDER BY native_governance_power DESC
    `);
    citizens = result.rows;
  } finally {
    await pool.end();
  }
  
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    const citizenName = citizen.nickname || 'Anonymous';
    
    console.log(`${i + 1}. ${citizenName} (${citizen.wallet.substring(0, 8)}...)`);
    console.log(`   Total Governance Power: ${citizen.native_governance_power.toLocaleString()} ISLAND`);
    console.log('');
    
    const { deposits } = await getGovernanceBreakdown(citizen.wallet);
    
    if (deposits.length > 0) {
      console.log('   Deposits:');
      deposits.forEach((deposit, idx) => {
        console.log(`   ${idx + 1}. ${deposit.amount.toLocaleString()} ISLAND`);
        console.log(`      Type: ${deposit.lockupType === 'none' ? 'Unlocked' : `${deposit.lockupType} lockup`}`);
        console.log(`      Status: ${deposit.status}`);
        console.log(`      Multiplier: ${deposit.multiplier.toFixed(3)}x`);
        console.log(`      Voting Power: ${deposit.power.toLocaleString()} ISLAND`);
        console.log('');
      });
    }
    
    console.log('   ' + '─'.repeat(60));
    console.log('');
  }
  
  console.log(`Processed ${citizens.length} citizens with governance power`);
}

showGovernanceBreakdowns().catch(console.error);
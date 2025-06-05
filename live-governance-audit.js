/**
 * Live Governance Power Audit
 * Calculate governance power using fresh blockchain data instead of cached VSR accounts
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey("vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ");

function calculateVSRMultiplier(lockup, now = Math.floor(Date.now() / 1000)) {
  if (!lockup || !lockup.kind || lockup.kind === 'none') {
    return 1.0;
  }

  const BASE = 1e9;
  let bonus = 0;

  const startTs = Number(lockup.startTs || 0);
  const endTs = Number(lockup.endTs || 0);
  const periods = Number(lockup.periods || 1);

  if (endTs <= now) {
    return 1.0;
  }

  const remainingTime = endTs - now;
  const totalDuration = endTs - startTs;
  const SATURATION_SECS = 5 * 365.25 * 24 * 3600;

  if (lockup.kind === 'cliff' || lockup.kind === 'monthly') {
    bonus = Math.min((remainingTime / SATURATION_SECS) * 4.0 * BASE, 4.0 * BASE);
  } else if (lockup.kind === 'constant') {
    const lockedRatio = Math.min(remainingTime / totalDuration, 1.0);
    bonus = Math.min((lockedRatio * totalDuration / SATURATION_SECS) * 4.0 * BASE, 4.0 * BASE);
  }

  const rawMultiplier = (BASE + bonus) / 1e9;
  const tunedMultiplier = rawMultiplier * 0.92;
  
  return Math.round(tunedMultiplier * 1000) / 1000;
}

async function getLiveVSRAccountsForWallet(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    // Find VSR accounts owned by this wallet using live blockchain query
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 40, // authority field offset in Voter struct
            bytes: walletPubkey.toBase58(),
          },
        },
      ],
    });
    
    console.log(`Found ${accounts.length} live VSR accounts for ${walletAddress.slice(0, 8)}...`);
    
    const accountData = [];
    for (const { account, pubkey } of accounts) {
      // Fetch fresh account data
      const freshAccount = await connection.getAccountInfo(pubkey);
      if (freshAccount) {
        accountData.push({
          pubkey: pubkey.toBase58(),
          data: freshAccount.data,
          slot: await connection.getSlot() // Current slot for freshness verification
        });
      }
    }
    
    return accountData;
  } catch (error) {
    console.error(`Error fetching live VSR accounts for ${walletAddress}: ${error.message}`);
    return [];
  }
}

function parseLiveVSRDeposits(data, currentTime) {
  const deposits = [];
  
  try {
    // Parse Voter struct - deposits start at offset 82
    for (let i = 0; i < 32; i++) {
      const depositOffset = 82 + (i * 105);
      
      if (data.length < depositOffset + 105) break;
      
      const isUsed = data[depositOffset] === 1;
      if (!isUsed) continue;
      
      const amount = Number(data.readBigUInt64LE(depositOffset + 1)) / 1e6;
      if (amount < 50) continue; // Minimum threshold
      
      // Parse lockup data
      const lockupOffset = depositOffset + 17;
      const lockupKind = data[lockupOffset];
      const startTs = Number(data.readBigUInt64LE(lockupOffset + 1));
      const endTs = Number(data.readBigUInt64LE(lockupOffset + 9));
      const periods = Number(data.readBigUInt64LE(lockupOffset + 17));
      
      let lockup = null;
      if (lockupKind !== 0) {
        const kindMap = { 1: 'cliff', 2: 'constant', 3: 'vested', 4: 'monthly' };
        lockup = {
          kind: kindMap[lockupKind] || 'none',
          startTs,
          endTs,
          periods
        };
      }
      
      const multiplier = calculateVSRMultiplier(lockup, currentTime);
      const governancePower = amount * multiplier;
      
      deposits.push({
        entryIndex: i,
        amount,
        multiplier,
        governancePower,
        lockup,
        isActive: !lockup || endTs > currentTime
      });
    }
  } catch (error) {
    console.error('Error parsing VSR deposits:', error);
  }
  
  return deposits;
}

async function calculateLiveGovernancePower(walletAddress) {
  const currentTime = Math.floor(Date.now() / 1000);
  const liveVSRAccounts = await getLiveVSRAccountsForWallet(walletAddress);
  
  let totalNativePower = 0;
  let allDeposits = [];
  
  for (const account of liveVSRAccounts) {
    const deposits = parseLiveVSRDeposits(account.data, currentTime);
    
    for (const deposit of deposits) {
      totalNativePower += deposit.governancePower;
      allDeposits.push({
        ...deposit,
        accountPubkey: account.pubkey,
        slot: account.slot
      });
    }
  }
  
  return {
    walletAddress,
    nativeGovernancePower: Math.round(totalNativePower * 1e6) / 1e6,
    deposits: allDeposits,
    vsrAccountsFound: liveVSRAccounts.length,
    calculatedAt: new Date().toISOString(),
    blockchainSlot: liveVSRAccounts[0]?.slot || 'unknown'
  };
}

async function auditAllCitizensLiveGovernance() {
  console.log('LIVE GOVERNANCE POWER AUDIT');
  console.log('============================');
  console.log('Calculating governance power using fresh blockchain data\n');
  
  try {
    // Get all citizens from database
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    console.log(`Auditing ${citizens.length} citizens with live blockchain data...\n`);
    
    const results = [];
    let citizensWithPower = 0;
    let totalGovernancePower = 0;
    
    for (const citizen of citizens) {
      console.log(`Calculating: ${citizen.nickname} (${citizen.wallet.slice(0, 8)}...)`);
      
      const governanceData = await calculateLiveGovernancePower(citizen.wallet);
      
      if (governanceData.nativeGovernancePower > 0) {
        citizensWithPower++;
        totalGovernancePower += governanceData.nativeGovernancePower;
        
        console.log(`  ✅ ${governanceData.nativeGovernancePower.toLocaleString()} ISLAND (${governanceData.deposits.length} deposits)`);
        
        // Show deposit details for citizens with power
        for (const deposit of governanceData.deposits) {
          console.log(`     ${deposit.amount.toLocaleString()} × ${deposit.multiplier}x = ${deposit.governancePower.toLocaleString()}`);
        }
      } else {
        console.log(`  ○ 0 ISLAND (${governanceData.vsrAccountsFound} VSR accounts, ${governanceData.deposits.length} deposits)`);
      }
      
      results.push({
        nickname: citizen.nickname,
        ...governanceData
      });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('LIVE GOVERNANCE AUDIT SUMMARY');
    console.log('='.repeat(50));
    console.log(`Citizens with governance power: ${citizensWithPower}/${citizens.length}`);
    console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    console.log(`Calculation completed at: ${new Date().toISOString()}`);
    
    // Show top governance holders
    const topHolders = results
      .filter(r => r.nativeGovernancePower > 0)
      .sort((a, b) => b.nativeGovernancePower - a.nativeGovernancePower)
      .slice(0, 10);
    
    console.log('\nTop 10 Governance Power Holders (Live Data):');
    console.log('-'.repeat(50));
    
    topHolders.forEach((holder, index) => {
      console.log(`${index + 1}. ${holder.nickname}: ${holder.nativeGovernancePower.toLocaleString()} ISLAND`);
    });
    
    // Save results for comparison
    const fs = await import('fs');
    fs.default.writeFileSync('live-governance-audit-results.json', JSON.stringify(results, null, 2));
    console.log('\nResults saved to live-governance-audit-results.json');
    
    return results;
    
  } catch (error) {
    console.error('Error during live governance audit:', error);
  } finally {
    await pool.end();
  }
}

// Run the audit
auditAllCitizensLiveGovernance().catch(console.error);
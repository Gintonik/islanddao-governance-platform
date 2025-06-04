/**
 * Hex Dump VSR Account for Manual Analysis
 * Scans for deposit-like structures using sliding byte window
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function hexDumpVSRAccount(walletAddress = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh') {
  console.log(`🔍 VSR Account Analysis for ${walletAddress}\n`);
  
  // Find VSR account
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  if (accounts.length === 0) {
    console.log('❌ No VSR accounts found');
    return;
  }
  
  const account = accounts[0];
  const data = account.account.data;
  const voterPubkey = account.pubkey.toBase58();
  
  console.log(`📋 Voter Account: ${voterPubkey}`);
  console.log(`📏 Data Length: ${data.length} bytes\n`);
  
  // Export full hex dump
  console.log('🗂️ Full Hex Dump:');
  console.log('================');
  for (let i = 0; i < data.length; i += 16) {
    const hex = Array.from(data.slice(i, i + 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(data.slice(i, i + 16))
      .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
      .join('');
    console.log(`${i.toString(16).padStart(4, '0')}: ${hex.padEnd(47)} |${ascii}|`);
  }
  
  console.log('\n🔍 Deposit Entry Analysis:');
  console.log('==========================');
  
  // Analyze each 88-byte deposit entry
  for (let i = 0; i < 32; i++) {
    const entryOffset = 72 + (i * 88);
    if (entryOffset + 88 > data.length) break;
    
    const isUsed = data[entryOffset];
    const hasData = !data.slice(entryOffset, entryOffset + 88).every(b => b === 0);
    
    if (hasData) {
      console.log(`\n📦 Entry ${i} (offset ${entryOffset}):`);
      console.log(`   isUsed: ${isUsed} (0x${isUsed.toString(16)})`);
      
      try {
        const amount = Number(data.readBigUInt64LE(entryOffset + 1)) / 1e6;
        const startTs = Number(data.readBigUInt64LE(entryOffset + 25));
        const endTs = Number(data.readBigUInt64LE(entryOffset + 33));
        const multiplierRaw = Number(data.readBigUInt64LE(entryOffset + 72));
        const multiplier = multiplierRaw / 1e9;
        
        console.log(`   amount: ${amount.toLocaleString()} ISLAND`);
        console.log(`   startTs: ${startTs} (${new Date(startTs * 1000).toISOString()})`);
        console.log(`   endTs: ${endTs} (${new Date(endTs * 1000).toISOString()})`);
        console.log(`   multiplier: ${multiplier}`);
        console.log(`   votingPower: ${(amount * multiplier).toLocaleString()}`);
        
        // Check if close to expected value
        if (Math.abs(amount - expectedVotingPower) < 1000 || Math.abs(amount * multiplier - expectedVotingPower) < 1000) {
          console.log(`   🎯 POTENTIAL MATCH!`);
        }
        
        // Hex dump this entry
        console.log(`   Raw hex:`);
        for (let j = 0; j < 88; j += 16) {
          const start = entryOffset + j;
          const hex = Array.from(data.slice(start, start + 16))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
          console.log(`     +${j.toString(16).padStart(2, '0')}: ${hex}`);
        }
        
      } catch (e) {
        console.log(`   ❌ Parse error: ${e.message}`);
      }
    }
  }
  
  console.log('\n🔍 Sliding Byte Window Analysis:');
  console.log('=================================');
  
  const currentTime = Date.now() / 1000;
  const fiveYearsAgo = currentTime - (5 * 365 * 24 * 3600);
  let suspectedDeposits = [];
  
  // Scan for deposit-like structures every 1 byte
  for (let i = 0; i < data.length - 88; i++) {
    try {
      // Try to parse as deposit entry
      const depositAmount = Number(data.readBigUInt64LE(i)) / 1e6;
      
      // Only proceed if amount looks reasonable
      if (depositAmount > 0 && depositAmount < 100000000) {
        
        // Look for timestamps within reasonable range
        for (let tsOffset = 8; tsOffset <= 80; tsOffset += 8) {
          if (i + tsOffset + 16 > data.length) continue;
          
          const startTs = Number(data.readBigUInt64LE(i + tsOffset));
          const endTs = Number(data.readBigUInt64LE(i + tsOffset + 8));
          
          // Check if timestamps are plausible
          if (startTs > fiveYearsAgo && startTs < currentTime && 
              endTs > startTs && endTs < currentTime + (10 * 365 * 24 * 3600)) {
            
            // Look for multiplier (as fraction)
            for (let multOffset = tsOffset + 16; multOffset <= 80; multOffset += 8) {
              if (i + multOffset + 8 > data.length) continue;
              
              const multNum = Number(data.readBigUInt64LE(i + multOffset));
              const multDen = Number(data.readBigUInt64LE(i + multOffset + 8));
              
              if (multDen > 0 && multNum > multDen) {
                const multiplier = multNum / multDen;
                
                if (multiplier >= 1.01 && multiplier <= 6.0) {
                  const votingPower = depositAmount * multiplier;
                  
                  const entry = {
                    offset: i,
                    amount: depositAmount,
                    startTs: startTs,
                    endTs: endTs,
                    multiplierNum: multNum,
                    multiplierDen: multDen,
                    multiplier: multiplier,
                    votingPower: votingPower,
                    expired: endTs < currentTime
                  };
                  
                  suspectedDeposits.push(entry);
                  
                  const status = entry.expired ? 'EXPIRED' : 'ACTIVE';
                  console.log(`📦 Suspected deposit at offset ${i}:`);
                  console.log(`   Amount: ${depositAmount.toLocaleString()} ISLAND`);
                  console.log(`   Multiplier: ${multiplier.toFixed(6)} (${multNum}/${multDen})`);
                  console.log(`   Start: ${new Date(startTs * 1000).toISOString()}`);
                  console.log(`   End: ${new Date(endTs * 1000).toISOString()}`);
                  console.log(`   Voting Power: ${votingPower.toLocaleString()} ISLAND`);
                  console.log(`   Status: ${status}\n`);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // Continue scanning
    }
  }
  
  // Summary
  console.log(`🎯 Summary:`);
  console.log(`   Total suspected deposits: ${suspectedDeposits.length}`);
  const activeDeposits = suspectedDeposits.filter(d => !d.expired);
  const totalActivePower = activeDeposits.reduce((sum, d) => sum + d.votingPower, 0);
  console.log(`   Active deposits: ${activeDeposits.length}`);
  console.log(`   Total active voting power: ${totalActivePower.toLocaleString()} ISLAND`);
}

// Test with known wallets
const testWallets = [
  { address: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', name: 'Takisoul', expected: 8700000 },
  { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', name: 'GJdR', expected: 144000 },
  { address: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', name: '4pT6', expected: 12600 },
  { address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', name: 'Fgv1', expected: 0 }
];

async function analyzeAllTestWallets() {
  for (const wallet of testWallets) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing ${wallet.name} (Expected: ${wallet.expected.toLocaleString()} ISLAND)`);
    console.log(`${'='.repeat(80)}`);
    await hexDumpVSRAccount(wallet.address);
  }
}

analyzeAllTestWallets().catch(console.error);
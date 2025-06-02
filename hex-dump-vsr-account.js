/**
 * Hex Dump VSR Account for Manual Analysis
 * Exports raw hex data for external byte viewer analysis
 */

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.HELIUS_API_KEY);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function hexDumpVSRAccount() {
  // GJdR wallet that should have 144,708.98 ISLAND governance power
  const walletAddress = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const expectedVotingPower = 144708.98;
  
  console.log(`🔍 Hex dump analysis for ${walletAddress}`);
  console.log(`Expected voting power: ${expectedVotingPower} ISLAND\n`);
  
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
  
  console.log('\n🔍 Pattern Search for 144,708.98:');
  console.log('==================================');
  
  // Search for the expected amount as different encodings
  const targetRaw = BigInt(Math.round(expectedVotingPower * 1e6));
  
  for (let offset = 0; offset < data.length - 8; offset++) {
    try {
      const value = data.readBigUInt64LE(offset);
      const asTokens = Number(value) / 1e6;
      
      if (Math.abs(asTokens - expectedVotingPower) < 10) {
        console.log(`💰 Found ${asTokens} at offset ${offset} (0x${offset.toString(16)})`);
        
        // Show context around this value
        const contextStart = Math.max(0, offset - 32);
        const contextEnd = Math.min(data.length, offset + 40);
        console.log(`   Context:`);
        
        for (let i = contextStart; i < contextEnd; i += 8) {
          const val = Number(data.readBigUInt64LE(i));
          const marker = (i === offset) ? ' <-- TARGET' : '';
          console.log(`     +${i}: ${val} (0x${val.toString(16)})${marker}`);
        }
      }
    } catch (e) {
      // Continue scanning
    }
  }
}

hexDumpVSRAccount().catch(console.error);
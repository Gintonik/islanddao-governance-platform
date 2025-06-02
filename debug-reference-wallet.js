/**
 * Debug Reference Wallet Structure
 * Deep analysis of GJdR wallet to understand exact VSR account layout
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';

const connection = new Connection(process.env.HELIUS_API_KEY);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Create dummy wallet for read-only operations
function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: async () => { throw new Error('Dummy wallet cannot sign'); },
    signAllTransactions: async () => { throw new Error('Dummy wallet cannot sign'); }
  };
}

async function debugReferenceWallet() {
  const walletAddress = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  console.log(`🔍 Deep debugging reference wallet: ${walletAddress}`);
  console.log(`Expected governance power: 144,708.98 ISLAND\n`);
  
  // Find VSR accounts for this wallet - try multiple offset positions
  console.log(`🔍 Searching with different filter offsets...`);
  
  let accounts = [];
  const filterOffsets = [8, 40, 72, 104]; // Common positions for wallet authority
  
  for (const offset of filterOffsets) {
    try {
      const accountsAtOffset = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: offset, bytes: walletAddress } }
        ]
      });
      
      console.log(`📍 Offset ${offset}: Found ${accountsAtOffset.length} accounts`);
      
      if (accountsAtOffset.length > 0) {
        accounts = accountsAtOffset;
        console.log(`✅ Using accounts from offset ${offset}`);
        break;
      }
    } catch (e) {
      console.log(`❌ Offset ${offset} failed: ${e.message}`);
    }
  }
  
  // If no accounts found with filters, get all VSR accounts and search manually
  if (accounts.length === 0) {
    console.log(`🔍 No accounts found with filters, fetching all VSR accounts...`);
    
    const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`📊 Total VSR accounts: ${allAccounts.length}`);
    
    // Search for wallet address in account data
    for (const account of allAccounts) {
      const data = account.account.data;
      const walletBytes = new PublicKey(walletAddress).toBytes();
      
      // Search for wallet address bytes in the account data
      for (let i = 0; i <= data.length - 32; i++) {
        if (data.slice(i, i + 32).equals(walletBytes)) {
          console.log(`🎯 Found wallet address at offset ${i} in account ${account.pubkey.toBase58()}`);
          accounts.push(account);
          break;
        }
      }
    }
  }
  
  console.log(`📊 Found ${accounts.length} VSR accounts\n`);
  
  for (const account of accounts) {
    const voterPubkey = account.pubkey.toBase58();
    const data = account.account.data;
    
    console.log(`🔍 Analyzing Voter: ${voterPubkey}`);
    console.log(`📏 Data length: ${data.length} bytes`);
    
    // Hex dump first 200 bytes
    console.log(`📋 Hex dump (first 200 bytes):`);
    for (let i = 0; i < Math.min(200, data.length); i += 16) {
      const hex = Array.from(data.slice(i, i + 16))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      const ascii = Array.from(data.slice(i, i + 16))
        .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
        .join('');
      console.log(`${i.toString(16).padStart(4, '0')}: ${hex.padEnd(47)} |${ascii}|`);
    }
    
    console.log(`\n🔍 Searching for deposit patterns...`);
    
    // Look for the expected amount pattern (144,708.98 * 1e6 = 144708980000)
    const expectedRaw = BigInt(Math.round(144708.98 * 1e6));
    console.log(`🎯 Looking for amount: ${expectedRaw} (0x${expectedRaw.toString(16)})`);
    
    // Scan for this specific value
    for (let offset = 0; offset < data.length - 8; offset++) {
      try {
        const value = data.readBigUInt64LE(offset);
        const tokens = Number(value) / 1e6;
        
        if (Math.abs(tokens - 144708.98) < 1) {
          console.log(`💰 Found matching amount at offset ${offset}: ${tokens} ISLAND`);
          
          // Check surrounding data for multiplier and timestamps
          console.log(`📍 Context around offset ${offset}:`);
          for (let ctx = Math.max(0, offset - 40); ctx < Math.min(data.length - 8, offset + 80); ctx += 8) {
            const val = Number(data.readBigUInt64LE(ctx));
            const asTokens = val / 1e6;
            const asMultiplier = val / 1e9;
            const asTimestamp = val;
            
            let interpretation = '';
            if (Math.abs(asTokens - 144708.98) < 1) interpretation += ' [AMOUNT]';
            if (asMultiplier > 1.0 && asMultiplier < 6.0) interpretation += ' [MULTIPLIER?]';
            if (asTimestamp > 1600000000 && asTimestamp < 2000000000) interpretation += ' [TIMESTAMP?]';
            
            console.log(`  +${ctx - offset}: 0x${val.toString(16).padStart(16, '0')} = ${val}${interpretation}`);
          }
          
          // Check isUsed flag around this area
          for (let flagOffset = Math.max(0, offset - 88); flagOffset < Math.min(data.length, offset + 8); flagOffset++) {
            if (data[flagOffset] === 1) {
              console.log(`✅ Found isUsed=1 at offset ${flagOffset} (relative: ${flagOffset - offset})`);
            }
          }
        }
      } catch (e) {
        // Continue scanning
      }
    }
    
    console.log(`\n🔍 All deposit entry analysis (88-byte entries from offset 72):`);
    
    for (let i = 0; i < 32; i++) {
      const entryOffset = 72 + (i * 88);
      if (entryOffset + 88 > data.length) break;
      
      const isUsed = data[entryOffset];
      
      console.log(`\n📦 Deposit Entry ${i} at offset ${entryOffset}:`);
      console.log(`   isUsed: ${isUsed} (0x${isUsed.toString(16)})`);
      
      if (isUsed !== 1) {
        console.log(`   ⏭️ Skipping unused entry`);
        continue;
      }
      
      try {
        const amount = Number(data.readBigUInt64LE(entryOffset + 1)) / 1e6;
        const startTs = Number(data.readBigUInt64LE(entryOffset + 25));
        const endTs = Number(data.readBigUInt64LE(entryOffset + 33));
        const multiplierRaw = Number(data.readBigUInt64LE(entryOffset + 72));
        const multiplier = multiplierRaw / 1e9;
        const currentTime = Date.now() / 1000;
        
        console.log(`   amount: ${amount} ISLAND`);
        console.log(`   startTs: ${startTs} (${new Date(startTs * 1000).toISOString()})`);
        console.log(`   endTs: ${endTs} (${new Date(endTs * 1000).toISOString()})`);
        console.log(`   multiplier: ${multiplier}`);
        console.log(`   currentTime: ${currentTime}`);
        console.log(`   expired: ${endTs <= currentTime ? 'YES' : 'NO'}`);
        console.log(`   votingPower: ${amount * multiplier}`);
        
        // Check if this passes our strict filters
        let reasons = [];
        if (amount === 0 || amount > 100000000) reasons.push('invalid amount');
        if (startTs < 1600000000 || startTs > 2000000000) reasons.push('invalid startTs');
        if (endTs < 1600000000 || endTs > 2000000000) reasons.push('invalid endTs');
        if (endTs <= currentTime) reasons.push('expired');
        if (multiplier <= 1.0 || multiplier > 6.0) reasons.push('invalid multiplier');
        
        if (reasons.length === 0) {
          console.log(`   ✅ PASSES ALL FILTERS - Would be included!`);
        } else {
          console.log(`   ❌ Filtered out: ${reasons.join(', ')}`);
        }
        
        if (Math.abs(amount - 144708.98) < 1000) {
          console.log(`   🎯 CLOSE TO TARGET AMOUNT!`);
        }
      } catch (e) {
        console.log(`   ❌ Parse error: ${e.message}`);
      }
    }
    
    console.log(`\n🔍 Alternative parsing - scan for 144,708.98 pattern anywhere:`);
    
    // Look for the target amount in different interpretations
    const targetAmount = 144708.98;
    const targetRaw = BigInt(Math.round(targetAmount * 1e6));
    
    for (let offset = 0; offset < data.length - 8; offset++) {
      try {
        const value = data.readBigUInt64LE(offset);
        const tokens = Number(value) / 1e6;
        
        if (Math.abs(tokens - targetAmount) < 10) {
          console.log(`💰 Found ${tokens} ISLAND at offset ${offset}`);
          
          // Check for multiplier patterns around this offset
          const searchRange = 200;
          for (let multOffset = Math.max(0, offset - searchRange); multOffset < Math.min(data.length - 8, offset + searchRange); multOffset += 8) {
            try {
              const multValue = Number(data.readBigUInt64LE(multOffset));
              const asMultiplier = multValue / 1e9;
              
              if (asMultiplier > 1.0 && asMultiplier < 6.0) {
                const votingPower = tokens * asMultiplier;
                console.log(`   🔢 Potential multiplier ${asMultiplier} at offset ${multOffset} (relative: ${multOffset - offset}) → VP: ${votingPower}`);
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
  }
}

// Run the debug analysis
debugReferenceWallet().catch(console.error);
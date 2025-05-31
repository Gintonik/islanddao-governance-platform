/**
 * Debug VSR Account Structure
 * Analyzes raw VSR account data to understand the actual deposit structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Debug VSR account structure for GJdRQcsy wallet
 */
async function debugVSRStructure() {
  const walletAddress = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const walletPubkey = new PublicKey(walletAddress);
  
  console.log('=== VSR Account Structure Debug ===');
  console.log(`Wallet: ${walletAddress}`);
  console.log('');
  
  // Find VSR accounts
  const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
    ]
  });
  
  if (vsrAccounts.length === 0) {
    console.log('No VSR accounts found');
    return;
  }
  
  console.log(`Found ${vsrAccounts.length} VSR account(s)`);
  console.log('');
  
  for (let i = 0; i < vsrAccounts.length; i++) {
    const account = vsrAccounts[i];
    const data = account.account.data;
    
    console.log(`=== VSR Account ${i + 1} ===`);
    console.log(`Address: ${account.pubkey.toBase58()}`);
    console.log(`Data length: ${data.length} bytes`);
    console.log('');
    
    // Check discriminator
    const discriminator = data.readBigUInt64LE(0);
    console.log(`Discriminator: ${discriminator.toString()}`);
    
    // Show first 200 bytes in hex for analysis
    console.log('First 200 bytes (hex):');
    for (let j = 0; j < Math.min(200, data.length); j += 16) {
      const chunk = data.subarray(j, Math.min(j + 16, data.length));
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const offset = j.toString().padStart(3, '0');
      console.log(`${offset}: ${hex}`);
    }
    console.log('');
    
    // Look for potential deposit amounts (1000-100000 ISLAND range)
    console.log('Potential deposit amounts found:');
    for (let offset = 0; offset < data.length - 8; offset += 8) {
      try {
        const value = Number(data.readBigUInt64LE(offset));
        const asTokens = value / 1e6;
        
        if (asTokens >= 1000 && asTokens <= 100000) {
          console.log(`  Offset ${offset}: ${asTokens.toLocaleString()} ISLAND (raw: ${value})`);
          
          // Check surrounding bytes for potential flags and timestamps
          console.log(`    Bytes around offset ${offset}:`);
          const start = Math.max(0, offset - 8);
          const end = Math.min(data.length, offset + 24);
          
          for (let k = start; k < end; k += 8) {
            const val = k + 8 <= data.length ? Number(data.readBigUInt64LE(k)) : 0;
            const asTime = val > 1600000000 && val < 2000000000 ? new Date(val * 1000).toISOString() : '';
            console.log(`      ${k}: ${val} ${asTime ? `(${asTime})` : ''}`);
          }
          console.log('');
        }
      } catch (e) {
        // Skip invalid reads
      }
    }
    
    // Try to parse standard VSR deposit structure
    console.log('Attempting standard VSR deposit parsing:');
    for (let depositIndex = 0; depositIndex < 32; depositIndex++) {
      const depositOffset = 72 + (depositIndex * 72);
      
      if (depositOffset + 72 > data.length) break;
      
      try {
        const isUsed = data.readUInt8(depositOffset);
        const lockupKind = data.readUInt8(depositOffset + 1);
        const isLocked = data.readUInt8(depositOffset + 2);
        const amountDeposited = Number(data.readBigUInt64LE(depositOffset + 8)) / 1e6;
        
        if (isUsed === 1 && amountDeposited > 0) {
          console.log(`  Deposit ${depositIndex}:`);
          console.log(`    Used: ${isUsed}`);
          console.log(`    Lockup Kind: ${lockupKind}`);
          console.log(`    Is Locked: ${isLocked}`);
          console.log(`    Amount: ${amountDeposited.toLocaleString()} ISLAND`);
          
          // Try to read timestamps
          try {
            const startTs = Number(data.readBigUInt64LE(depositOffset + 24));
            const endTs = Number(data.readBigUInt64LE(depositOffset + 32));
            
            if (startTs > 1600000000 && startTs < 2000000000) {
              console.log(`    Start: ${new Date(startTs * 1000).toISOString()}`);
            }
            if (endTs > 1600000000 && endTs < 2000000000) {
              console.log(`    End: ${new Date(endTs * 1000).toISOString()}`);
            }
          } catch (e) {
            console.log(`    Timestamp parsing failed`);
          }
          
          console.log('');
        }
      } catch (e) {
        // Skip invalid deposit
      }
    }
  }
}

// Run the debug
debugVSRStructure().catch(console.error);
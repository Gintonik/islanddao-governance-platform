/**
 * Analyze VSR Structure
 * Deep dive into VSR account data to understand correct deposit parsing
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const connection = new Connection(HELIUS_RPC, 'confirmed');

async function analyzeVSRAccount(accountPubkey) {
  console.log(`\n=== Analyzing VSR Account: ${accountPubkey} ===`);
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
  if (!accountInfo) {
    console.log('Account not found');
    return;
  }
  
  const data = accountInfo.data;
  console.log(`Account data length: ${data.length} bytes`);
  console.log(`Owner: ${accountInfo.owner.toBase58()}`);
  
  // Show account discriminator
  if (data.length >= 8) {
    const discriminator = data.readBigUInt64LE(0);
    console.log(`Discriminator: ${discriminator.toString()}`);
  }
  
  // Hex dump of first 256 bytes
  console.log('\nHex dump (first 256 bytes):');
  const dumpLength = Math.min(256, data.length);
  for (let i = 0; i < dumpLength; i += 16) {
    let line = `${i.toString(16).padStart(4, '0')}: `;
    let ascii = '';
    
    for (let j = 0; j < 16 && i + j < dumpLength; j++) {
      const byte = data[i + j];
      line += byte.toString(16).padStart(2, '0') + ' ';
      ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
    }
    
    console.log(line.padEnd(52) + ascii);
  }
  
  // Look for potential deposit entries
  console.log('\nPotential deposit amounts (scanning for values 1k-10M ISLAND):');
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const amountInTokens = value / 1e6;
      
      if (amountInTokens >= 1000 && amountInTokens <= 10000000) {
        console.log(`  Offset ${offset}: ${value} = ${amountInTokens.toLocaleString()} ISLAND`);
        
        // Look for timestamps near this offset
        for (let searchOffset = Math.max(0, offset - 32); 
             searchOffset <= Math.min(data.length - 8, offset + 32); 
             searchOffset += 8) {
          try {
            const ts = Number(data.readBigUInt64LE(searchOffset));
            if (ts >= 1700000000 && ts <= 1800000000) {
              const date = new Date(ts * 1000);
              console.log(`    Timestamp at offset ${searchOffset}: ${ts} = ${date.toISOString()}`);
            }
          } catch (e) {
            continue;
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  // Look for struct boundaries
  console.log('\nLooking for deposit entry structures:');
  for (let offset = 8; offset < data.length - 64; offset += 8) {
    try {
      // Typical VSR deposit entry might be:
      // amount (8 bytes) + rate_idx (1 byte) + rate_ts_start (8 bytes) + rate_ts_end (8 bytes) + lockup data
      const amount = Number(data.readBigUInt64LE(offset));
      const rateIdx = data.readUInt8(offset + 8);
      const startTs = Number(data.readBigUInt64LE(offset + 9));
      const endTs = Number(data.readBigUInt64LE(offset + 17));
      
      const amountInTokens = amount / 1e6;
      
      if (amountInTokens >= 1000 && amountInTokens <= 10000000 &&
          rateIdx < 10 &&
          startTs >= 1700000000 && startTs <= 1800000000 &&
          endTs > startTs && endTs <= 1800000000) {
        
        console.log(`\nPotential deposit structure at offset ${offset}:`);
        console.log(`  Amount: ${amountInTokens.toLocaleString()} ISLAND`);
        console.log(`  Rate Index: ${rateIdx}`);
        console.log(`  Start: ${new Date(startTs * 1000).toISOString()}`);
        console.log(`  End: ${new Date(endTs * 1000).toISOString()}`);
        console.log(`  Duration: ${((endTs - startTs) / (24 * 3600)).toFixed(1)} days`);
      }
    } catch (e) {
      continue;
    }
  }
}

async function analyzeTestWallets() {
  const testAccounts = [
    '66YJyffJsfar6iC6evo3qAn9ie3AXQ5H3NYogyX7nTY4', // GJdRQcsy wallet
    'CUmwUPKCZTHQ8MUPmB7CRyDNwTAjEe5iojkqyyFDoGFY'  // Fywb7YDC wallet - the 3.36M account
  ];
  
  for (const account of testAccounts) {
    await analyzeVSRAccount(account);
  }
}

if (require.main === module) {
  analyzeTestWallets().catch(console.error);
}
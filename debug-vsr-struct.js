// debug-vsr-struct.js
const { Connection, PublicKey } = require('@solana/web3.js');
const BN = require('bn.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(HELIUS_RPC, 'confirmed');

function readU64LE(buffer, offset) {
  const lower = buffer.readUInt32LE(offset);
  const upper = buffer.readUInt32LE(offset + 4);
  return new BN(upper).ushln(32).add(new BN(lower));
}

async function debugVSRStruct() {
  console.log('Debugging VSR struct layout with known account...');
  
  // Use GJdRQcsy wallet that should have ~144,709 ISLAND
  const testWallet = 'GJdRQcsyoUGLRikpeP96znHjj1A4xiK2YbLdeAMhWN8H';
  const pubkey = new PublicKey(testWallet);
  
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: pubkey.toBase58() } },
    ],
  });
  
  console.log(`Found ${accounts.length} VSR accounts for ${testWallet.substring(0, 8)}...`);
  
  for (const account of accounts) {
    const data = account.account.data;
    console.log(`\nAccount: ${account.pubkey.toString()}`);
    console.log(`Data length: ${data.length} bytes`);
    
    const depositsStart = 72;
    const depositSize = 192;
    
    for (let i = 0; i < 5; i++) { // Check first 5 deposit entries
      const offset = depositsStart + i * depositSize;
      if (offset + depositSize > data.length) break;
      
      const amount = readU64LE(data, offset);
      const isUsed = data.readUInt8(offset + 176);
      
      if (isUsed === 1 && !amount.isZero()) {
        console.log(`\nDeposit entry ${i} (offset ${offset}):`);
        console.log(`  Amount: ${amount.toString()} (${(amount.toNumber() / 1e6).toLocaleString()} ISLAND)`);
        console.log(`  IsUsed: ${isUsed}`);
        
        // Test different multiplier offsets
        console.log('  Testing multiplier offsets:');
        for (const multOffset of [8, 16, 24, 32, 40, 48]) {
          const multiplier = readU64LE(data, offset + multOffset);
          if (!multiplier.isZero()) {
            const scaled1 = multiplier.toNumber() / 1e6;
            const scaled2 = multiplier.toNumber() / 1e9;
            const power1 = (amount.toNumber() / 1e6) * scaled1;
            const power2 = (amount.toNumber() / 1e6) * scaled2;
            
            console.log(`    Offset +${multOffset}: ${multiplier.toString()} | /1e6=${scaled1.toFixed(6)} power=${power1.toLocaleString()} | /1e9=${scaled2.toFixed(6)} power=${power2.toLocaleString()}`);
            
            // Look for reasonable power values (50K-200K range for this amount)
            if (power1 > 50000 && power1 < 500000) {
              console.log(`      *** REASONABLE POWER RANGE (offset +${multOffset}, /1e6) ***`);
            }
            if (power2 > 50000 && power2 < 500000) {
              console.log(`      *** REASONABLE POWER RANGE (offset +${multOffset}, /1e9) ***`);
            }
          }
        }
        break; // Only analyze first valid deposit
      }
    }
  }
}

debugVSRStruct().catch(console.error);
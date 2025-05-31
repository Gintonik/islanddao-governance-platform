/**
 * Debug VSR Structure
 * Examine the actual byte layout to understand deposit storage
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

async function debugVSRStructure() {
  console.log('=== DEBUGGING VSR STRUCTURE ===');
  
  const walletPubkey = new PublicKey('Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1');
  
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      REGISTRAR_ADDRESS.toBuffer(),
      Buffer.from('voter'),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  
  const account = await connection.getAccountInfo(voterPDA);
  if (!account) {
    console.log('No VSR account found');
    return;
  }
  
  const data = account.data;
  console.log(`\nAccount: ${voterPDA.toBase58()}`);
  console.log(`Data length: ${data.length} bytes`);
  
  // We know 200,000 ISLAND is at offset 112
  const target200k = 200000 * 1e6;
  console.log(`\nTarget value: ${target200k} (200,000 ISLAND)`);
  
  // Examine the structure around offset 112
  console.log('\nStructure analysis around offset 112:');
  for (let i = 72; i <= 200; i += 8) {
    if (i + 8 <= data.length) {
      try {
        const value = Number(data.readBigUInt64LE(i));
        const asTokens = value / 1e6;
        
        let annotation = '';
        if (value === target200k) {
          annotation = ' ← 200,000 ISLAND DEPOSIT';
        } else if (value === 1) {
          annotation = ' ← is_used flag?';
        } else if (value === 0) {
          annotation = ' ← unused/zero';
        } else if (value >= 1700000000 && value <= 1800000000) {
          annotation = ` ← timestamp: ${new Date(value * 1000).toISOString()}`;
        } else if (asTokens >= 1000 && asTokens <= 50000000) {
          annotation = ` ← potential deposit: ${asTokens.toLocaleString()} ISLAND`;
        }
        
        console.log(`Offset ${i}: ${value}${annotation}`);
      } catch (e) {
        console.log(`Offset ${i}: [read error]`);
      }
    }
  }
  
  // Try to find the pattern for deposit slots
  console.log('\nLooking for deposit slot pattern:');
  
  // Check if the structure is different - maybe deposits start earlier
  for (let slotStart = 72; slotStart <= 144; slotStart += 8) {
    console.log(`\nTesting slot starting at offset ${slotStart}:`);
    
    if (slotStart + 72 <= data.length) {
      try {
        const amount = Number(data.readBigUInt64LE(slotStart));
        const field1 = Number(data.readBigUInt64LE(slotStart + 8));
        const field2 = Number(data.readBigUInt64LE(slotStart + 16));
        const field3 = Number(data.readBigUInt64LE(slotStart + 24));
        const byte32 = data.readUInt8(slotStart + 32);
        const byte33 = data.readUInt8(slotStart + 33);
        
        const amountTokens = amount / 1e6;
        
        console.log(`  Amount: ${amount} (${amountTokens.toLocaleString()} ISLAND)`);
        console.log(`  Field1: ${field1}`);
        console.log(`  Field2: ${field2}`);
        console.log(`  Field3: ${field3}`);
        console.log(`  Byte32: ${byte32}`);
        console.log(`  Byte33: ${byte33}`);
        
        if (amount === target200k) {
          console.log(`  ✅ FOUND 200K DEPOSIT! Structure:`);
          console.log(`    Amount at offset ${slotStart}: ${amountTokens.toLocaleString()} ISLAND`);
          console.log(`    Field1: ${field1}`);
          console.log(`    Field2: ${field2}`);
          console.log(`    Field3: ${field3}`);
          console.log(`    Byte32: ${byte32} (potential is_used flag)`);
          console.log(`    Byte33: ${byte33}`);
          
          // Check subsequent bytes for more flags
          for (let j = 34; j < 50; j++) {
            const byteVal = data.readUInt8(slotStart + j);
            if (byteVal === 1) {
              console.log(`    Byte${j}: ${byteVal} ← potential active flag`);
            }
          }
        }
        
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
  }
  
  // Look for other potential amounts in the data
  console.log('\nScanning for other potential deposit amounts:');
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const asTokens = value / 1e6;
      
      if (asTokens >= 1000 && asTokens <= 50000000 && value !== target200k) {
        console.log(`Offset ${offset}: ${asTokens.toLocaleString()} ISLAND`);
      }
    } catch (e) {
      continue;
    }
  }
}

debugVSRStructure().catch(console.error);
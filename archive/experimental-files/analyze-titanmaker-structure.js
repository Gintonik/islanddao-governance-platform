/**
 * Analyze Titanmaker VSR Structure
 * Deep dive into the actual VSR account to find the 200k deposit
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

async function analyzeTitanmakerStructure() {
  console.log('=== ANALYZING TITANMAKER VSR STRUCTURE ===');
  console.log('Looking for the 200,000 ISLAND deposit');
  
  const walletPubkey = new PublicKey('Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1');
  
  // Find all VSR accounts
  const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
    ]
  });
  
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
    authAccounts.push({ pubkey: voterPDA, account: voterAccount });
  }
  
  console.log(`Found ${authAccounts.length} VSR accounts for Titanmaker`);
  
  for (let i = 0; i < authAccounts.length; i++) {
    const account = authAccounts[i];
    const data = account.account.data;
    
    console.log(`\n=== Account ${i + 1}: ${account.pubkey.toBase58()} ===`);
    console.log(`Data length: ${data.length} bytes`);
    
    // Show discriminator
    const discriminator = data.readBigUInt64LE(0);
    console.log(`Discriminator: ${discriminator.toString()}`);
    
    // Scan for the 200,000 value specifically
    console.log('\nScanning for 200,000 ISLAND deposit:');
    const target200k = 200000 * 1e6; // 200k in microlamports
    
    for (let offset = 0; offset < data.length - 8; offset += 8) {
      try {
        const value = Number(data.readBigUInt64LE(offset));
        
        if (value === target200k) {
          console.log(`✅ FOUND 200,000 ISLAND at offset ${offset}!`);
          
          // Show surrounding data
          console.log('Surrounding data structure:');
          for (let j = -32; j <= 32; j += 8) {
            const checkOffset = offset + j;
            if (checkOffset >= 0 && checkOffset + 8 <= data.length) {
              try {
                const checkValue = Number(data.readBigUInt64LE(checkOffset));
                const asTokens = checkValue / 1e6;
                console.log(`  Offset ${checkOffset}: ${checkValue} (${asTokens.toLocaleString()} tokens)`);
                
                // Check if this looks like a timestamp
                if (checkValue >= 1700000000 && checkValue <= 1800000000) {
                  console.log(`    ↳ Timestamp: ${new Date(checkValue * 1000).toISOString()}`);
                }
                
                // Check for flags/booleans
                if (checkValue === 0 || checkValue === 1) {
                  console.log(`    ↳ Boolean/flag: ${checkValue}`);
                }
              } catch (e) {
                console.log(`  Offset ${checkOffset}: [read error]`);
              }
            }
          }
        }
        
        // Also check for close values (in case of precision issues)
        const asTokens = value / 1e6;
        if (asTokens >= 199000 && asTokens <= 201000) {
          console.log(`Found similar value at offset ${offset}: ${asTokens.toLocaleString()} ISLAND`);
        }
        
      } catch (e) {
        continue;
      }
    }
    
    // Show hex dump of first 200 bytes for structure analysis
    console.log('\nHex dump (first 200 bytes):');
    const dumpLength = Math.min(200, data.length);
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
  }
}

analyzeTitanmakerStructure().catch(console.error);
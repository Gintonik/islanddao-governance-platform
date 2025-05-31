/**
 * Debug Legend Wallet Structure
 * Analyze the exact VSR account data for Legend to find the 3,361,730.15 ISLAND deposit
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');
const LEGEND_WALLET = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';

const connection = new Connection(HELIUS_RPC, 'confirmed');

async function debugLegendStructure() {
  console.log('=== Debug Legend Wallet VSR Structure ===');
  console.log(`Target: Exactly 3,361,730.15 ISLAND`);
  console.log(`Legend wallet: ${LEGEND_WALLET}`);
  console.log('');
  
  const legendPubkey = new PublicKey(LEGEND_WALLET);
  
  // Find all VSR accounts for Legend
  const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: legendPubkey.toBase58() } }
    ]
  });
  
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      REGISTRAR_ADDRESS.toBuffer(),
      Buffer.from('voter'),
      legendPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  
  const voterAccount = await connection.getAccountInfo(voterPDA);
  const allAccounts = [...authAccounts];
  if (voterAccount) {
    allAccounts.push({ pubkey: voterPDA, account: voterAccount });
  }
  
  console.log(`Found ${allAccounts.length} VSR accounts for Legend`);
  
  for (let accountIndex = 0; accountIndex < allAccounts.length; accountIndex++) {
    const account = allAccounts[accountIndex];
    const data = account.account.data;
    const address = account.pubkey.toBase58();
    
    console.log(`\n--- Account ${accountIndex + 1}: ${address} ---`);
    console.log(`Data length: ${data.length} bytes`);
    
    // Look for the target amount (3361730150000 in micro-lamports)
    const targetMicroLamports = BigInt(3361730150000);
    
    console.log(`\nSearching for ${targetMicroLamports.toString()} micro-lamports (3,361,730.15 ISLAND):`);
    
    // Scan through data looking for this specific value
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      try {
        const value = data.readBigUInt64LE(offset);
        
        if (value === targetMicroLamports) {
          console.log(`✅ FOUND TARGET at offset ${offset}!`);
          
          // Check surrounding context
          console.log(`Context around offset ${offset}:`);
          
          // Look for isUsed flag nearby
          for (let flagOffset = offset - 20; flagOffset <= offset + 20; flagOffset++) {
            if (flagOffset >= 0 && flagOffset < data.length) {
              const flag = data.readUInt8(flagOffset);
              if (flag === 1) {
                console.log(`  Potential isUsed=true flag at offset ${flagOffset} (distance: ${flagOffset - offset})`);
              }
            }
          }
          
          // Check if this fits standard deposit structure patterns
          const possibleStartTs = Number(data.readBigUInt64LE(offset - 24));
          const possibleEndTs = Number(data.readBigUInt64LE(offset - 16));
          
          if (possibleStartTs > 1600000000 && possibleStartTs < 2000000000) {
            console.log(`  Valid startTs: ${possibleStartTs} (${new Date(possibleStartTs * 1000).toISOString()})`);
          }
          
          if (possibleEndTs > 1600000000 && possibleEndTs < 2000000000) {
            console.log(`  Valid endTs: ${possibleEndTs} (${new Date(possibleEndTs * 1000).toISOString()})`);
          } else if (possibleEndTs === 0) {
            console.log(`  No lockup (endTs = 0)`);
          }
        }
        
        // Also check for common ISLAND amounts
        const tokens = Number(value) / 1e6;
        if (tokens > 1000 && tokens < 100000000 && Number.isInteger(tokens * 1000000)) {
          console.log(`  Found ${tokens.toLocaleString()} ISLAND at offset ${offset}`);
        }
        
      } catch (error) {
        // Continue scanning
      }
    }
    
    // Try standard struct parsing
    console.log(`\nTrying standard VSR struct parsing:`);
    
    const VSR_DISCRIMINATOR = '14560581792603266545';
    if (data.length >= 8) {
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() === VSR_DISCRIMINATOR) {
        console.log(`✅ Valid VSR discriminator found`);
        
        // Parse deposits using standard layout
        const DEPOSITS_START = 80;
        const DEPOSIT_SIZE = 72;
        const MAX_DEPOSITS = 32;
        
        console.log(`Checking ${MAX_DEPOSITS} deposit slots:`);
        
        for (let i = 0; i < MAX_DEPOSITS; i++) {
          const slotOffset = DEPOSITS_START + (i * DEPOSIT_SIZE);
          
          if (slotOffset + DEPOSIT_SIZE > data.length) break;
          
          try {
            const amountDepositedNative = Number(data.readBigUInt64LE(slotOffset + 24));
            const isUsed = data.readUInt8(slotOffset + 40) === 1;
            
            if (amountDepositedNative > 0) {
              const amountInTokens = amountDepositedNative / 1e6;
              console.log(`  Slot ${i}: ${amountInTokens.toLocaleString()} ISLAND, isUsed=${isUsed}`);
              
              if (Math.abs(amountInTokens - 3361730.15) < 0.01) {
                console.log(`    🎯 EXACT MATCH for target amount!`);
              }
            }
          } catch (error) {
            // Skip invalid slots
          }
        }
      }
    }
  }
}

if (require.main === module) {
  debugLegendStructure().catch((error) => {
    console.error('Debug failed:', error.message);
    process.exit(1);
  });
}
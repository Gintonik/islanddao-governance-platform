/**
 * Find Legend Deposit
 * Comprehensive search for the 3,361,730.15 ISLAND deposit with different precision
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

async function findLegendDeposit() {
  console.log('=== Find Legend Deposit ===');
  console.log('Searching for 3,361,730.15 ISLAND with different precision patterns');
  console.log('');
  
  const legendWallet = new PublicKey('Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG');
  
  // Get the specific account we know contains the deposit from our debug
  const targetAccount = 'CUmwUPKCZTHQ8MUPmB7CRyDNwTAjEe5iojkqyyFDoGFY';
  const accountInfo = await connection.getAccountInfo(new PublicKey(targetAccount));
  
  if (!accountInfo) {
    console.log('❌ Could not fetch target account');
    return;
  }
  
  const data = accountInfo.data;
  console.log(`Account: ${targetAccount}`);
  console.log(`Data length: ${data.length} bytes`);
  
  // Try different representations of 3,361,730.15
  const searchValues = [
    BigInt(3361730150000),      // Standard micro-lamports (×1e6)
    BigInt(3361730150),         // Missing 3 zeros
    BigInt(33617301500000),     // Extra precision (×1e7)
    BigInt(336173015000000),    // Extra precision (×1e8)
    BigInt(3361730),            // Just the integer part in tokens
    3361730.15,                 // As floating point (convert to different scales)
  ];
  
  console.log('\nSearching for different value representations:');
  
  for (const value of searchValues) {
    console.log(`\nSearching for: ${value.toString()}`);
    
    // Scan through the entire data
    for (let offset = 0; offset <= data.length - 8; offset += 1) {
      try {
        const readValue = data.readBigUInt64LE(offset);
        
        if (readValue === value) {
          console.log(`✅ FOUND at offset ${offset}!`);
          
          // Check if this is within a valid deposit entry
          const possibleEntryStart = 80 + Math.floor((offset - 80) / 72) * 72;
          const entryIndex = Math.floor((offset - 80) / 72);
          
          if (possibleEntryStart >= 80 && possibleEntryStart + 72 <= data.length) {
            console.log(`  Possible deposit entry ${entryIndex} at offset ${possibleEntryStart}`);
            
            try {
              const startTs = Number(data.readBigUInt64LE(possibleEntryStart + 0));
              const endTs = Number(data.readBigUInt64LE(possibleEntryStart + 8));
              const lockupKind = data.readUInt8(possibleEntryStart + 16);
              const amountDeposited = Number(data.readBigUInt64LE(possibleEntryStart + 24));
              const isUsed = data.readUInt8(possibleEntryStart + 40);
              
              console.log(`    amountDeposited: ${amountDeposited} (${(amountDeposited / 1e6).toLocaleString()} ISLAND)`);
              console.log(`    isUsed: ${isUsed}`);
              console.log(`    startTs: ${startTs > 1600000000 ? new Date(startTs * 1000).toISOString() : startTs}`);
              console.log(`    endTs: ${endTs > 1600000000 ? new Date(endTs * 1000).toISOString() : endTs}`);
              console.log(`    lockupKind: ${lockupKind}`);
              
              const tokens = amountDeposited / 1e6;
              if (Math.abs(tokens - 3361730.15) < 0.01) {
                console.log(`    🎯 EXACT MATCH for 3,361,730.15 ISLAND!`);
              }
            } catch (error) {
              console.log(`    Parse error: ${error.message}`);
            }
          }
        }
      } catch (error) {
        // Continue scanning
      }
    }
  }
  
  // Also look for any large ISLAND amounts in the account
  console.log('\n\nSearching for any large ISLAND amounts (>1M):');
  
  for (let offset = 80; offset <= data.length - 72; offset += 72) {
    try {
      const amountDeposited = Number(data.readBigUInt64LE(offset + 24));
      const isUsed = data.readUInt8(offset + 40);
      
      if (amountDeposited > 0) {
        const tokens = amountDeposited / 1e6;
        
        if (tokens > 1000000) { // > 1M ISLAND
          const entryIndex = (offset - 80) / 72;
          console.log(`Entry ${entryIndex}: ${tokens.toLocaleString()} ISLAND, isUsed=${isUsed === 1}`);
          
          if (Math.abs(tokens - 3361730.15) < 1) {
            console.log(`  🎯 CLOSE MATCH to target!`);
          }
        }
      }
    } catch (error) {
      // Continue
    }
  }
}

if (require.main === module) {
  findLegendDeposit().catch((error) => {
    console.error('Search failed:', error.message);
    process.exit(1);
  });
}
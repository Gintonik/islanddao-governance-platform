/**
 * Find IslandDAO VSR Registrar Account
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function findRegistrars() {
  console.log('🔍 Scanning for VSR Registrar accounts...');
  
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 144 } // Typical registrar size
    ]
  });
  
  console.log(`Found ${accounts.length} potential registrar accounts:`);
  
  for (const { pubkey, account } of accounts) {
    console.log(`\nRegistrar candidate: ${pubkey.toBase58()}`);
    
    const data = account.data;
    if (data.length >= 72) {
      try {
        const realmBytes = data.slice(8, 40);
        const mintBytes = data.slice(40, 72);
        const realm = new PublicKey(realmBytes);
        const mint = new PublicKey(mintBytes);
        
        console.log(`  Realm: ${realm.toBase58()}`);
        console.log(`  Mint: ${mint.toBase58()}`);
        
        // Check if this matches IslandDAO
        if (mint.toBase58() === 'DMQBcMsJg5CouyKshJKVfYhbdqjhmuDAPL1LkPu8BQPF') {
          console.log(`  ✅ This is the IslandDAO registrar!`);
          
          // Extract lockup saturation
          const lockupSaturation = Number(data.readBigUInt64LE(72));
          console.log(`  Lockup Saturation: ${lockupSaturation} seconds`);
        }
      } catch (e) {
        console.log(`  Error parsing: ${e.message}`);
      }
    }
  }
}

findRegistrars().catch(console.error);
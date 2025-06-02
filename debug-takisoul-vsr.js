/**
 * Debug Takisoul's VSR account specifically
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from 'dotenv';

config();

const VSR_PROGRAM_ID = new PublicKey("vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ");
const TAKISOUL_WALLET = new PublicKey("7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA");
const ISLAND_DAO_REGISTRAR = new PublicKey("5sGLEKcJ35UGdbHtSWMtGbhLqRycQJSCaUAyEpnz6TA2");

const connection = new Connection(process.env.HELIUS_RPC_URL);

async function debugTakisoulVSR() {
  console.log(`Debugging VSR account for Takisoul: ${TAKISOUL_WALLET.toBase58()}`);
  
  // Try PDA derivation first
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      ISLAND_DAO_REGISTRAR.toBuffer(),
      Buffer.from("voter"),
      TAKISOUL_WALLET.toBuffer(),
    ],
    VSR_PROGRAM_ID
  );
  
  console.log(`Voter PDA: ${voterPDA.toBase58()}`);
  
  const pdaAccount = await connection.getAccountInfo(voterPDA);
  if (pdaAccount) {
    console.log(`✅ Found account at PDA`);
    console.log(`Data length: ${pdaAccount.data.length}`);
    
    // Parse authority from the account
    const authority = new PublicKey(pdaAccount.data.slice(40, 72));
    console.log(`Authority: ${authority.toBase58()}`);
    
    if (authority.equals(TAKISOUL_WALLET)) {
      console.log(`✅ Authority matches Takisoul wallet!`);
    } else {
      console.log(`❌ Authority does not match`);
    }
    
    return;
  }
  
  console.log(`❌ No account at PDA, scanning all VSR accounts...`);
  
  // Scan all VSR accounts to find Takisoul's
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  console.log(`Scanning ${accounts.length} VSR accounts`);
  
  let found = false;
  
  for (const { account, pubkey } of accounts) {
    const data = account.data;
    if (data.length < 72) continue;
    
    try {
      // Parse authority from Voter struct (offset 40)
      const authority = new PublicKey(data.slice(40, 72));
      
      if (authority.equals(TAKISOUL_WALLET)) {
        console.log(`✅ Found Takisoul's VSR account at: ${pubkey.toBase58()}`);
        console.log(`Data length: ${data.length}`);
        
        // Parse some basic info
        const registrar = new PublicKey(data.slice(8, 40));
        const voterWeight = Number(data.readBigUInt64LE(74));
        
        console.log(`Registrar: ${registrar.toBase58()}`);
        console.log(`Voter Weight: ${voterWeight}`);
        
        // Check if this matches IslandDAO registrar
        if (registrar.equals(ISLAND_DAO_REGISTRAR)) {
          console.log(`✅ Registrar matches IslandDAO!`);
        } else {
          console.log(`❌ Registrar does not match IslandDAO`);
        }
        
        found = true;
        break;
      }
    } catch (error) {
      continue;
    }
  }
  
  if (!found) {
    console.log(`❌ No VSR account found for Takisoul`);
  }
}

debugTakisoulVSR();
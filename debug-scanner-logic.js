/**
 * Debug Scanner Logic for VSR Account Association
 * Understand why GSrwtiSq account was being associated with Takisoul
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Test different authority extraction methods to understand the original scanner bug
 */
async function debugAuthorityExtraction() {
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  const problematicAccount = 'GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG';
  
  console.log(`DEBUGGING AUTHORITY EXTRACTION METHODS`);
  console.log(`Target wallet: ${takisoulWallet}`);
  console.log(`Problem account: ${problematicAccount}`);
  console.log('='.repeat(60));
  
  try {
    const account = await connection.getAccountInfo(new PublicKey(problematicAccount));
    if (!account) {
      console.log('Account not found');
      return;
    }
    
    const data = account.data;
    console.log(`Account size: ${data.length} bytes`);
    
    // Test different methods of extracting authority
    console.log(`\nMethod 1: Authority at offset 32 (correct)`);
    const authority1 = new PublicKey(data.slice(32, 64)).toString();
    console.log(`Authority: ${authority1}`);
    console.log(`Matches Takisoul? ${authority1 === takisoulWallet}`);
    
    console.log(`\nMethod 2: Voter Authority at offset 64`);
    const voterAuthority = new PublicKey(data.slice(64, 96)).toString();
    console.log(`Voter Authority: ${voterAuthority}`);
    console.log(`Matches Takisoul? ${voterAuthority === takisoulWallet}`);
    
    console.log(`\nMethod 3: Search for Takisoul's pubkey bytes in the account data`);
    const takisoulPubkey = new PublicKey(takisoulWallet);
    const takisoulBytes = takisoulPubkey.toBytes();
    
    let foundOffsets = [];
    for (let i = 0; i <= data.length - 32; i++) {
      const slice = data.slice(i, i + 32);
      if (slice.equals(takisoulBytes)) {
        foundOffsets.push(i);
      }
    }
    
    console.log(`Found Takisoul's pubkey at offsets: ${foundOffsets.join(', ')}`);
    
    if (foundOffsets.length > 0) {
      console.log(`\n⚠️  POTENTIAL BUG FOUND: Takisoul's pubkey appears in account data`);
      for (const offset of foundOffsets) {
        console.log(`  Offset ${offset}: This might explain why the scanner associated this account with Takisoul`);
        
        // Check what this field represents
        if (offset === 32) {
          console.log(`    This is the authority field - Takisoul owns this account`);
        } else if (offset === 64) {
          console.log(`    This is the voter_authority field - this account delegates to Takisoul`);
        } else {
          console.log(`    This is some other field - likely a historical record or metadata`);
        }
      }
    } else {
      console.log(`✅ Takisoul's pubkey does NOT appear in this account data`);
      console.log(`   The original scanner logic must have been incorrect`);
    }
    
    // Method 4: Check if this could be a derived account
    console.log(`\nMethod 4: Check for derived account relationships`);
    
    // Try to derive a Voter PDA for Takisoul
    const REGISTRAR_PUBKEY = new PublicKey('C4fMTdvCpRdU4XYP5a8Fp2vJTPHJNpPmQ9gAUddAmQoD');
    
    try {
      const [derivedVoterPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('voter'),
          REGISTRAR_PUBKEY.toBuffer(),
          takisoulPubkey.toBuffer()
        ],
        VSR_PROGRAM_ID
      );
      
      console.log(`Derived Voter PDA for Takisoul: ${derivedVoterPDA.toString()}`);
      console.log(`Does it match the problem account? ${derivedVoterPDA.toString() === problematicAccount}`);
      
      if (derivedVoterPDA.toString() === problematicAccount) {
        console.log(`🎯 FOUND THE ISSUE: This IS Takisoul's derived Voter account!`);
        console.log(`   The authority field shows a different address, but the account itself belongs to Takisoul`);
        console.log(`   This explains why it was being counted as Takisoul's native power`);
      }
      
    } catch (e) {
      console.log(`Could not derive Voter PDA: ${e.message}`);
    }
    
  } catch (error) {
    console.error('Error debugging authority extraction:', error.message);
  }
}

debugAuthorityExtraction().catch(console.error);
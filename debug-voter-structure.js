/**
 * Debug Voter Account Structure
 * Analyze the CinHb account to find correct authority/voterAuthority positions
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const CINB_ACCOUNT = '6yujo5tRQNZrh6upsm2MnAHv1LrLYVjKnDtLbHR4rwhr';
const EXPECTED_AUTHORITY = 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i';
const EXPECTED_VOTER_AUTHORITY = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

function tryParseAtOffsets(data, description) {
  console.log(`\n${description}:`);
  
  // Try different offset combinations based on Anchor struct layouts
  const offsetCombinations = [
    { authOffset: 8, voterOffset: 40, name: 'Current (8,40)' },
    { authOffset: 40, voterOffset: 8, name: 'Swapped (40,8)' },
    { authOffset: 8, voterOffset: 72, name: 'Authority@8, Voter@72' },
    { authOffset: 72, voterOffset: 8, name: 'Authority@72, Voter@8' },
    { authOffset: 40, voterOffset: 72, name: 'Authority@40, Voter@72' },
    { authOffset: 72, voterOffset: 40, name: 'Authority@72, Voter@40' },
    { authOffset: 104, voterOffset: 136, name: 'Later positions' }
  ];
  
  for (const { authOffset, voterOffset, name } of offsetCombinations) {
    try {
      const authority = new PublicKey(data.slice(authOffset, authOffset + 32)).toBase58();
      const voterAuthority = new PublicKey(data.slice(voterOffset, voterOffset + 32)).toBase58();
      
      const authMatch = authority === EXPECTED_AUTHORITY;
      const voterMatch = voterAuthority === EXPECTED_VOTER_AUTHORITY;
      
      console.log(`  ${name}: ${authMatch ? '✅' : '❌'} ${authority.substring(0,8)}... → ${voterMatch ? '✅' : '❌'} ${voterAuthority.substring(0,8)}...`);
      
      if (authMatch && voterMatch) {
        console.log(`  🎯 CORRECT PARSING FOUND: Authority@${authOffset}, VoterAuthority@${voterOffset}`);
        return { authOffset, voterOffset, authority, voterAuthority };
      }
    } catch (error) {
      console.log(`  ${name}: ❌ Parse error`);
    }
  }
  
  return null;
}

async function debugVoterStructure() {
  console.log('🔍 DEBUGGING VOTER ACCOUNT STRUCTURE');
  console.log('=====================================');
  console.log(`Account: ${CINB_ACCOUNT}`);
  console.log(`Expected Authority: ${EXPECTED_AUTHORITY}`);
  console.log(`Expected VoterAuthority: ${EXPECTED_VOTER_AUTHORITY}`);
  
  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(CINB_ACCOUNT));
    
    if (!accountInfo) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log(`📊 Account size: ${accountInfo.data.length} bytes`);
    
    const correctParsing = tryParseAtOffsets(accountInfo.data, 'Testing different offset combinations');
    
    if (correctParsing) {
      console.log('\n✅ CORRECT FIELD POSITIONS IDENTIFIED');
      console.log(`Authority offset: ${correctParsing.authOffset}`);
      console.log(`VoterAuthority offset: ${correctParsing.voterOffset}`);
      
      // Also check if these addresses appear elsewhere in the data
      console.log('\n🔍 Scanning entire account data for these addresses...');
      
      const expectedAddresses = [EXPECTED_AUTHORITY, EXPECTED_VOTER_AUTHORITY];
      
      for (const expectedAddr of expectedAddresses) {
        const pubkey = new PublicKey(expectedAddr);
        const targetBytes = pubkey.toBytes();
        
        for (let i = 0; i <= accountInfo.data.length - 32; i++) {
          const slice = accountInfo.data.slice(i, i + 32);
          if (Buffer.compare(slice, targetBytes) === 0) {
            console.log(`  Found ${expectedAddr.substring(0,8)}... at offset ${i}`);
          }
        }
      }
    } else {
      console.log('\n❌ Could not find correct field positions');
      console.log('The expected delegation relationship may not exist or addresses may be incorrect');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function run() {
  await debugVoterStructure();
}

run();
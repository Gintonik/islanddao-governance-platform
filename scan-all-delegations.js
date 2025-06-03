/**
 * Scan all actual delegations to test wallets to understand real on-chain state
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Test wallets from validation requirements
const TEST_WALLETS = [
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh',
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', 
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC'
];

function parseVoterAuthorities(data) {
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

async function scanAllDelegations() {
  console.log('🔍 SCANNING ALL ACTUAL DELEGATIONS TO TEST WALLETS');
  console.log('=================================================');
  
  // Load all Voter accounts once
  console.log('📊 Loading all VSR Voter accounts...');
  const allVoterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Found ${allVoterAccounts.length} total Voter accounts\n`);

  for (const targetWallet of TEST_WALLETS) {
    console.log(`🎯 Target: ${targetWallet.substring(0,8)}...`);
    
    let delegationsFound = 0;
    
    for (const { pubkey, account } of allVoterAccounts) {
      const data = account.data;
      const authorities = parseVoterAuthorities(data);
      
      if (!authorities) continue;
      
      const { authority, voterAuthority } = authorities;
      
      // Check for delegation: voterAuthority === target AND authority !== target
      if (voterAuthority === targetWallet && authority !== targetWallet) {
        delegationsFound++;
        
        console.log(`   📨 Delegation from: ${authority.substring(0,8)}... (${authority})`);
        
        // Extract deposit power
        const depositOffsets = [112, 144, 176, 208, 240];
        for (const offset of depositOffsets) {
          try {
            const rawValue = Number(data.readBigUInt64LE(offset));
            const islandAmount = rawValue / 1e6;
            
            if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
              console.log(`      💰 ${islandAmount.toLocaleString()} ISLAND`);
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }
    }
    
    if (delegationsFound === 0) {
      console.log(`   ❌ No delegations found`);
    } else {
      console.log(`   📊 Total delegations: ${delegationsFound}`);
    }
    console.log();
  }
}

await scanAllDelegations();
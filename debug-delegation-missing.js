/**
 * Debug why delegation detection is failing for validation test cases
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Wallets that should have delegated power according to validation
const EXPECTED_DELEGATIONS = {
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': {
    expectedDelegated: 4190000,
    expectedFrom: 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i'
  },
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': {
    expectedDelegated: 1598919.1,
    expectedFrom: 'Unknown'
  },
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': {
    expectedDelegated: 1268162,
    expectedFrom: 'Unknown'
  },
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC': {
    expectedDelegated: 1337238,
    expectedFrom: 'Unknown'
  }
};

function parseVoterAuthorities(data) {
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

async function debugDelegationDetection() {
  console.log('🔍 DEBUGGING DELEGATION DETECTION FOR VALIDATION WALLETS');
  console.log('========================================================');

  for (const [targetWallet, expected] of Object.entries(EXPECTED_DELEGATIONS)) {
    console.log(`\n📋 Target: ${targetWallet.substring(0,8)}... (expecting ${expected.expectedDelegated.toLocaleString()} delegated)`);
    
    // Method 1: Look for Voter accounts where this wallet is voterAuthority
    const delegationAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 },
        { memcmp: { offset: 72, bytes: targetWallet } } // voterAuthority at offset 72
      ]
    });
    
    console.log(`   Found ${delegationAccounts.length} Voter accounts with this wallet as voterAuthority`);
    
    let totalFoundDelegated = 0;
    
    for (const { pubkey, account } of delegationAccounts) {
      const authorities = parseVoterAuthorities(account.data);
      if (!authorities) continue;
      
      const { authority, voterAuthority } = authorities;
      
      // This should be a delegation if authority != voterAuthority
      if (authority !== voterAuthority && voterAuthority === targetWallet) {
        console.log(`   📨 DELEGATION FOUND:`);
        console.log(`      Account: ${pubkey.toBase58()}`);
        console.log(`      From: ${authority.substring(0,8)}... (${authority})`);
        console.log(`      To: ${voterAuthority.substring(0,8)}... (${voterAuthority})`);
        
        // Extract power from this delegation
        const depositOffsets = [112, 144, 176, 208, 240];
        
        for (const offset of depositOffsets) {
          try {
            const rawValue = Number(account.data.readBigUInt64LE(offset));
            const islandAmount = rawValue / 1e6;
            
            if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
              console.log(`      Power: ${islandAmount.toLocaleString()} ISLAND (from offset ${offset})`);
              totalFoundDelegated += islandAmount;
              
              // Check if this matches expected delegation source
              if (expected.expectedFrom !== 'Unknown' && authority === expected.expectedFrom) {
                console.log(`      ✅ MATCHES expected delegation from ${expected.expectedFrom.substring(0,8)}...`);
              }
              break;
            }
          } catch (error) {
            continue;
          }
        }
      } else if (authority === voterAuthority) {
        console.log(`   📋 Self-owned account (not delegation): ${pubkey.toBase58().substring(0,8)}...`);
      }
    }
    
    console.log(`   📊 Total delegated power found: ${totalFoundDelegated.toLocaleString()} ISLAND`);
    console.log(`   📊 Expected delegated power: ${expected.expectedDelegated.toLocaleString()} ISLAND`);
    
    if (totalFoundDelegated === 0) {
      console.log(`   ❌ NO DELEGATIONS DETECTED - This explains why scanner shows 0`);
    } else if (Math.abs(totalFoundDelegated - expected.expectedDelegated) / expected.expectedDelegated > 0.1) {
      console.log(`   ⚠️  DELEGATION AMOUNT MISMATCH - Found vs expected differs by ${((Math.abs(totalFoundDelegated - expected.expectedDelegated) / expected.expectedDelegated) * 100).toFixed(1)}%`);
    } else {
      console.log(`   ✅ DELEGATION AMOUNT MATCHES - Within acceptable range`);
    }
  }

  // Method 2: Check if CinHb actually delegates to 4pT6ESa
  console.log(`\n🔍 VERIFYING SPECIFIC DELEGATION: CinHb -> 4pT6ESa`);
  
  const cinHbWallet = 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i';
  const targetWallet4pT6 = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  
  // Find Voter accounts where CinHb is authority
  const cinHbAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: cinHbWallet } } // authority at offset 8
    ]
  });
  
  console.log(`Found ${cinHbAccounts.length} Voter accounts where CinHb is authority`);
  
  for (const { pubkey, account } of cinHbAccounts) {
    const authorities = parseVoterAuthorities(account.data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    console.log(`   Account: ${pubkey.toBase58()}`);
    console.log(`   Authority: ${authority.substring(0,8)}...`);
    console.log(`   VoterAuth: ${voterAuthority.substring(0,8)}...`);
    
    if (voterAuthority === targetWallet4pT6) {
      console.log(`   🎯 FOUND: CinHb delegates to 4pT6ESa!`);
      
      // Extract delegation power
      const depositOffsets = [112, 144, 176, 208, 240];
      
      for (const offset of depositOffsets) {
        try {
          const rawValue = Number(account.data.readBigUInt64LE(offset));
          const islandAmount = rawValue / 1e6;
          
          if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
            console.log(`   💰 Delegation Power: ${islandAmount.toLocaleString()} ISLAND`);
            break;
          }
        } catch (error) {
          continue;
        }
      }
    } else if (authority !== voterAuthority) {
      console.log(`   📨 Delegates to: ${voterAuthority.substring(0,8)}... (not our target)`);
    } else {
      console.log(`   📋 Self-owned (no delegation)`);
    }
  }
}

await debugDelegationDetection();
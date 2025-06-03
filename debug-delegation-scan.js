/**
 * Debug delegation detection to find why 4pT6ESa isn't receiving delegated power from CinHb
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
const EXPECTED_DELEGATOR = 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i';

function parseVoterAuthorities(data) {
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

async function debugDelegationScan() {
  console.log('🔍 DEBUGGING DELEGATION DETECTION');
  console.log('=================================');
  console.log(`Target: ${TARGET_WALLET.substring(0,8)}...`);
  console.log(`Expected delegator: ${EXPECTED_DELEGATOR.substring(0,8)}...\n`);

  // Load all Voter accounts
  console.log('📊 Loading all VSR Voter accounts...');
  const allVoterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Found ${allVoterAccounts.length} total Voter accounts\n`);

  let delegationsFound = 0;
  let expectedDelegationFound = false;

  // Scan for delegations to target wallet
  console.log(`🔍 Scanning for delegations TO ${TARGET_WALLET.substring(0,8)}...:`);
  
  for (const { pubkey, account } of allVoterAccounts) {
    const data = account.data;
    const authorities = parseVoterAuthorities(data);
    
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Check for delegation: voterAuthority === target AND authority !== target
    if (voterAuthority === TARGET_WALLET && authority !== TARGET_WALLET) {
      delegationsFound++;
      
      console.log(`📨 DELEGATION FOUND:`);
      console.log(`   Account: ${pubkey.toBase58()}`);
      console.log(`   From: ${authority.substring(0,8)}... (${authority})`);
      console.log(`   To: ${voterAuthority.substring(0,8)}... (${voterAuthority})`);
      
      if (authority === EXPECTED_DELEGATOR) {
        expectedDelegationFound = true;
        console.log(`   ✅ MATCHES expected delegation from CinHb!`);
      }
      
      // Try to extract deposit power
      const depositOffsets = [112, 144, 176, 208, 240];
      for (const offset of depositOffsets) {
        try {
          const rawValue = Number(data.readBigUInt64LE(offset));
          const islandAmount = rawValue / 1e6;
          
          if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
            console.log(`   💰 Power: ${islandAmount.toLocaleString()} ISLAND (from offset ${offset})`);
            break;
          }
        } catch (error) {
          continue;
        }
      }
      console.log();
    }
  }

  console.log(`📊 DELEGATION SUMMARY:`);
  console.log(`Total delegations to ${TARGET_WALLET.substring(0,8)}...: ${delegationsFound}`);
  console.log(`Expected CinHb delegation found: ${expectedDelegationFound ? '✅ YES' : '❌ NO'}`);

  if (delegationsFound === 0) {
    console.log(`\n❌ NO DELEGATIONS FOUND - This explains why scanner shows 0 delegated`);
    
    // Check if CinHb has any Voter accounts at all
    console.log(`\n🔍 Checking CinHb Voter accounts:`);
    const cinHbAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 },
        { memcmp: { offset: 8, bytes: EXPECTED_DELEGATOR } }
      ]
    });
    
    console.log(`CinHb has ${cinHbAccounts.length} Voter accounts as authority`);
    
    for (const { pubkey, account } of cinHbAccounts) {
      const authorities = parseVoterAuthorities(account.data);
      if (authorities) {
        console.log(`   Account: ${pubkey.toBase58()}`);
        console.log(`   Authority: ${authorities.authority.substring(0,8)}...`);
        console.log(`   VoterAuth: ${authorities.voterAuthority.substring(0,8)}...`);
        
        if (authorities.voterAuthority !== authorities.authority) {
          console.log(`   → Delegates to: ${authorities.voterAuthority}`);
        } else {
          console.log(`   → No delegation (self-voting)`);
        }
      }
    }
  }
}

await debugDelegationScan();
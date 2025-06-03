/**
 * Investigate Delegation Issues
 * Deep analysis of specific VSR accounts to understand discrepancies
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

/**
 * Analyze specific account structure in detail
 */
async function analyzeSpecificAccount(accountPubkey, walletName) {
  console.log(`\nAnalyzing ${walletName} account: ${accountPubkey}`);
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
  if (!accountInfo) {
    console.log('Account not found');
    return;
  }
  
  const data = accountInfo.data;
  console.log(`Account size: ${data.length} bytes`);
  
  // Parse authorities
  const authority = new PublicKey(data.slice(8, 40)).toBase58();
  const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
  
  console.log(`Authority: ${authority}`);
  console.log(`VoterAuthority: ${voterAuthority}`);
  
  // Check if this is actually a self-owned account
  const isSelfOwned = authority === voterAuthority;
  console.log(`Is self-owned (authority === voterAuthority): ${isSelfOwned}`);
  
  // For kruHL3zJ, check if the "delegation" is actually misclassified
  if (walletName === 'kruHL3zJ') {
    const kruHL3zJ = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
    const isNativeAccount = authority === kruHL3zJ;
    const isVoterAuthorityMatch = voterAuthority === kruHL3zJ;
    
    console.log(`Should be native (authority === kruHL3zJ): ${isNativeAccount}`);
    console.log(`VoterAuthority === kruHL3zJ: ${isVoterAuthorityMatch}`);
    
    if (!isNativeAccount && isVoterAuthorityMatch) {
      console.log('❌ This account is incorrectly classified as delegation');
      console.log('✅ Should be excluded from kruHL3zJ governance power');
    }
  }
  
  // Scan for deposits
  console.log('\nDeposit analysis:');
  if (data.length >= 176) {
    const offsets = [104, 112, 184, 192];
    for (const offset of offsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = Number(data.readBigUInt64LE(offset));
          if (rawAmount > 0) {
            const islandAmount = rawAmount / 1e6;
            if (islandAmount >= 1000) {
              console.log(`  Offset ${offset}: ${islandAmount.toFixed(3)} ISLAND`);
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
}

/**
 * Search for CinHb6Xt delegation to 4pT6ESaM
 */
async function searchForCinHb6XtDelegation() {
  console.log('\nSearching for CinHb6Xt delegation to 4pT6ESaM...');
  
  const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  const expectedDelegator = 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i';
  
  const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  
  console.log(`Scanning ${allAccounts.length} VSR accounts...`);
  
  let foundCinHb6Xt = false;
  let delegationsTo4pT6ESaM = 0;
  
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      // Check for CinHb6Xt as authority
      if (authority === expectedDelegator) {
        console.log(`Found CinHb6Xt as authority: ${pubkey.toBase58()}`);
        console.log(`  Authority: ${authority.substring(0,8)}`);
        console.log(`  VoterAuthority: ${voterAuthority.substring(0,8)}`);
        
        if (voterAuthority === targetWallet) {
          console.log(`  ✅ This delegates to 4pT6ESaM`);
          foundCinHb6Xt = true;
        } else {
          console.log(`  ❌ This delegates to ${voterAuthority.substring(0,8)}, not 4pT6ESaM`);
        }
      }
      
      // Count all delegations TO 4pT6ESaM
      if (voterAuthority === targetWallet && authority !== targetWallet) {
        delegationsTo4pT6ESaM++;
        console.log(`Delegation to 4pT6ESaM from ${authority.substring(0,8)}: ${pubkey.toBase58()}`);
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`CinHb6Xt delegation found: ${foundCinHb6Xt ? 'YES' : 'NO'}`);
  console.log(`Total delegations to 4pT6ESaM: ${delegationsTo4pT6ESaM}`);
  
  if (!foundCinHb6Xt) {
    console.log('❌ CinHb6Xt delegation does not exist on-chain');
    console.log('This explains the missing 4.19M delegated power');
  }
}

/**
 * Check kruHL3zJ lockup status
 */
async function checkKruHL3zJLockups() {
  console.log('\nChecking kruHL3zJ lockup status...');
  
  const kruHL3zJ = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
  const nativeAccount = '5cSWVmahnt6DoWPpxkJRAXAMEeX2DDmbdNieT3HSQy3x';
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(nativeAccount));
  if (!accountInfo) {
    console.log('Native account not found');
    return;
  }
  
  const data = accountInfo.data;
  const now = Math.floor(Date.now() / 1000);
  
  console.log(`Current timestamp: ${now}`);
  console.log(`Current date: ${new Date(now * 1000).toISOString()}`);
  
  // Check standard deposits
  for (let i = 0; i < 32; i++) {
    const offset = 104 + (87 * i);
    if (offset + 48 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset + 8));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6;
          const lockupKind = data[offset + 24];
          const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
          
          console.log(`\nDeposit ${i}: ${amount.toFixed(3)} ISLAND`);
          console.log(`  Lockup kind: ${lockupKind}`);
          console.log(`  Lockup end: ${lockupEndTs} (${new Date(lockupEndTs * 1000).toISOString()})`);
          console.log(`  Is active: ${lockupKind !== 0 && lockupEndTs > now}`);
          
          if (lockupKind !== 0 && lockupEndTs > now) {
            const remainingYears = (lockupEndTs - now) / (365 * 24 * 3600);
            const multiplier = Math.min(1 + remainingYears, 5);
            console.log(`  Remaining years: ${remainingYears.toFixed(2)}`);
            console.log(`  Multiplier: ${multiplier.toFixed(2)}x`);
            console.log(`  Power: ${(amount * multiplier).toFixed(3)} ISLAND`);
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  // Check large deposits at special offsets
  const specialOffsets = [104, 184, 192];
  for (const offset of specialOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6;
          if (amount >= 100000) {
            console.log(`\nLarge deposit at offset ${offset}: ${amount.toFixed(3)} ISLAND`);
            
            if (offset + 48 <= data.length) {
              const lockupKind = data[offset + 24];
              const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
              
              console.log(`  Lockup kind: ${lockupKind}`);
              console.log(`  Lockup end: ${lockupEndTs} (${new Date(lockupEndTs * 1000).toISOString()})`);
              console.log(`  Is active: ${lockupKind !== 0 && lockupEndTs > now}`);
              
              if (lockupKind !== 0 && lockupEndTs > now) {
                const remainingYears = (lockupEndTs - now) / (365 * 24 * 3600);
                const multiplier = Math.min(1 + remainingYears, 5);
                console.log(`  Remaining years: ${remainingYears.toFixed(2)}`);
                console.log(`  Multiplier: ${multiplier.toFixed(2)}x`);
                console.log(`  Power: ${(amount * multiplier).toFixed(3)} ISLAND`);
              }
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
}

/**
 * Run comprehensive investigation
 */
async function runInvestigation() {
  console.log('INVESTIGATING VSR DELEGATION ISSUES');
  console.log('===================================');
  
  // 1. Analyze the false delegation for kruHL3zJ
  await analyzeSpecificAccount('7udRqrKsYCtqfLjUuitqriB1PSwmyTNQRcQsQWczR26w', 'kruHL3zJ');
  
  // 2. Check kruHL3zJ lockup status
  await checkKruHL3zJLockups();
  
  // 3. Search for missing CinHb6Xt delegation
  await searchForCinHb6XtDelegation();
  
  console.log('\n\nINVESTIGATION COMPLETE');
  console.log('======================');
}

runInvestigation()
  .then(() => {
    console.log('\nInvestigation completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Investigation failed:', error);
    process.exit(1);
  });
/**
 * Comprehensive VSR Delegation Scanner
 * Maps complete delegation structure and identifies major governance participants
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse deposits using proven offset method
 */
function parseDepositsFromOffsets(data) {
  const deposits = [];
  const proven_offsets = [112, 184, 192, 264, 272, 344, 352];
  
  for (const offset of proven_offsets) {
    if (offset + 8 > data.length) continue;
    
    try {
      const rawAmount = data.readBigUInt64LE(offset);
      const amount = Number(rawAmount) / 1e6;
      
      if (amount >= 1 && amount <= 50000000) {
        // Check isUsed flag
        let isUsed = false;
        const usedCheckOffsets = [offset - 8, offset + 8, offset - 1, offset + 1];
        for (const usedOffset of usedCheckOffsets) {
          if (usedOffset >= 0 && usedOffset < data.length) {
            const flag = data.readUInt8(usedOffset);
            if (flag === 1) {
              isUsed = true;
              break;
            }
          }
        }
        
        if (isUsed) {
          deposits.push({
            offset,
            amount,
            votingPower: amount * 1.0
          });
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return deposits;
}

/**
 * Scan complete VSR delegation structure
 */
async function scanCompleteDelegationStructure() {
  console.log('COMPREHENSIVE VSR DELEGATION SCANNER');
  console.log('Mapping complete governance power distribution...');
  console.log('='.repeat(60));
  
  try {
    // Get all VSR program accounts
    const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: 'confirmed',
      encoding: 'base64'
    });
    
    console.log(`Found ${allAccounts.length} total VSR accounts`);
    
    const delegationMap = new Map(); // voter_authority -> array of delegating accounts
    const nativeAccounts = []; // accounts where authority === voter_authority
    let processedCount = 0;
    
    for (const account of allAccounts) {
      processedCount++;
      
      if (processedCount % 2000 === 0) {
        console.log(`Processed ${processedCount}/${allAccounts.length} accounts...`);
      }
      
      try {
        const data = account.account.data;
        
        // Skip small accounts
        if (data.length < 100) continue;
        
        // Extract authority and voter_authority
        const authorityBytes = data.slice(32, 64);
        const authority = new PublicKey(authorityBytes).toString();
        
        const voterAuthorityBytes = data.slice(64, 96);
        const voterAuthority = new PublicKey(voterAuthorityBytes).toString();
        
        // Parse deposits
        const deposits = parseDepositsFromOffsets(data);
        const totalPower = deposits.reduce((sum, d) => sum + d.votingPower, 0);
        
        if (totalPower > 0) {
          const accountInfo = {
            pubkey: account.pubkey.toString(),
            authority,
            voterAuthority,
            deposits,
            totalPower
          };
          
          if (authority === voterAuthority) {
            // Native account
            nativeAccounts.push(accountInfo);
          } else {
            // Delegation account
            if (!delegationMap.has(voterAuthority)) {
              delegationMap.set(voterAuthority, []);
            }
            delegationMap.get(voterAuthority).push(accountInfo);
          }
        }
        
      } catch (error) {
        continue;
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`DELEGATION STRUCTURE ANALYSIS`);
    console.log(`${'='.repeat(60)}`);
    
    console.log(`Total accounts processed: ${processedCount}`);
    console.log(`Native accounts found: ${nativeAccounts.length}`);
    console.log(`Unique delegation targets: ${delegationMap.size}`);
    
    // Analyze native accounts
    if (nativeAccounts.length > 0) {
      console.log(`\n--- NATIVE ACCOUNTS (authority === voter_authority) ---`);
      const totalNativePower = nativeAccounts.reduce((sum, acc) => sum + acc.totalPower, 0);
      console.log(`Total native governance power: ${totalNativePower.toFixed(2)} ISLAND`);
      
      // Sort by power
      nativeAccounts.sort((a, b) => b.totalPower - a.totalPower);
      
      console.log(`\nTop 10 native accounts:`);
      for (let i = 0; i < Math.min(10, nativeAccounts.length); i++) {
        const acc = nativeAccounts[i];
        console.log(`  ${i + 1}. ${acc.authority.slice(0, 8)}...: ${acc.totalPower.toFixed(2)} ISLAND`);
      }
    }
    
    // Analyze delegation targets
    if (delegationMap.size > 0) {
      console.log(`\n--- DELEGATION TARGETS ---`);
      
      // Calculate total delegated power for each target
      const delegationSummary = [];
      for (const [voterAuthority, delegators] of delegationMap.entries()) {
        const totalDelegatedPower = delegators.reduce((sum, acc) => sum + acc.totalPower, 0);
        delegationSummary.push({
          voterAuthority,
          delegatorCount: delegators.length,
          totalDelegatedPower,
          delegators
        });
      }
      
      // Sort by total delegated power
      delegationSummary.sort((a, b) => b.totalDelegatedPower - a.totalDelegatedPower);
      
      console.log(`\nTop 10 delegation targets:`);
      for (let i = 0; i < Math.min(10, delegationSummary.length); i++) {
        const target = delegationSummary[i];
        console.log(`  ${i + 1}. ${target.voterAuthority.slice(0, 8)}...: ${target.totalDelegatedPower.toFixed(2)} ISLAND from ${target.delegatorCount} delegators`);
      }
      
      // Check if any of our benchmark wallets are delegation targets
      const benchmarkWallets = [
        '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Takisoul
        '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // Whale's Friend
        '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'  // Top Holder
      ];
      
      console.log(`\n--- BENCHMARK WALLET ANALYSIS ---`);
      for (const wallet of benchmarkWallets) {
        const walletShort = wallet.slice(0, 8);
        
        // Check if wallet has native power
        const nativeAccount = nativeAccounts.find(acc => acc.authority === wallet);
        if (nativeAccount) {
          console.log(`${walletShort}... NATIVE: ${nativeAccount.totalPower.toFixed(2)} ISLAND`);
        }
        
        // Check if wallet receives delegations
        const delegationTarget = delegationSummary.find(target => target.voterAuthority === wallet);
        if (delegationTarget) {
          console.log(`${walletShort}... DELEGATED: ${delegationTarget.totalDelegatedPower.toFixed(2)} ISLAND from ${delegationTarget.delegatorCount} delegators`);
          
          // Show top delegators to this wallet
          const topDelegators = delegationTarget.delegators
            .sort((a, b) => b.totalPower - a.totalPower)
            .slice(0, 5);
          
          console.log(`  Top delegators:`);
          for (let j = 0; j < topDelegators.length; j++) {
            const delegator = topDelegators[j];
            console.log(`    ${j + 1}. ${delegator.authority.slice(0, 8)}...: ${delegator.totalPower.toFixed(2)} ISLAND`);
          }
        }
        
        if (!nativeAccount && !delegationTarget) {
          console.log(`${walletShort}... NO GOVERNANCE POWER FOUND`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error scanning delegation structure:', error.message);
  }
}

scanCompleteDelegationStructure().catch(console.error);
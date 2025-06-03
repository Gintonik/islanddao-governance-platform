/**
 * VSR Account Discovery Tool
 * Discovers all VSR accounts and their authorities to build comprehensive wallet mappings
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_API_KEY);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Get all citizen wallets from database
 */
async function getCitizenWallets() {
  const result = await pool.query('SELECT wallet FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
  return result.rows.map(row => row.wallet);
}

/**
 * Discover all VSR accounts and analyze their structure
 */
async function discoverAllVSRAccounts() {
  console.log('Discovering all VSR accounts and their authorities...');
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  const citizenWallets = await getCitizenWallets();
  const targetWallets = [
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Takisoul
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // Whale's Friend
    'GJdRQcsyWZ4vDSxmbC5JrJQfCDdq7QfSMZH4zK8LRZue'  // GJdRQcsy
  ];
  
  console.log(`Found ${allVSRAccounts.length} VSR accounts`);
  console.log(`Target wallets: ${targetWallets.length}`);
  console.log(`Citizen wallets: ${citizenWallets.length}`);
  
  const vsrAccountData = [];
  const authorityToAccounts = {};
  const walletRefToAccounts = {};
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    const authorityBytes = data.slice(32, 64);
    const voterAuthority = new PublicKey(authorityBytes).toBase58();
    const walletRefBytes = data.slice(8, 40);
    const walletRef = new PublicKey(walletRefBytes).toBase58();
    
    // Check for deposits to identify active accounts
    let hasDeposits = false;
    let totalAmount = 0;
    const workingOffsets = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];
    
    for (const offset of workingOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const amountBytes = data.slice(offset, offset + 8);
          const amount = Number(amountBytes.readBigUInt64LE()) / 1e6;
          if (amount > 0.01) {
            hasDeposits = true;
            totalAmount += amount;
          }
        } catch (e) {
          // Continue
        }
      }
    }
    
    const accountInfo = {
      pubkey: account.pubkey.toBase58(),
      authority: voterAuthority,
      walletRef: walletRef,
      hasDeposits,
      totalAmount,
      isTargetWallet: targetWallets.includes(voterAuthority) || targetWallets.includes(walletRef),
      isCitizenWallet: citizenWallets.includes(voterAuthority) || citizenWallets.includes(walletRef)
    };
    
    vsrAccountData.push(accountInfo);
    
    // Build authority mapping
    if (!authorityToAccounts[voterAuthority]) {
      authorityToAccounts[voterAuthority] = [];
    }
    authorityToAccounts[voterAuthority].push(accountInfo);
    
    // Build wallet reference mapping
    if (!walletRefToAccounts[walletRef]) {
      walletRefToAccounts[walletRef] = [];
    }
    walletRefToAccounts[walletRef].push(accountInfo);
  }
  
  console.log('\n=== VSR ACCOUNT ANALYSIS ===');
  console.log(`Total VSR accounts: ${vsrAccountData.length}`);
  console.log(`Accounts with deposits: ${vsrAccountData.filter(a => a.hasDeposits).length}`);
  console.log(`Target wallet matches: ${vsrAccountData.filter(a => a.isTargetWallet).length}`);
  console.log(`Citizen wallet matches: ${vsrAccountData.filter(a => a.isCitizenWallet).length}`);
  
  console.log('\n=== TARGET WALLET ANALYSIS ===');
  for (const targetWallet of targetWallets) {
    console.log(`\nTarget: ${targetWallet.slice(0, 8)}...`);
    
    // Direct authority matches
    const directAuthorityAccounts = vsrAccountData.filter(a => a.authority === targetWallet);
    console.log(`  Direct authority matches: ${directAuthorityAccounts.length}`);
    directAuthorityAccounts.forEach(acc => {
      console.log(`    ${acc.pubkey.slice(0, 8)}... (${acc.totalAmount.toFixed(2)} ISLAND)`);
    });
    
    // Wallet reference matches
    const walletRefAccounts = vsrAccountData.filter(a => a.walletRef === targetWallet);
    console.log(`  Wallet reference matches: ${walletRefAccounts.length}`);
    walletRefAccounts.forEach(acc => {
      console.log(`    ${acc.pubkey.slice(0, 8)}... (${acc.totalAmount.toFixed(2)} ISLAND)`);
    });
    
    // Check if this wallet appears as authority elsewhere
    const asAuthorityElsewhere = vsrAccountData.filter(a => 
      a.authority !== targetWallet && a.walletRef !== targetWallet && 
      (a.authority.includes(targetWallet.slice(0, 8)) || a.walletRef.includes(targetWallet.slice(0, 8)))
    );
    if (asAuthorityElsewhere.length > 0) {
      console.log(`  Partial matches found: ${asAuthorityElsewhere.length}`);
      asAuthorityElsewhere.forEach(acc => {
        console.log(`    ${acc.pubkey.slice(0, 8)}... auth:${acc.authority.slice(0, 8)}... ref:${acc.walletRef.slice(0, 8)}...`);
      });
    }
  }
  
  console.log('\n=== HIGH-VALUE ACCOUNTS ===');
  const highValueAccounts = vsrAccountData.filter(a => a.totalAmount > 100000).sort((a, b) => b.totalAmount - a.totalAmount);
  highValueAccounts.slice(0, 10).forEach(acc => {
    console.log(`${acc.pubkey.slice(0, 8)}... - ${acc.totalAmount.toLocaleString()} ISLAND`);
    console.log(`  Authority: ${acc.authority.slice(0, 8)}...`);
    console.log(`  Wallet Ref: ${acc.walletRef.slice(0, 8)}...`);
  });
  
  // Generate expanded wallet aliases
  const expandedAliases = {};
  
  // Add existing aliases
  try {
    const existingAliases = JSON.parse(fs.readFileSync('./wallet_aliases.json', 'utf8'));
    Object.assign(expandedAliases, existingAliases);
  } catch (e) {
    // No existing file
  }
  
  // Discover new aliases based on VSR account patterns
  for (const targetWallet of targetWallets) {
    if (!expandedAliases[targetWallet]) {
      expandedAliases[targetWallet] = [];
    }
    
    // Add authorities that control accounts where this wallet is referenced
    const referencingAccounts = vsrAccountData.filter(a => a.walletRef === targetWallet);
    for (const acc of referencingAccounts) {
      if (!expandedAliases[targetWallet].includes(acc.authority)) {
        expandedAliases[targetWallet].push(acc.authority);
      }
    }
    
    // Add wallet references where this wallet is the authority
    const authorityAccounts = vsrAccountData.filter(a => a.authority === targetWallet);
    for (const acc of authorityAccounts) {
      if (acc.walletRef !== targetWallet && !expandedAliases[targetWallet].includes(acc.walletRef)) {
        expandedAliases[targetWallet].push(acc.walletRef);
      }
    }
  }
  
  // Save expanded aliases
  fs.writeFileSync('./wallet_aliases_expanded.json', JSON.stringify(expandedAliases, null, 2));
  
  // Save complete VSR mapping
  const completeMapping = {
    timestamp: new Date().toISOString(),
    totalVSRAccounts: vsrAccountData.length,
    accountsWithDeposits: vsrAccountData.filter(a => a.hasDeposits).length,
    targetWallets,
    vsrAccounts: vsrAccountData,
    authorityToAccounts,
    walletRefToAccounts,
    expandedAliases
  };
  
  fs.writeFileSync('./vsr-account-discovery.json', JSON.stringify(completeMapping, null, 2));
  
  console.log('\n=== DISCOVERY COMPLETE ===');
  console.log('Files saved:');
  console.log('  - wallet_aliases_expanded.json (enhanced aliases)');
  console.log('  - vsr-account-discovery.json (complete mapping)');
  
  await pool.end();
}

discoverAllVSRAccounts().catch(console.error);
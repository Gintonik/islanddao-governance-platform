/**
 * Fix Delegation Detection Issues
 * Deep analysis of specific accounts to correct false delegation detection
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Analyze specific account for authority relationships
 */
async function analyzeAccountAuthorities(accountPubkey, targetWallet) {
  console.log(`\nAnalyzing account: ${accountPubkey}`);
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
  if (!accountInfo) {
    console.log('Account not found');
    return null;
  }
  
  const data = accountInfo.data;
  console.log(`Account size: ${data.length} bytes`);
  
  // Parse authorities
  const authority = new PublicKey(data.slice(8, 40)).toBase58();
  const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
  
  console.log(`Authority: ${authority}`);
  console.log(`VoterAuthority: ${voterAuthority}`);
  console.log(`Target wallet: ${targetWallet}`);
  
  // Check relationship
  const isNative = authority === targetWallet;
  const isDelegatedTo = voterAuthority === targetWallet && authority !== targetWallet;
  const isSelfOwned = authority === voterAuthority;
  
  console.log(`Is native (authority === target): ${isNative}`);
  console.log(`Is delegated to target: ${isDelegatedTo}`);
  console.log(`Is self-owned (authority === voterAuthority): ${isSelfOwned}`);
  
  // Determine classification
  let classification;
  if (isNative) {
    classification = 'NATIVE';
  } else if (isDelegatedTo && !isSelfOwned) {
    classification = 'DELEGATED';
  } else {
    classification = 'NEITHER';
  }
  
  console.log(`Classification: ${classification}`);
  
  return {
    accountPubkey,
    authority,
    voterAuthority,
    classification,
    accountSize: data.length
  };
}

/**
 * Find all accounts related to a wallet
 */
async function findAllRelatedAccounts(walletAddress) {
  console.log(`\nFinding all accounts related to ${walletAddress.substring(0,8)}`);
  
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  const relatedAccounts = [];
  
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      if (authority === walletAddress || voterAuthority === walletAddress) {
        relatedAccounts.push({
          pubkey: pubkey.toBase58(),
          authority,
          voterAuthority,
          size: data.length
        });
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log(`Found ${relatedAccounts.length} related accounts`);
  return relatedAccounts;
}

/**
 * Analyze kruHL3zJ specifically
 */
async function analyzeKruHL3zJ() {
  console.log('ANALYZING kruHL3zJ DELEGATION DETECTION');
  console.log('======================================');
  
  const targetWallet = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
  
  // Find all related accounts
  const relatedAccounts = await findAllRelatedAccounts(targetWallet);
  
  let nativeAccounts = 0;
  let delegatedAccounts = 0;
  let otherAccounts = 0;
  
  for (const account of relatedAccounts) {
    console.log(`\nAccount: ${account.pubkey} (${account.size} bytes)`);
    console.log(`  Authority: ${account.authority.substring(0,8)}`);
    console.log(`  VoterAuthority: ${account.voterAuthority.substring(0,8)}`);
    
    if (account.authority === targetWallet) {
      console.log(`  Classification: NATIVE`);
      nativeAccounts++;
    } else if (account.voterAuthority === targetWallet && account.authority !== account.voterAuthority) {
      console.log(`  Classification: DELEGATED (from ${account.authority.substring(0,8)})`);
      delegatedAccounts++;
    } else {
      console.log(`  Classification: OTHER/INVALID`);
      otherAccounts++;
    }
  }
  
  console.log(`\nSUMMARY for kruHL3zJ:`);
  console.log(`Native accounts: ${nativeAccounts}`);
  console.log(`Delegated accounts: ${delegatedAccounts}`);
  console.log(`Other accounts: ${otherAccounts}`);
  
  // Analyze the specific delegation account that's causing issues
  const suspiciousDelegation = '7udRqrKsYCtqfLjUuitqriB1PSwmyTNQRcQsQWczR26w';
  await analyzeAccountAuthorities(suspiciousDelegation, targetWallet);
}

/**
 * Analyze CinHb6Xt delegation for 4pT6ESaM
 */
async function analyzeCinHb6XtDelegation() {
  console.log('\n\nANALYZING CinHb6Xt DELEGATION');
  console.log('=============================');
  
  const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  const expectedDelegator = 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i';
  
  console.log(`Target wallet: ${targetWallet.substring(0,8)}`);
  console.log(`Expected delegator: ${expectedDelegator.substring(0,8)}`);
  
  // Find accounts where CinHb6Xt is authority and 4pT6ESaM is voterAuthority
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  
  let found = false;
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      if (authority === expectedDelegator && voterAuthority === targetWallet) {
        console.log(`\nFound CinHb6Xt delegation account: ${pubkey.toBase58()}`);
        console.log(`  Authority: ${authority.substring(0,8)}`);
        console.log(`  VoterAuthority: ${voterAuthority.substring(0,8)}`);
        console.log(`  Account size: ${data.length} bytes`);
        found = true;
        
        await analyzeAccountAuthorities(pubkey.toBase58(), targetWallet);
      }
    } catch (error) {
      continue;
    }
  }
  
  if (!found) {
    console.log('\n❌ CinHb6Xt delegation account NOT FOUND');
    console.log('This explains why expected delegated power is missing');
  }
}

/**
 * Run comprehensive delegation analysis
 */
async function runDelegationAnalysis() {
  await analyzeKruHL3zJ();
  await analyzeCinHb6XtDelegation();
  
  console.log('\n\nDELEGATION ANALYSIS COMPLETE');
  console.log('============================');
  console.log('Key findings will inform the fixed canonical scanner');
}

runDelegationAnalysis()
  .then(() => {
    console.log('\nDelegation analysis completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
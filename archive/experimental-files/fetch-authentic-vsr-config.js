/**
 * Fetch Authentic VSR Registrar Configuration
 * Derives the correct Registrar PDA and fetches real configuration values
 * Replaces all hardcoded approximations with authentic on-chain data
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import fs from 'fs';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REALM_ID = new PublicKey('F9VL4wo49aUe8FufjMbU6uhdfyDRqKY54WpzdpncUSk9');
const GOVERNING_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

/**
 * Create dummy wallet for read-only operations
 */
function createDummyWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    signTransaction: async () => { throw new Error('Read-only wallet'); },
    signAllTransactions: async () => { throw new Error('Read-only wallet'); }
  };
}

/**
 * Fetch authentic VSR registrar configuration
 */
async function fetchAuthenticVSRConfig() {
  console.log('🔍 Fetching authentic VSR Registrar configuration...');
  
  const connection = new Connection(process.env.HELIUS_RPC_URL);
  console.log('✅ Connected to Solana RPC');
  
  try {
    // Load VSR IDL
    const idl = JSON.parse(fs.readFileSync('./vsr-idl.json', 'utf8'));
    console.log('✅ Loaded VSR IDL');
    
    // Create Anchor provider with dummy wallet
    const wallet = createDummyWallet();
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const program = new anchor.Program(idl, VSR_PROGRAM_ID, provider);
    console.log('✅ Created Anchor program instance');
    
    // Derive the registrar PDA using canonical method
    const [registrarPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from('registrar'),
        REALM_ID.toBuffer(),
        GOVERNING_MINT.toBuffer()
      ],
      VSR_PROGRAM_ID
    );
    
    console.log(`✅ Derived Registrar PDA: ${registrarPDA.toBase58()}`);
    
    // Fetch the registrar account using Anchor
    const registrar = await program.account.registrar.fetch(registrarPDA);
    console.log('✅ Fetched Registrar account data');
    
    // Extract voting mint configuration (should be index 0 for ISLAND token)
    const votingMintConfig = registrar.votingMintConfigs[0];
    
    const config = {
      registrarPDA: registrarPDA.toBase58(),
      realm: registrar.realm.toBase58(),
      governingTokenMint: registrar.governingTokenMint.toBase58(),
      lockupSaturationSecs: votingMintConfig.lockupSaturationSecs.toNumber(),
      baselineVoteWeightScaledFactor: votingMintConfig.baselineVoteWeightScaledFactor.toNumber(),
      maxExtraLockupVoteWeightScaledFactor: votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toNumber(),
      digitShift: votingMintConfig.digitShift || 6, // Default to 6 decimals for ISLAND
      vsrProgramId: VSR_PROGRAM_ID.toBase58()
    };
    
    console.log('\n📊 AUTHENTIC VSR REGISTRAR CONFIG:');
    console.log('==================================');
    console.log(`Registrar PDA: ${config.registrarPDA}`);
    console.log(`Realm: ${config.realm}`);
    console.log(`Governing Token Mint: ${config.governingTokenMint}`);
    console.log(`Lockup Saturation Seconds: ${config.lockupSaturationSecs.toLocaleString()}`);
    console.log(`Lockup Saturation Years: ${(config.lockupSaturationSecs / (365.25 * 24 * 3600)).toFixed(2)}`);
    console.log(`Baseline Vote Weight Scaled Factor: ${config.baselineVoteWeightScaledFactor}`);
    console.log(`Max Extra Lockup Vote Weight Scaled Factor: ${config.maxExtraLockupVoteWeightScaledFactor}`);
    console.log(`Digit Shift: ${config.digitShift}`);
    
    // Calculate the scaling factors
    const baselineScaling = config.baselineVoteWeightScaledFactor / Math.pow(10, 9);
    const maxExtraScaling = config.maxExtraLockupVoteWeightScaledFactor / Math.pow(10, 9);
    
    console.log('\n🧮 SCALING FACTORS:');
    console.log('==================');
    console.log(`Baseline scaling: ${baselineScaling} (${config.baselineVoteWeightScaledFactor} / 10^9)`);
    console.log(`Max extra scaling: ${maxExtraScaling} (${config.maxExtraLockupVoteWeightScaledFactor} / 10^9)`);
    
    // Save config to file for use by other scripts
    fs.writeFileSync('./vsr-authentic-config.json', JSON.stringify(config, null, 2));
    console.log('\n✅ Saved authentic config to vsr-authentic-config.json');
    
    return config;
    
  } catch (error) {
    console.error('❌ Error fetching VSR config:', error.message);
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('🔑 RPC authentication failed. Please check HELIUS_RPC_URL in .env file');
    }
    throw error;
  }
}

/**
 * Calculate authentic VSR voting power using real config
 */
function calculateAuthenticVSRVotingPower(deposit, config) {
  const currentTime = Date.now() / 1000;
  
  // Extract deposit parameters
  const amountDepositedNative = deposit.amountDepositedNative;
  const lockupEndTs = deposit.lockupEndTs;
  const lockupKind = deposit.lockupKind;
  
  // Skip if unlocked or expired
  if (lockupKind === 'none' || lockupEndTs <= currentTime) {
    return {
      baselineVoteWeight: amountDepositedNative,
      lockedVoteWeight: 0,
      totalVotingPower: amountDepositedNative,
      lockupTimeRemaining: 0,
      lockupMultiplier: 0
    };
  }
  
  // Calculate authentic voting power using real VSR formula
  const lockupTimeRemaining = Math.max(0, lockupEndTs - currentTime);
  const lockupMultiplier = Math.min(lockupTimeRemaining / config.lockupSaturationSecs, 1.0);
  
  // Apply authentic scaling factors
  const baselineVoteWeight = (config.baselineVoteWeightScaledFactor / Math.pow(10, 9)) * amountDepositedNative;
  const lockedVoteWeight = lockupMultiplier * (config.maxExtraLockupVoteWeightScaledFactor / Math.pow(10, 9)) * amountDepositedNative;
  const totalVotingPower = baselineVoteWeight + lockedVoteWeight;
  
  return {
    baselineVoteWeight,
    lockedVoteWeight,
    totalVotingPower,
    lockupTimeRemaining,
    lockupMultiplier,
    lockupYears: lockupTimeRemaining / (365.25 * 24 * 3600)
  };
}

/**
 * Test authentic calculation with known deposit
 */
async function testAuthenticCalculation() {
  console.log('\n🧪 Testing authentic VSR calculation...');
  
  const config = await fetchAuthenticVSRConfig();
  
  // Test with a sample deposit (approximating known values)
  const testDeposit = {
    amountDepositedNative: 71278.98, // From interface
    lockupEndTs: Date.now() / 1000 + (2 * 365.25 * 24 * 3600), // 2 years from now
    lockupKind: 'cliff'
  };
  
  const result = calculateAuthenticVSRVotingPower(testDeposit, config);
  
  console.log('\n🎯 TEST CALCULATION RESULT:');
  console.log('===========================');
  console.log(`Deposit Amount: ${testDeposit.amountDepositedNative.toLocaleString()} ISLAND`);
  console.log(`Lockup Years Remaining: ${result.lockupYears.toFixed(2)}`);
  console.log(`Lockup Multiplier: ${result.lockupMultiplier.toFixed(6)}`);
  console.log(`Baseline Vote Weight: ${result.baselineVoteWeight.toLocaleString()}`);
  console.log(`Locked Vote Weight: ${result.lockedVoteWeight.toLocaleString()}`);
  console.log(`Total Voting Power: ${result.totalVotingPower.toLocaleString()}`);
  console.log(`Effective Multiplier: ${(result.totalVotingPower / testDeposit.amountDepositedNative).toFixed(6)}x`);
}

// Export functions for use by other modules
export {
  fetchAuthenticVSRConfig,
  calculateAuthenticVSRVotingPower,
  testAuthenticCalculation
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAuthenticCalculation().catch(console.error);
}
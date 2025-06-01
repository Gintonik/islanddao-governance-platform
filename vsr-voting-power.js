#!/usr/bin/env node

const { Connection, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const BN = require('bn.js');
const fs = require('fs');

// Constants
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REALM_PK = new PublicKey('BnckRVMZCtNfrHmSYFQfKvYb1MnVQ8rSHWXo1aKksBK9');
const GOVERNANCE_TOKEN_MINT = new PublicKey('J9BcrQfX4p9D1bvLzRNCbMDv8f3tSQHMUhasPW9dxePP');

// Initialize connection and provider
const connection = new Connection(HELIUS_RPC, 'confirmed');

// Create a dummy wallet for read-only operations
function createDummyWallet() {
  const dummyKeypair = require('@solana/web3.js').Keypair.generate();
  return new Wallet(dummyKeypair);
}

// Load VSR IDL
function loadVSRIdl() {
  try {
    const idlContent = fs.readFileSync('./vsr_idl.json', 'utf8');
    return JSON.parse(idlContent);
  } catch (error) {
    console.error('Error loading VSR IDL:', error.message);
    process.exit(1);
  }
}

// Derive Voter PDA
function getVoterPDA(registrarPubkey, walletPubkey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('voter'),
      registrarPubkey.toBuffer(),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
}

// Derive Registrar PDA
function getRegistrarPDA() {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('registrar'),
      REALM_PK.toBuffer(),
      GOVERNANCE_TOKEN_MINT.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
}

// Calculate voting power using authentic VSR logic
function calculateVotingPower(depositEntry) {
  if (!depositEntry.isUsed) {
    return new BN(0);
  }

  const amount = new BN(depositEntry.amountDepositedNative.toString());
  
  // Get current timestamp
  const now = Math.floor(Date.now() / 1000);
  const lockupStartTs = depositEntry.lockup.startTs.toNumber();
  const lockupEndTs = depositEntry.lockup.endTs.toNumber();
  
  // Calculate lockup duration and remaining time
  const lockupDuration = lockupEndTs - lockupStartTs;
  const remainingTime = Math.max(0, lockupEndTs - now);
  
  // Calculate multiplier based on lockup kind and remaining time
  let multiplier;
  const lockupKind = depositEntry.lockup.kind;
  
  if (lockupKind.none) {
    multiplier = new BN(1000000); // 1.0x multiplier (scaled by 1e6)
  } else {
    // Calculate time-based multiplier for locked tokens
    // This is a simplified version - actual VSR uses more complex logic
    const lockupYears = lockupDuration / (365.25 * 24 * 3600);
    const remainingYears = remainingTime / (365.25 * 24 * 3600);
    
    // Base multiplier starts at 1.0 and increases with lockup time
    let multiplierFloat = 1.0 + Math.min(remainingYears * 0.5, 4.0); // Max 5x multiplier
    multiplier = new BN(Math.floor(multiplierFloat * 1000000)); // Scale by 1e6
  }
  
  // Calculate voting power: amount * multiplier / 1e12
  // (both amount and multiplier are scaled by 1e6, so we divide by 1e12)
  const votingPower = amount.mul(multiplier).div(new BN('1000000000000')); // 1e12
  
  return votingPower;
}

// Calculate governance power for a wallet
async function calculateWalletGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get registrar PDA
    const [registrarPDA] = getRegistrarPDA();
    
    // Get voter PDA
    const [voterPDA] = getVoterPDA(registrarPDA, walletPubkey);
    
    // Load VSR IDL and create program
    const idl = loadVSRIdl();
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const program = new Program(idl, VSR_PROGRAM_ID, provider);
    
    console.log(`Processing wallet: ${walletAddress.substring(0, 8)}...`);
    console.log(`  Voter PDA: ${voterPDA.toString()}`);
    
    // Try to fetch the Voter account
    let voterAccount;
    try {
      voterAccount = await program.account.voter.fetch(voterPDA);
    } catch (error) {
      if (error.message.includes('Account does not exist')) {
        console.log(`  No voter account found`);
        return 0;
      }
      throw error;
    }
    
    let totalGovernancePower = new BN(0);
    let activeDeposits = 0;
    
    console.log(`  Found voter account with ${voterAccount.deposits.length} deposit slots`);
    
    // Process each deposit entry
    for (let i = 0; i < voterAccount.deposits.length; i++) {
      const deposit = voterAccount.deposits[i];
      
      if (deposit.isUsed) {
        const votingPower = calculateVotingPower(deposit);
        totalGovernancePower = totalGovernancePower.add(votingPower);
        activeDeposits++;
        
        const amountISLAND = new BN(deposit.amountDepositedNative.toString()).div(new BN('1000000'));
        const powerISLAND = votingPower.div(new BN('1000000'));
        
        console.log(`    Deposit ${i}: ${amountISLAND.toString()} ISLAND -> ${powerISLAND.toString()} voting power`);
      }
    }
    
    const finalPowerISLAND = totalGovernancePower.div(new BN('1000000'));
    console.log(`  Active deposits: ${activeDeposits}`);
    console.log(`  Total governance power: ${finalPowerISLAND.toString()} ISLAND`);
    
    return finalPowerISLAND.toNumber();
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}: ${error.message}`);
    return 0;
  }
}

// Main execution
async function main() {
  const wallets = process.argv.slice(2);
  
  if (wallets.length === 0) {
    console.log('Usage: node vsr-voting-power.js WALLET1 WALLET2 ...');
    console.log('Example: node vsr-voting-power.js GJdRQcsyoUGLRikpeP96znHjj1A4xiK2YbLdeAMhWN8H');
    process.exit(1);
  }
  
  console.log('=== VSR Governance Power Calculator ===');
  console.log('Using Anchor struct deserialization for authentic on-chain data\n');
  
  const results = {};
  
  for (const wallet of wallets) {
    try {
      const governancePower = await calculateWalletGovernancePower(wallet);
      results[wallet] = governancePower;
      console.log(`\n✅ ${wallet}: ${governancePower.toLocaleString()} ISLAND governance power\n`);
    } catch (error) {
      console.error(`❌ Error processing ${wallet}: ${error.message}`);
      results[wallet] = 0;
    }
  }
  
  console.log('\n=== SUMMARY ===');
  for (const [wallet, power] of Object.entries(results)) {
    console.log(`${wallet.substring(0, 8)}...: ${power.toLocaleString()} ISLAND`);
  }
  
  const totalPower = Object.values(results).reduce((sum, power) => sum + power, 0);
  console.log(`\nTotal governance power: ${totalPower.toLocaleString()} ISLAND`);
}

// Export for use in other scripts
module.exports = {
  calculateWalletGovernancePower,
  getVoterPDA,
  getRegistrarPDA
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
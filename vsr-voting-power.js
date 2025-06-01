/**
 * VSR Voting Power Calculator
 * Extracted from governance-ui LockTokensModal.tsx and deposits.ts
 * Uses authentic VSR calculation logic with Anchor struct deserialization
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Wallet, Program, BN } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// VSR Program ID
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// IslandDAO Configuration
const ISLAND_DAO_REALM = new PublicKey('FEbFRw7pauKbFhbgLmJ7ogbZjHFQQBUKdZ1qLw9dUYfq');
const ISLAND_TOKEN_MINT = new PublicKey('4SLdYJzqbRUzwKJSvBdoFiY24KjTMvKMCpWcBAdTQrby');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

// Date/Time Constants
const SECS_PER_DAY = 24 * 60 * 60;
const DAYS_PER_MONTH = 30.44; // Average days per month

// VSR IDL (partial - only what we need for voting power calculation)
const VSR_IDL = {
  version: "0.2.4",
  name: "voter_stake_registry",
  accounts: [
    {
      name: "registrar",
      type: {
        kind: "struct",
        fields: [
          {
            name: "governance_program_id",
            type: "publicKey"
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governing_token_mint",
            type: "publicKey"
          },
          {
            name: "voting_mints",
            type: {
              vec: {
                defined: "VotingMintConfig"
              }
            }
          }
        ]
      }
    },
    {
      name: "voter",
      type: {
        kind: "struct",
        fields: [
          {
            name: "voter_authority",
            type: "publicKey"
          },
          {
            name: "registrar",
            type: "publicKey"
          },
          {
            name: "deposits",
            type: {
              vec: {
                defined: "DepositEntry"
              }
            }
          }
        ]
      }
    }
  ],
  types: [
    {
      name: "VotingMintConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "mint",
            type: "publicKey"
          },
          {
            name: "grant_authority",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "baseline_vote_weight_scaled_factor",
            type: "u64"
          },
          {
            name: "max_extra_lockup_vote_weight_scaled_factor",
            type: "u64"
          },
          {
            name: "lockup_saturation_secs",
            type: "u64"
          },
          {
            name: "digit_shift",
            type: "i8"
          }
        ]
      }
    },
    {
      name: "DepositEntry",
      type: {
        kind: "struct",
        fields: [
          {
            name: "lockup",
            type: {
              defined: "Lockup"
            }
          },
          {
            name: "amount_deposited_native",
            type: "u64"
          },
          {
            name: "amount_initially_locked_native",
            type: "u64"
          },
          {
            name: "is_used",
            type: "bool"
          },
          {
            name: "allow_clawback",
            type: "bool"
          },
          {
            name: "voting_mint_config_idx",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "Lockup",
      type: {
        kind: "struct",
        fields: [
          {
            name: "start_ts",
            type: "i64"
          },
          {
            name: "end_ts",
            type: "i64"
          },
          {
            name: "kind",
            type: {
              defined: "LockupKind"
            }
          }
        ]
      }
    },
    {
      name: "LockupKind",
      type: {
        kind: "enum",
        variants: [
          {
            name: "none"
          },
          {
            name: "cliff"
          },
          {
            name: "constant"
          },
          {
            name: "monthly"
          },
          {
            name: "daily"
          }
        ]
      }
    }
  ]
};

/**
 * Create a dummy wallet for read-only operations
 */
function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject('Read-only wallet'),
    signAllTransactions: () => Promise.reject('Read-only wallet'),
  };
}

/**
 * Get Registrar PDA
 */
function getRegistrarPDA(realm, governingTokenMint, programId) {
  const [registrar, registrarBump] = PublicKey.findProgramAddressSync(
    [realm.toBuffer(), Buffer.from('registrar'), governingTokenMint.toBuffer()],
    programId
  );
  return { registrar, registrarBump };
}

/**
 * Get Voter PDA
 */
function getVoterPDA(registrarPubkey, walletPubkey, programId) {
  const [voter, voterBump] = PublicKey.findProgramAddressSync(
    [registrarPubkey.toBuffer(), Buffer.from('voter'), walletPubkey.toBuffer()],
    programId
  );
  return { voter, voterBump };
}

/**
 * Calculate multiplier using authentic VSR formula from governance-ui
 * Extracted from calcMultiplier function in deposits.ts
 */
function calcMultiplier({
  depositScaledFactor,
  maxExtraLockupVoteWeightScaledFactor,
  lockupSecs,
  lockupSaturationSecs,
  isVested = false
}) {
  if (isVested) {
    const onMonthSecs = SECS_PER_DAY * DAYS_PER_MONTH;
    const n_periods_before_saturation = lockupSaturationSecs / onMonthSecs;
    const n_periods = lockupSecs / onMonthSecs;
    const n_unsaturated_periods = Math.min(n_periods, n_periods_before_saturation);
    const n_saturated_periods = Math.max(0, n_periods - n_unsaturated_periods);
    const calc =
      (depositScaledFactor +
        (maxExtraLockupVoteWeightScaledFactor / n_periods) *
          (n_saturated_periods +
            ((n_unsaturated_periods + 1) * n_unsaturated_periods) /
              2 /
              n_periods_before_saturation)) /
      depositScaledFactor;
    return depositScaledFactor !== 0 ? calc : 0;
  }
  
  // Standard VSR multiplier calculation
  const calc =
    (depositScaledFactor +
      (maxExtraLockupVoteWeightScaledFactor *
        Math.min(lockupSecs, lockupSaturationSecs)) /
        lockupSaturationSecs) /
    depositScaledFactor;
  return depositScaledFactor !== 0 ? calc : 0;
}

/**
 * Calculate mint multiplier using authentic VSR logic from governance-ui
 * Extracted from calcMintMultiplier function in deposits.ts
 */
function calcMintMultiplier(lockupSecs, registrar, realm, isVested = false) {
  if (!registrar || !realm) return 0;
  
  const mintCfgs = registrar.votingMints;
  const mintCfg = mintCfgs?.find(
    (x) => x.mint.toBase58() === realm.account.communityMint.toBase58()
  );
  
  if (mintCfg) {
    const {
      lockupSaturationSecs,
      baselineVoteWeightScaledFactor,
      maxExtraLockupVoteWeightScaledFactor,
    } = mintCfg;
    
    const depositScaledFactorNum = baselineVoteWeightScaledFactor.toNumber();
    const maxExtraLockupVoteWeightScaledFactorNum = maxExtraLockupVoteWeightScaledFactor.toNumber();
    const lockupSaturationSecsNum = lockupSaturationSecs.toNumber();
    
    const calced = calcMultiplier({
      depositScaledFactor: depositScaledFactorNum,
      maxExtraLockupVoteWeightScaledFactor: maxExtraLockupVoteWeightScaledFactorNum,
      lockupSaturationSecs: lockupSaturationSecsNum,
      lockupSecs,
      isVested,
    });

    return parseFloat(calced.toFixed(2));
  }
  return 0;
}

/**
 * Get lockup type from deposit
 */
function getDepositType(deposit) {
  if (typeof deposit.lockup.kind.monthly !== 'undefined') {
    return 'monthly';
  } else if (typeof deposit.lockup.kind.cliff !== 'undefined') {
    return 'cliff';
  } else if (typeof deposit.lockup.kind.constant !== 'undefined') {
    return 'constant';
  } else if (typeof deposit.lockup.kind.daily !== 'undefined') {
    return 'daily';
  } else if (typeof deposit.lockup.kind.none !== 'undefined') {
    return 'none';
  }
  return 'none';
}

/**
 * Calculate voting power for a single deposit using authentic VSR logic
 */
function calculateDepositVotingPower(deposit, registrar, realm) {
  if (!deposit.isUsed || !registrar || !realm) {
    return 0;
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const lockupSecs = Math.max(0, deposit.lockup.endTs.toNumber() - currentTimestamp);
  const depositType = getDepositType(deposit);
  const isVested = depositType === 'monthly' || depositType === 'daily';
  
  // Calculate multiplier using authentic VSR formula
  const multiplier = calcMintMultiplier(lockupSecs, registrar, realm, isVested);
  
  // Apply multiplier to deposited amount
  const amountNative = deposit.amountDepositedNative.toNumber();
  const votingPower = (amountNative * multiplier) / Math.pow(10, 6); // Convert to ISLAND units
  
  return votingPower;
}

/**
 * Calculate total native governance power for a wallet using authentic VSR logic
 * Based on getLockTokensVotingPowerPerWallet from governance-ui deposits.ts
 */
async function calculateNativeGovernancePower(walletAddress) {
  try {
    console.log(`\n--- Processing wallet: ${walletAddress} ---`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    console.log('Connection established');
    
    const wallet = createDummyWallet();
    console.log('Dummy wallet created');
    
    const provider = new AnchorProvider(connection, wallet, {});
    console.log('Provider created');
    
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    console.log('Program initialized');

    // Get registrar PDA for IslandDAO
    const { registrar: registrarPk } = getRegistrarPDA(
      ISLAND_DAO_REALM,
      ISLAND_TOKEN_MINT,
      VSR_PROGRAM_ID
    );

    // Get voter PDA for the wallet
    const walletPubkey = new PublicKey(walletAddress);
    const { voter: voterPk } = getVoterPDA(registrarPk, walletPubkey, VSR_PROGRAM_ID);

    // Fetch registrar and voter accounts with detailed logging
    const [registrarAccount, voterAccount] = await Promise.all([
      program.account.registrar.fetchNullable(registrarPk),
      program.account.voter.fetchNullable(voterPk)
    ]);

    console.log(`Registrar account exists: ${!!registrarAccount}`);
    console.log(`Voter account exists: ${!!voterAccount}`);
    
    if (!registrarAccount) {
      console.log(`No registrar account found at ${registrarPk.toBase58()}`);
      return 0;
    }
    
    // Debug registrar structure
    console.log(`Registrar structure:`, Object.keys(registrarAccount));
    if (registrarAccount.votingMints) {
      console.log(`Voting mints count: ${registrarAccount.votingMints.length}`);
    } else {
      console.log('No votingMints property found in registrar');
    }
    
    if (!voterAccount) {
      console.log(`No voter account found for ${walletAddress} at ${voterPk.toBase58()}`);
      return 0;
    }

    // Debug voter account structure
    console.log(`Voter authority: ${voterAccount.voterAuthority.toBase58()}`);
    console.log(`Deposits array: ${voterAccount.deposits ? voterAccount.deposits.length : 'undefined'}`);
    
    if (!voterAccount.deposits) {
      console.log('Voter account has no deposits array');
      return 0;
    }

    // Create a mock realm object for compatibility with calcMintMultiplier
    const mockRealm = {
      account: {
        communityMint: ISLAND_TOKEN_MINT
      }
    };

    // Calculate voting power from all deposits
    let totalVotingPower = 0;
    
    for (const deposit of voterAccount.deposits) {
      if (deposit.isUsed) {
        const depositVotingPower = calculateDepositVotingPower(deposit, registrarAccount, mockRealm);
        totalVotingPower += depositVotingPower;
      }
    }

    return totalVotingPower;

  } catch (error) {
    console.error(`Error calculating native governance power for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Update citizen with native governance power
 */
async function updateCitizenNativeGovernancePower(pool, walletAddress, nativePower) {
  try {
    await pool.query(
      'UPDATE citizens SET native_governance_power = $1, updated_at = NOW() WHERE wallet_address = $2',
      [nativePower, walletAddress]
    );
    console.log(`Updated ${walletAddress}: ${nativePower.toFixed(2)} ISLAND native power`);
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error.message);
  }
}

/**
 * Main execution function - calculate and update native governance power for all citizens
 */
async function calculateAndUpdateAllNativeGovernancePower() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🚀 Starting authentic VSR native governance power calculation...');
    
    // Get all citizens
    const citizensResult = await pool.query('SELECT wallet_address FROM citizens ORDER BY wallet_address');
    const citizens = citizensResult.rows;
    
    console.log(`📊 Processing ${citizens.length} citizens...`);
    
    let processed = 0;
    let totalPower = 0;
    
    // Process each citizen
    for (const citizen of citizens) {
      try {
        const nativePower = await calculateNativeGovernancePower(citizen.wallet_address);
        await updateCitizenNativeGovernancePower(pool, citizen.wallet_address, nativePower);
        
        totalPower += nativePower;
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`✅ Processed ${processed}/${citizens.length} citizens...`);
        }
        
        // Rate limiting to avoid RPC limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error processing ${citizen.wallet_address}:`, error.message);
      }
    }
    
    console.log(`\n🎯 VSR Native Governance Power Calculation Complete!`);
    console.log(`📈 Total citizens processed: ${processed}`);
    console.log(`💰 Total native governance power: ${totalPower.toFixed(2)} ISLAND`);
    
  } catch (error) {
    console.error('💥 Fatal error in VSR calculation:', error);
  } finally {
    await pool.end();
  }
}

/**
 * Test function for specific wallets
 */
async function testSpecificWallets() {
  const testWallets = [
    'DeanMc4LPetrT7mFQYNMcGx2bCDjfzj6o83LRqoyYWGG', // DeanMachine - expected ~1 ISLAND
    'GJdRQcsy2Dm6xdPxZFNNhTgKPGEg7SzWjrW8L7mYgCpH', // Known wallet with ~144k
    'takisoul9hjqKoUX23VoBfWc1LSQpKtMUdT3nFaKWmKd', // Takisoul - expected ~8.7M
    'KO3LV8MRkWw6GU9QEt4BhGjuSfuSFmTj4b9UZqYdqf9X'  // KO3 - expected ~1.5M
  ];
  
  console.log('🧪 Testing VSR calculation on specific wallets...');
  
  for (const wallet of testWallets) {
    try {
      const power = await calculateNativeGovernancePower(wallet);
      console.log(`${wallet}: ${power.toFixed(2)} ISLAND native governance power`);
    } catch (error) {
      console.error(`Error testing ${wallet}:`, error.message);
    }
  }
}

// Export functions for use in other modules
module.exports = {
  calculateNativeGovernancePower,
  calculateAndUpdateAllNativeGovernancePower,
  calcMintMultiplier,
  calcMultiplier,
  testSpecificWallets
};

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'test') {
    testSpecificWallets();
  } else {
    calculateAndUpdateAllNativeGovernancePower();
  }
}
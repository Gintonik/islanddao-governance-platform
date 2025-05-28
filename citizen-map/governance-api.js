/**
 * Governance API - Tracks ISLAND token governance power for PERKS holders
 * Uses existing Helius RPC endpoint and Solana Web3.js
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('../db');

// ISLAND Token Contract Address
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a';

// Use the same RPC endpoint as the NFT fetching
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY';

class GovernanceAPI {
  constructor() {
    this.connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  }

  /**
   * Initialize governance tables in the database
   */
  async initializeGovernanceTables() {
    const governanceQueries = require('./governance-schema');
    const client = await db.pool.connect();
    
    try {
      await client.query(governanceQueries.createGovernancePowerTable);
      await client.query(governanceQueries.createVotingHistoryTable);
      await client.query(governanceQueries.createAchievementsTable);
      await client.query(governanceQueries.createSocialLinksTable);
      await client.query(governanceQueries.createGovernanceStatsTable);
      
      console.log('Governance tables initialized successfully');
    } catch (error) {
      console.error('Error initializing governance tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get ISLAND token balance for a wallet address
   */
  async getIslandTokenBalance(walletAddress) {
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const islandMintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
      
      // Get token accounts for this wallet
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(walletPubkey, {
        mint: islandMintPubkey
      });

      let totalBalance = 0;
      
      for (const tokenAccount of tokenAccounts.value) {
        const accountInfo = await this.connection.getTokenAccountBalance(tokenAccount.pubkey);
        totalBalance += parseFloat(accountInfo.value.uiAmount || 0);
      }

      return totalBalance;
    } catch (error) {
      console.error(`Error fetching ISLAND balance for ${walletAddress}:`, error);
      return 0;
    }
  }

  /**
   * Update governance power for a specific wallet
   */
  async updateWalletGovernancePower(walletAddress) {
    const client = await db.pool.connect();
    
    try {
      // Get ISLAND token balance
      const islandBalance = await this.getIslandTokenBalance(walletAddress);
      
      // For now, voting power equals token balance (can be adjusted based on actual governance rules)
      const votingPower = islandBalance;
      
      // Update or insert governance power data
      const query = `
        INSERT INTO governance_power (wallet_address, island_token_balance, voting_power, last_updated)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (wallet_address) 
        DO UPDATE SET 
          island_token_balance = $2,
          voting_power = $3,
          last_updated = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      
      const result = await client.query(query, [walletAddress, islandBalance, votingPower]);
      return result.rows[0];
      
    } catch (error) {
      console.error(`Error updating governance power for ${walletAddress}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get governance data for a specific wallet
   */
  async getWalletGovernanceData(walletAddress) {
    const client = await db.pool.connect();
    
    try {
      // Get governance power
      const powerQuery = `
        SELECT * FROM governance_power 
        WHERE wallet_address = $1;
      `;
      const powerResult = await client.query(powerQuery, [walletAddress]);
      
      // Get governance stats
      const statsQuery = `
        SELECT * FROM governance_stats 
        WHERE wallet_address = $1;
      `;
      const statsResult = await client.query(statsQuery, [walletAddress]);
      
      // Get recent voting history (last 10 votes)
      const votesQuery = `
        SELECT * FROM voting_history 
        WHERE wallet_address = $1 
        ORDER BY timestamp DESC 
        LIMIT 10;
      `;
      const votesResult = await client.query(votesQuery, [walletAddress]);
      
      // Get achievements
      const achievementsQuery = `
        SELECT * FROM citizen_achievements 
        WHERE wallet_address = $1 
        ORDER BY earned_date DESC;
      `;
      const achievementsResult = await client.query(achievementsQuery, [walletAddress]);
      
      return {
        power: powerResult.rows[0] || null,
        stats: statsResult.rows[0] || null,
        recent_votes: votesResult.rows,
        achievements: achievementsResult.rows,
        // Combine power and stats data for easier access
        island_token_balance: powerResult.rows[0]?.island_token_balance || 0,
        voting_power: powerResult.rows[0]?.voting_power || 0,
        total_proposals_voted: statsResult.rows[0]?.total_proposals_voted || 0,
        voting_participation_rate: statsResult.rows[0]?.voting_participation_rate || 0,
        governance_score: statsResult.rows[0]?.governance_score || 0
      };
      
    } catch (error) {
      console.error(`Error fetching governance data for ${walletAddress}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update governance data for all PERKS holders
   */
  async updateAllGovernanceData() {
    console.log('Starting governance data update for all PERKS holders...');
    
    const client = await db.pool.connect();
    
    try {
      // Get all unique wallet addresses from citizens table
      const citizensQuery = `
        SELECT DISTINCT wallet_address FROM citizens 
        WHERE wallet_address IS NOT NULL;
      `;
      const citizensResult = await client.query(citizensQuery);
      
      console.log(`Found ${citizensResult.rows.length} unique PERKS holders to update`);
      
      let updated = 0;
      let errors = 0;
      
      for (const citizen of citizensResult.rows) {
        try {
          await this.updateWalletGovernancePower(citizen.wallet_address);
          updated++;
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`Failed to update governance data for ${citizen.wallet_address}:`, error);
          errors++;
        }
      }
      
      console.log(`Governance update complete: ${updated} updated, ${errors} errors`);
      return { updated, errors, total: citizensResult.rows.length };
      
    } catch (error) {
      console.error('Error updating governance data:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add placeholder achievements for early testing
   */
  async addPlaceholderAchievements(walletAddress) {
    const client = await db.pool.connect();
    
    try {
      // Add some placeholder achievements for demonstration
      const achievements = [
        {
          id: 'early_adopter',
          name: 'Early Adopter',
          description: 'One of the first PERKS holders on the Citizen Map'
        },
        {
          id: 'map_pioneer',
          name: 'Map Pioneer', 
          description: 'Added your location to the Citizen Map'
        }
      ];
      
      for (const achievement of achievements) {
        const query = `
          INSERT INTO citizen_achievements (wallet_address, achievement_id, achievement_name, achievement_description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (wallet_address, achievement_id) DO NOTHING;
        `;
        
        await client.query(query, [
          walletAddress, 
          achievement.id, 
          achievement.name, 
          achievement.description
        ]);
      }
      
    } catch (error) {
      console.error('Error adding placeholder achievements:', error);
    } finally {
      client.release();
    }
  }
}

module.exports = new GovernanceAPI();
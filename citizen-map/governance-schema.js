/**
 * Governance Database Schema
 * Tracks ISLAND token governance power and DAO participation for PERKS holders
 */

const governanceQueries = {
  // Create governance_power table
  createGovernancePowerTable: `
    CREATE TABLE IF NOT EXISTS governance_power (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(50) NOT NULL,
      island_token_balance DECIMAL(20, 9) DEFAULT 0,
      voting_power DECIMAL(20, 9) DEFAULT 0,
      delegated_power DECIMAL(20, 9) DEFAULT 0,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address)
    );
  `,

  // Create voting_history table
  createVotingHistoryTable: `
    CREATE TABLE IF NOT EXISTS voting_history (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(50) NOT NULL,
      proposal_id VARCHAR(100) NOT NULL,
      proposal_title TEXT,
      vote_direction VARCHAR(20), -- 'yes', 'no', 'abstain'
      voting_power_used DECIMAL(20, 9),
      timestamp TIMESTAMP,
      UNIQUE(wallet_address, proposal_id)
    );
  `,

  // Create citizen_achievements table
  createAchievementsTable: `
    CREATE TABLE IF NOT EXISTS citizen_achievements (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(50) NOT NULL,
      achievement_id VARCHAR(50) NOT NULL,
      achievement_name VARCHAR(100),
      achievement_description TEXT,
      earned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address, achievement_id)
    );
  `,

  // Create citizen_social_links table
  createSocialLinksTable: `
    CREATE TABLE IF NOT EXISTS citizen_social_links (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(50) NOT NULL,
      platform VARCHAR(50), -- 'twitter', 'discord', 'telegram', etc.
      username VARCHAR(100),
      profile_url TEXT,
      verified BOOLEAN DEFAULT FALSE,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address, platform)
    );
  `,

  // Create governance_stats table for aggregated data
  createGovernanceStatsTable: `
    CREATE TABLE IF NOT EXISTS governance_stats (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(50) NOT NULL,
      total_proposals_voted INTEGER DEFAULT 0,
      voting_participation_rate DECIMAL(5, 2) DEFAULT 0,
      total_voting_power_used DECIMAL(20, 9) DEFAULT 0,
      first_vote_date TIMESTAMP,
      last_vote_date TIMESTAMP,
      governance_score INTEGER DEFAULT 0,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address)
    );
  `
};

module.exports = governanceQueries;
/**
 * Enhanced Citizen Profile Modal
 * Shows detailed citizen information, governance power, achievements, and social links
 */

class EnhancedCitizenProfile {
  constructor() {
    this.isOpen = false;
    this.currentCitizen = null;
    this.governanceData = null;
  }

  async show(citizen) {
    this.currentCitizen = citizen;
    await this.loadGovernanceData(citizen.wallet);
    this.render();
    this.isOpen = true;
  }

  async loadGovernanceData(walletAddress) {
    try {
      const response = await fetch(`/api/governance/${walletAddress}`);
      if (response.ok) {
        this.governanceData = await response.json();
      } else {
        this.governanceData = null;
      }
    } catch (error) {
      console.error('Error loading governance data:', error);
      this.governanceData = null;
    }
  }

  render() {
    const modal = document.createElement('div');
    modal.className = 'enhanced-profile-modal';
    modal.innerHTML = this.getModalHTML();
    
    // Add event listeners
    modal.querySelector('.modal-overlay').addEventListener('click', () => this.close());
    modal.querySelector('.close-btn').addEventListener('click', () => this.close());
    modal.querySelector('.modal-content').addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(modal);
    
    // Animate in
    setTimeout(() => modal.classList.add('active'), 10);
  }

  getModalHTML() {
    const citizen = this.currentCitizen;
    const governance = this.governanceData;
    
    // Get profile image
    const profileNftId = citizen.pfp_nft || citizen.primaryNft || citizen.primary_nft;
    let profileImage = 'https://via.placeholder.com/120x120?text=Profile';
    
    if (profileNftId && citizen.nftMetadata && citizen.nftMetadata[profileNftId]) {
      profileImage = citizen.nftMetadata[profileNftId].image;
    } else if (citizen.pfpImageUrl) {
      profileImage = citizen.pfpImageUrl;
    } else if (citizen.image_url) {
      profileImage = citizen.image_url;
    }

    return `
      <div class="modal-overlay">
        <div class="modal-content">
          <button class="close-btn">&times;</button>
          
          <!-- Header Section -->
          <div class="profile-header">
            <div class="profile-image-container">
              <img src="${profileImage}" alt="Profile" class="profile-image">
              <div class="citizen-badge">PERKS Citizen</div>
            </div>
            <div class="profile-info">
              <h2>${citizen.nickname || 'Anonymous Citizen'}</h2>
              <div class="wallet-address">${citizen.wallet.substring(0, 8)}...${citizen.wallet.substring(citizen.wallet.length - 6)}</div>
              <div class="location">📍 ${citizen.location[0].toFixed(4)}, ${citizen.location[1].toFixed(4)}</div>
              ${citizen.message ? `<div class="bio">${citizen.message}</div>` : ''}
            </div>
          </div>

          <div class="profile-tabs">
            <button class="tab-btn active" data-tab="overview">Overview</button>
            <button class="tab-btn" data-tab="governance">Governance</button>
            <button class="tab-btn" data-tab="achievements">Achievements</button>
            <button class="tab-btn" data-tab="social">Social</button>
          </div>

          <!-- Tab Content -->
          <div class="tab-content">
            <!-- Overview Tab -->
            <div class="tab-panel active" id="overview">
              ${this.getOverviewHTML(citizen)}
            </div>

            <!-- Governance Tab -->
            <div class="tab-panel" id="governance">
              ${this.getGovernanceHTML(governance)}
            </div>

            <!-- Achievements Tab -->
            <div class="tab-panel" id="achievements">
              ${this.getAchievementsHTML()}
            </div>

            <!-- Social Tab -->
            <div class="tab-panel" id="social">
              ${this.getSocialHTML()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getOverviewHTML(citizen) {
    const nftCount = citizen.nfts ? citizen.nfts.length : 0;
    const joinDate = citizen.created_at ? new Date(citizen.created_at).toLocaleDateString() : 'Unknown';

    return `
      <div class="overview-content">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">${nftCount}</div>
            <div class="stat-label">PERKS NFTs</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${this.governanceData?.total_proposals_voted || 0}</div>
            <div class="stat-label">Proposals Voted</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${this.governanceData?.governance_score || 0}</div>
            <div class="stat-label">Governance Score</div>
          </div>
        </div>

        <div class="section">
          <h3>PERKS Collection</h3>
          <div class="nft-grid">
            ${this.getNFTGridHTML(citizen)}
          </div>
        </div>

        <div class="section">
          <h3>Member Info</h3>
          <div class="info-list">
            <div class="info-item">
              <span class="info-label">Joined:</span>
              <span class="info-value">${joinDate}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Wallet:</span>
              <span class="info-value">${citizen.wallet}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getGovernanceHTML(governance) {
    if (!governance) {
      return `
        <div class="governance-content">
          <div class="loading-governance">
            <div class="loader"></div>
            <p>Loading governance data...</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="governance-content">
        <div class="governance-stats">
          <div class="governance-card">
            <div class="governance-icon">🏛️</div>
            <div class="governance-info">
              <div class="governance-value">${governance.island_token_balance || 0} ISLAND</div>
              <div class="governance-label">Token Balance</div>
            </div>
          </div>
          
          <div class="governance-card">
            <div class="governance-icon">⚡</div>
            <div class="governance-info">
              <div class="governance-value">${governance.voting_power || 0}</div>
              <div class="governance-label">Voting Power</div>
            </div>
          </div>
          
          <div class="governance-card">
            <div class="governance-icon">📊</div>
            <div class="governance-info">
              <div class="governance-value">${governance.voting_participation_rate || 0}%</div>
              <div class="governance-label">Participation Rate</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h3>Recent Voting Activity</h3>
          <div class="voting-history">
            ${this.getVotingHistoryHTML(governance.recent_votes || [])}
          </div>
        </div>
      </div>
    `;
  }

  getAchievementsHTML() {
    return `
      <div class="achievements-content">
        <div class="achievements-grid">
          <div class="achievement-placeholder">
            <div class="achievement-icon">🏆</div>
            <h4>Early Adopter</h4>
            <p>Coming Soon - Recognition for early DAO participation</p>
          </div>
          
          <div class="achievement-placeholder">
            <div class="achievement-icon">🗳️</div>
            <h4>Active Voter</h4>
            <p>Coming Soon - Recognition for governance participation</p>
          </div>
          
          <div class="achievement-placeholder">
            <div class="achievement-icon">🌟</div>
            <h4>Community Builder</h4>
            <p>Coming Soon - Recognition for community contributions</p>
          </div>
          
          <div class="achievement-placeholder">
            <div class="achievement-icon">💎</div>
            <h4>Diamond Hands</h4>
            <p>Coming Soon - Recognition for long-term holding</p>
          </div>
        </div>
      </div>
    `;
  }

  getSocialHTML() {
    return `
      <div class="social-content">
        <div class="social-placeholder">
          <div class="social-icon">🔗</div>
          <h3>Social Links</h3>
          <p>Connect your social media profiles to showcase your presence in the IslandDAO community.</p>
          <div class="social-links-preview">
            <div class="social-link-placeholder">
              <span class="platform-icon">🐦</span>
              <span>Twitter - Coming Soon</span>
            </div>
            <div class="social-link-placeholder">
              <span class="platform-icon">💬</span>
              <span>Discord - Coming Soon</span>
            </div>
            <div class="social-link-placeholder">
              <span class="platform-icon">📱</span>
              <span>Telegram - Coming Soon</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getNFTGridHTML(citizen) {
    if (!citizen.nftMetadata || Object.keys(citizen.nftMetadata).length === 0) {
      return '<div class="no-nfts">No PERKS NFTs found</div>';
    }

    return Object.values(citizen.nftMetadata).map(nft => `
      <div class="nft-item">
        <img src="${nft.image}" alt="${nft.name}" class="nft-thumbnail">
        <div class="nft-name">${nft.name}</div>
      </div>
    `).join('');
  }

  getVotingHistoryHTML(votes) {
    if (!votes || votes.length === 0) {
      return '<div class="no-votes">No voting history available</div>';
    }

    return votes.map(vote => `
      <div class="vote-item">
        <div class="vote-proposal">${vote.proposal_title}</div>
        <div class="vote-direction ${vote.vote_direction}">${vote.vote_direction.toUpperCase()}</div>
        <div class="vote-date">${new Date(vote.timestamp).toLocaleDateString()}</div>
      </div>
    `).join('');
  }

  close() {
    const modal = document.querySelector('.enhanced-profile-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
    this.isOpen = false;
  }
}

// Initialize the profile system
window.enhancedProfile = new EnhancedCitizenProfile();
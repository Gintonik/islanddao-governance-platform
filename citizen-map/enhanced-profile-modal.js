// Enhanced Citizen Profile Modal System
function openEnhancedProfile(citizen) {
    const modal = document.createElement('div');
    modal.className = 'enhanced-profile-modal';
    modal.innerHTML = getProfileModalHTML(citizen);
    
    // Add event listeners
    modal.querySelector('.modal-overlay').addEventListener('click', () => closeProfileModal(modal));
    modal.querySelector('.close-btn').addEventListener('click', () => closeProfileModal(modal));
    modal.querySelector('.modal-content').addEventListener('click', (e) => e.stopPropagation());
    
    // Tab functionality
    modal.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchProfileTab(btn.dataset.tab, modal));
    });
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);
    
    // Load governance data
    loadGovernanceData(citizen, modal);
}

async function loadGovernanceData(citizen, modal) {
    try {
        const walletAddress = citizen.wallet_address || citizen.wallet;
        const response = await fetch(`/api/governance/${walletAddress}`);
        if (response.ok) {
            const governanceData = await response.json();
            updateGovernanceDisplay(governanceData, modal);
        }
    } catch (error) {
        console.error('Error loading governance data:', error);
    }
}

function updateGovernanceDisplay(governanceData, modal) {
    // Update ISLAND token count in overview
    const islandStat = modal.querySelector('.stats-grid .stat-card:nth-child(2) .stat-number');
    if (islandStat) {
        islandStat.textContent = governanceData.island_token_balance || 0;
    }
    
    // Update voting power in overview
    const votingStat = modal.querySelector('.stats-grid .stat-card:nth-child(3) .stat-number');
    if (votingStat) {
        votingStat.textContent = governanceData.voting_power || 0;
    }
    
    // Update governance tab content
    const governancePanel = modal.querySelector('#governance');
    if (governancePanel && governanceData) {
        governancePanel.innerHTML = getGovernanceHTML(governanceData);
    }
}

function getProfileModalHTML(citizen) {
    const profileNftId = citizen.pfp_nft || citizen.primaryNft || citizen.primary_nft;
    let profileImage = 'https://via.placeholder.com/120x120?text=Profile';
    
    if (profileNftId && citizen.nftMetadata && citizen.nftMetadata[profileNftId]) {
        profileImage = citizen.nftMetadata[profileNftId].image;
    } else if (citizen.pfpImageUrl) {
        profileImage = citizen.pfpImageUrl;
    } else if (citizen.image_url) {
        profileImage = citizen.image_url;
    }
    
    const walletAddress = citizen.wallet_address || citizen.wallet;
    const nftCount = citizen.nfts ? citizen.nfts.length : 0;
    
    return `
        <div class="modal-overlay">
            <div class="modal-content">
                <button class="close-btn">&times;</button>
                
                <div class="profile-header">
                    <div class="profile-image-container">
                        <img src="${profileImage}" alt="Profile" class="profile-image">
                        <div class="citizen-badge">PERKS Citizen</div>
                    </div>
                    <div class="profile-info">
                        <h2>${citizen.nickname || 'Anonymous Citizen'}</h2>
                        <div class="wallet-address">${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 6)}</div>
                        <div class="location">📍 ${citizen.location[0].toFixed(4)}, ${citizen.location[1].toFixed(4)}</div>
                        ${citizen.message ? `<div class="bio">${citizen.message}</div>` : ''}
                    </div>
                </div>
                
                <div class="profile-tabs">
                    <button class="tab-btn active" data-tab="overview">Overview</button>
                    <button class="tab-btn" data-tab="governance">Governance</button>
                    <button class="tab-btn" data-tab="collection">Collection</button>
                </div>
                
                <div class="tab-content">
                    <div class="tab-panel active" id="overview">
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-number">${nftCount}</div>
                                <div class="stat-label">PERKS NFTs</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">Loading...</div>
                                <div class="stat-label">ISLAND Tokens</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">Loading...</div>
                                <div class="stat-label">Voting Power</div>
                            </div>
                        </div>
                        ${citizen.message ? `
                            <div class="section">
                                <h3>Bio</h3>
                                <p style="color: var(--secondary-text); line-height: 1.6;">${citizen.message}</p>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="tab-panel" id="governance">
                        <div style="text-align: center; color: var(--secondary-text); padding: 60px 20px;">
                            <div style="font-size: 48px; margin-bottom: 20px;">🏛️</div>
                            <h3 style="color: var(--text-color); margin-bottom: 12px;">Loading Governance Data...</h3>
                            <p>Fetching ISLAND token balance and voting power from the blockchain.</p>
                        </div>
                    </div>
                    
                    <div class="tab-panel" id="collection">
                        <div class="section">
                            <h3>PERKS Collection (${nftCount})</h3>
                            <div class="nft-grid">
                                ${getNFTGridHTML(citizen)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getGovernanceHTML(governance) {
    return `
        <div class="governance-stats">
            <div class="governance-card">
                <div class="governance-icon">🏛️</div>
                <div style="flex: 1;">
                    <div class="governance-value">${governance.island_token_balance || 0}</div>
                    <div class="governance-label">ISLAND Balance</div>
                </div>
            </div>
            
            <div class="governance-card">
                <div class="governance-icon">⚡</div>
                <div style="flex: 1;">
                    <div class="governance-value">${governance.voting_power || 0}</div>
                    <div class="governance-label">Voting Power</div>
                </div>
            </div>
            
            <div class="governance-card">
                <div class="governance-icon">📊</div>
                <div style="flex: 1;">
                    <div class="governance-value">${governance.voting_participation_rate || 0}%</div>
                    <div class="governance-label">Participation Rate</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h3>DAO Participation</h3>
            <div style="text-align: center; color: var(--secondary-text); padding: 40px 20px;">
                <p>ISLAND token governance tracking is ready. Token balances and voting history will display once connected to live blockchain data.</p>
            </div>
        </div>
    `;
}

function getNFTGridHTML(citizen) {
    if (!citizen.nftMetadata || Object.keys(citizen.nftMetadata).length === 0) {
        return '<div style="text-align: center; color: var(--secondary-text); padding: 40px;">No PERKS NFTs found</div>';
    }
    
    return Object.values(citizen.nftMetadata).map(nft => `
        <div class="nft-item">
            <img src="${nft.image}" alt="${nft.name}" class="nft-thumbnail">
            <div class="nft-name">${nft.name}</div>
        </div>
    `).join('');
}

function switchProfileTab(tabName, modal) {
    // Update tab buttons
    modal.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    modal.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab panels
    modal.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    modal.querySelector(`#${tabName}`).classList.add('active');
}

function closeProfileModal(modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
}
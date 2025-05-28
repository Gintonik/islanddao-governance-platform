// Enhanced Citizen Profile Modal System
let modalState = 'closed'; // 'closed', 'sidebar', 'modal'

function openEnhancedProfile(citizen) {
    const modal = document.createElement('div');
    modal.className = 'enhanced-profile-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999999;
        opacity: 0;
        visibility: hidden;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    
    modal.innerHTML = getProfileModalHTML(citizen);
    
    // Add CSS for seamless scrolling and smooth animations
    const style = document.createElement('style');
    style.textContent = `
        .tab-content::-webkit-scrollbar {
            display: none;
        }
        .tab-content {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        .enhanced-profile-modal {
            animation: modalSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: scale(0.3) translateY(50px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }
    `;
    document.head.appendChild(style);
    
    // Smart close behavior: modal -> sidebar -> closed
    modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            modalState = 'sidebar';
            closeProfileModal(modal);
        }
    });
    
    modal.querySelector('.close-btn').addEventListener('click', () => {
        modalState = 'closed';
        closeProfileModal(modal);
    });
    
    modal.querySelector('.modal-content').addEventListener('click', (e) => e.stopPropagation());
    
    // Tab functionality with smooth transitions
    modal.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchProfileTab(btn.dataset.tab, modal));
    });
    
    document.body.appendChild(modal);
    modalState = 'modal';
    
    // Get sidebar card position for smooth transformation
    const sidebarCard = document.querySelector('#citizenPanel .profile-info');
    let startPosition = { x: 300, y: 200 }; // Default position
    
    if (sidebarCard) {
        const rect = sidebarCard.getBoundingClientRect();
        startPosition = { x: rect.left, y: rect.top };
    }
    
    // Start modal from sidebar card position
    const content = modal.querySelector('.modal-content');
    content.style.transformOrigin = `${startPosition.x}px ${startPosition.y}px`;
    content.style.transform = 'scale(0.3) translateY(50px)';
    
    // Cool entrance animation that expands from sidebar card
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
        
        setTimeout(() => {
            content.style.transform = 'scale(1) translateY(0)';
        }, 50);
    });
    
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
        <div class="modal-overlay" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(16px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        ">
            <div class="modal-content" style="
                background: #0F0F0F;
                border-radius: 24px;
                width: 100%;
                max-width: 900px;
                max-height: 85vh;
                overflow: hidden;
                position: relative;
                border: 2px solid #21E8A3;
                box-shadow: 0 0 0 1px rgba(33, 232, 163, 0.2), 0 32px 64px rgba(0, 0, 0, 0.8), 0 16px 32px rgba(0, 0, 0, 0.4);
                transform: scale(0.8) translateY(30px);
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            ">
                <button class="close-btn" style="
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #FAFAFA;
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    font-size: 20px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 300;
                ">&times;</button>
                
                <div class="profile-header" style="
                    padding: 24px 32px;
                    background: rgba(15, 15, 15, 0.95);
                    color: #FAFAFA;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    border-bottom: 1px solid rgba(33, 232, 163, 0.2);
                    backdrop-filter: blur(8px);
                ">
                    <div class="profile-image-container" style="position: relative;">
                        <img src="${profileImage}" alt="Profile" style="
                            width: 100px;
                            height: 100px;
                            border-radius: 16px;
                            object-fit: cover;
                            border: 2px solid #21E8A3;
                            box-shadow: 0 4px 16px rgba(33, 232, 163, 0.3);
                        ">
                    </div>
                    <div class="profile-info" style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMSAzTDE2IDhIMjJWMTZIMTZMMjEgMjFMMTMuMDkgMTUuNzRMMTIgMjJMMTAuOTEgMTUuNzRMMyAyMUw4IDE2SDJWOEM0IDYgOCAzIDEyIDJaIiBmaWxsPSIjMjFFOEEzIi8+Cjwvc3ZnPgo=" alt="IslandDAO" style="width: 20px; height: 20px;">
                            <span style="
                                font-size: 24px;
                                font-weight: 700;
                                color: #FAFAFA;
                                font-family: 'Inter', sans-serif;
                            ">${citizen.nickname || 'Anonymous Citizen'}</span>
                        </div>
                        <div style="
                            font-family: 'Courier New', monospace;
                            background: rgba(33, 232, 163, 0.1);
                            border: 1px solid rgba(33, 232, 163, 0.3);
                            padding: 6px 12px;
                            border-radius: 8px;
                            font-size: 12px;
                            margin-bottom: 8px;
                            display: inline-block;
                            color: #21E8A3;
                        ">${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 6)}</div>
                        <div style="
                            font-size: 13px;
                            color: #AFAFAF;
                            margin-bottom: 4px;
                        ">📍 ${parseFloat(citizen.location[0]).toFixed(4)}, ${parseFloat(citizen.location[1]).toFixed(4)}</div>
                        ${citizen.message ? `<div style="
                            font-size: 13px;
                            line-height: 1.4;
                            color: #AFAFAF;
                            max-width: 400px;
                        ">${citizen.message}</div>` : ''}
                    </div>
                </div>
                
                <div class="profile-tabs" style="
                    display: flex;
                    background: rgba(26, 26, 26, 0.8);
                    backdrop-filter: blur(8px);
                    padding: 8px;
                    gap: 4px;
                ">
                    <button class="tab-btn active" data-tab="overview" style="
                        flex: 1;
                        padding: 12px 16px;
                        background: rgba(33, 232, 163, 0.15);
                        border: 1px solid rgba(33, 232, 163, 0.3);
                        color: #21E8A3;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        border-radius: 12px;
                        font-family: 'Inter', sans-serif;
                        letter-spacing: 0.3px;
                    ">Overview</button>
                    <button class="tab-btn" data-tab="collection" style="
                        flex: 1;
                        padding: 12px 16px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        color: #AFAFAF;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        border-radius: 12px;
                        font-family: 'Inter', sans-serif;
                        letter-spacing: 0.3px;
                    ">Collection</button>
                    <button class="tab-btn" data-tab="dao" style="
                        flex: 1;
                        padding: 12px 16px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        color: #AFAFAF;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        border-radius: 12px;
                        font-family: 'Inter', sans-serif;
                        letter-spacing: 0.3px;
                    ">DAO</button>
                    <button class="tab-btn" data-tab="achievements" style="
                        flex: 1;
                        padding: 12px 16px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        color: #AFAFAF;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        border-radius: 12px;
                        font-family: 'Inter', sans-serif;
                        letter-spacing: 0.3px;
                    ">Awards</button>
                    <button class="tab-btn" data-tab="social" style="
                        flex: 1;
                        padding: 12px 16px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        color: #AFAFAF;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        border-radius: 12px;
                        font-family: 'Inter', sans-serif;
                        letter-spacing: 0.3px;
                    ">Social</button>
                </div>
                
                <div class="tab-content" style="
                    padding: 32px;
                    max-height: 55vh;
                    overflow-y: scroll;
                    background: #0F0F0F;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                ">
                    <div class="tab-panel active" id="overview">
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-number">${nftCount}</div>
                                <div class="stat-label">PERKS NFTs</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">0</div>
                                <div class="stat-label">ISLAND Tokens</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">Member</div>
                                <div class="stat-label">DAO Status</div>
                            </div>
                        </div>
                        
                        <div class="section">
                            <h3>Profile Information</h3>
                            <div style="background: var(--secondary-bg); border-radius: 12px; padding: 20px; border: 1px solid var(--border-color);">
                                <div style="margin-bottom: 16px;">
                                    <strong style="color: var(--text-color);">Wallet Address:</strong>
                                    <div style="font-family: 'Courier New', monospace; color: var(--secondary-text); margin-top: 4px;">${walletAddress}</div>
                                </div>
                                <div style="margin-bottom: 16px;">
                                    <strong style="color: var(--text-color);">Location:</strong>
                                    <div style="color: var(--secondary-text); margin-top: 4px;">📍 ${parseFloat(citizen.location[0]).toFixed(6)}, ${parseFloat(citizen.location[1]).toFixed(6)}</div>
                                </div>
                                ${citizen.message ? `
                                    <div style="margin-bottom: 16px;">
                                        <strong style="color: var(--text-color);">Bio:</strong>
                                        <div style="color: var(--secondary-text); margin-top: 4px; line-height: 1.6;">${citizen.message}</div>
                                    </div>
                                ` : ''}
                                <div>
                                    <strong style="color: var(--text-color);">Join Date:</strong>
                                    <div style="color: var(--secondary-text); margin-top: 4px;">${citizen.created_at ? new Date(citizen.created_at).toLocaleDateString() : 'Recent'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-panel" id="collection">
                        <div class="section">
                            <h3>PERKS Collection (${nftCount} NFTs)</h3>
                            <div class="nft-grid">
                                ${getNFTGridHTML(citizen)}
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-panel" id="dao">
                        <div class="section">
                            <h3>$ISLAND Token Governance Power</h3>
                            <div style="background: var(--secondary-bg); border-radius: 12px; padding: 20px; border: 1px solid var(--border-color); margin-bottom: 30px;">
                                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                                    <div style="font-size: 32px;">🏛️</div>
                                    <div>
                                        <div style="font-size: 24px; font-weight: 700; color: #21E8A3;">0 ISLAND</div>
                                        <div style="color: var(--secondary-text);">Governance Token Balance</div>
                                    </div>
                                </div>
                                <div style="font-size: 12px; color: var(--secondary-text); font-family: 'Courier New', monospace;">
                                    Contract: Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a
                                </div>
                            </div>
                            
                            <div class="governance-stats">
                                <div class="governance-card">
                                    <div class="governance-icon">⚡</div>
                                    <div style="flex: 1;">
                                        <div class="governance-value">0</div>
                                        <div class="governance-label">Voting Power</div>
                                    </div>
                                </div>
                                
                                <div class="governance-card">
                                    <div class="governance-icon">📊</div>
                                    <div style="flex: 1;">
                                        <div class="governance-value">0</div>
                                        <div class="governance-label">Proposals Voted</div>
                                    </div>
                                </div>
                                
                                <div class="governance-card">
                                    <div class="governance-icon">🎯</div>
                                    <div style="flex: 1;">
                                        <div class="governance-value">0%</div>
                                        <div class="governance-label">Participation Rate</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div style="text-align: center; color: var(--secondary-text); padding: 20px; background: var(--card-bg); border-radius: 8px; border: 1px solid var(--border-color);">
                                <p>Real-time $ISLAND token balance and governance data will be fetched from the Solana blockchain once connected.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-panel" id="achievements">
                        <div class="section">
                            <h3>Achievements & Recognition</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                                <div style="background: var(--secondary-bg); border: 2px dashed var(--border-color); border-radius: 12px; padding: 30px 20px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 16px;">🏆</div>
                                    <h4 style="color: var(--text-color); margin-bottom: 8px;">Early Adopter</h4>
                                    <p style="color: var(--secondary-text); font-size: 14px;">Recognition for early DAO participation</p>
                                </div>
                                
                                <div style="background: var(--secondary-bg); border: 2px dashed var(--border-color); border-radius: 12px; padding: 30px 20px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 16px;">🗳️</div>
                                    <h4 style="color: var(--text-color); margin-bottom: 8px;">Active Voter</h4>
                                    <p style="color: var(--secondary-text); font-size: 14px;">Recognition for governance participation</p>
                                </div>
                                
                                <div style="background: var(--secondary-bg); border: 2px dashed var(--border-color); border-radius: 12px; padding: 30px 20px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 16px;">🌟</div>
                                    <h4 style="color: var(--text-color); margin-bottom: 8px;">Community Builder</h4>
                                    <p style="color: var(--secondary-text); font-size: 14px;">Recognition for community contributions</p>
                                </div>
                                
                                <div style="background: var(--secondary-bg); border: 2px dashed var(--border-color); border-radius: 12px; padding: 30px 20px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 16px;">💎</div>
                                    <h4 style="color: var(--text-color); margin-bottom: 8px;">Diamond Hands</h4>
                                    <p style="color: var(--secondary-text); font-size: 14px;">Recognition for long-term holding</p>
                                </div>
                            </div>
                            
                            <div style="text-align: center; color: var(--secondary-text); padding: 20px; margin-top: 20px;">
                                <p>Achievement rules and custom images will be added in future updates.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-panel" id="social">
                        <div class="section">
                            <h3>Social Connections</h3>
                            <div style="text-align: center; padding: 40px 20px;">
                                <div style="font-size: 64px; margin-bottom: 20px;">🔗</div>
                                <h4 style="color: var(--text-color); margin-bottom: 12px;">Connect Your Socials</h4>
                                <p style="color: var(--secondary-text); margin-bottom: 30px; line-height: 1.6;">
                                    Link your social media profiles to showcase your presence in the IslandDAO community.
                                </p>
                                
                                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px; margin: 0 auto;">
                                    <div style="display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--secondary-bg); border-radius: 8px; border: 1px solid var(--border-color);">
                                        <span style="font-size: 20px;">🐦</span>
                                        <span style="color: var(--secondary-text);">Twitter - Coming Soon</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--secondary-bg); border-radius: 8px; border: 1px solid var(--border-color);">
                                        <span style="font-size: 20px;">💬</span>
                                        <span style="color: var(--secondary-text);">Discord - Coming Soon</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--secondary-bg); border-radius: 8px; border: 1px solid var(--border-color);">
                                        <span style="font-size: 20px;">📱</span>
                                        <span style="color: var(--secondary-text);">Telegram - Coming Soon</span>
                                    </div>
                                </div>
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
    // Update tab buttons with new rounded styling
    modal.querySelectorAll('.tab-btn').forEach(btn => {
        btn.style.color = '#AFAFAF';
        btn.style.background = 'rgba(255, 255, 255, 0.05)';
        btn.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        btn.style.transform = 'scale(1)';
    });
    
    const activeBtn = modal.querySelector(`[data-tab="${tabName}"]`);
    activeBtn.style.color = '#21E8A3';
    activeBtn.style.background = 'rgba(33, 232, 163, 0.15)';
    activeBtn.style.border = '1px solid rgba(33, 232, 163, 0.3)';
    activeBtn.style.transform = 'scale(1.02)';
    
    // Update tab panels
    modal.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    modal.querySelector(`#${tabName}`).classList.add('active');
}

function closeProfileModal(modal) {
    const content = modal.querySelector('.modal-content');
    
    // Cool exit animation
    modal.style.opacity = '0';
    content.style.transform = 'scale(0.8) translateY(30px)';
    
    setTimeout(() => {
        modal.remove();
        if (modalState === 'closed') {
            // Also close the sidebar if X button was clicked
            const sidebar = document.getElementById('citizenPanel');
            if (sidebar) {
                sidebar.classList.remove('open');
            }
        }
        modalState = 'closed';
    }, 400);
}
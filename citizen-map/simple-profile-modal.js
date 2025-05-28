// Simple Horizontal Profile Modal - No Tabs
let modalState = 'closed';

function openEnhancedProfile(citizen) {
    // Close sidebar with smooth transition
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        sidebar.style.transform = 'translateX(-100%)';
        sidebar.style.opacity = '0';
        setTimeout(() => {
            sidebar.style.display = 'none';
        }, 300);
    }
    
    const modal = document.createElement('div');
    modal.className = 'enhanced-profile-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999999;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(12px);
        opacity: 0;
        visibility: hidden;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    
    modal.innerHTML = getSimpleProfileHTML(citizen);
    
    // Add smooth animation CSS
    const style = document.createElement('style');
    style.textContent = `
        .modal-content {
            animation: slideFromSidebar 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .modal-content.closing {
            animation: slideToSidebar 0.5s cubic-bezier(0.55, 0.06, 0.68, 0.19);
        }
        @keyframes slideFromSidebar {
            0% {
                width: 280px;
                height: 200px;
                top: 150px;
                right: 20px;
                left: auto;
                transform: translateX(0);
            }
            100% {
                width: 750px;
                height: 200px;
                top: 150px;
                right: 20px;
                left: auto;
                transform: translateX(-470px);
            }
        }
        @keyframes slideToSidebar {
            0% {
                width: 750px;
                height: 200px;
                top: 150px;
                right: 20px;
                left: auto;
                transform: translateX(-470px);
            }
            100% {
                width: 280px;
                height: 200px;
                top: 150px;
                right: 20px;
                left: auto;
                transform: translateX(0);
            }
        }
    `;
    document.head.appendChild(style);
    
    // Event listeners
    modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeSimpleModal(modal);
        }
    });
    
    modal.querySelector('.close-btn').addEventListener('click', () => {
        closeSimpleModal(modal);
    });
    
    modal.querySelector('.modal-content').addEventListener('click', (e) => e.stopPropagation());
    
    document.body.appendChild(modal);
    modalState = 'modal';
    
    // Show modal
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
    
    // Load governance data
    loadGovernanceData(citizen, modal);
}

function getSimpleProfileHTML(citizen) {
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
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(12px);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <div class="modal-content" style="
                background: linear-gradient(145deg, #0F0F0F 0%, #1A1A1A 100%);
                border-radius: 20px;
                overflow: hidden;
                border: 2px solid #21E8A3;
                box-shadow: 
                    0 0 0 1px rgba(33, 232, 163, 0.2), 
                    0 32px 64px rgba(0, 0, 0, 0.8), 
                    0 16px 32px rgba(0, 0, 0, 0.4);
                display: flex;
                flex-direction: row;
                position: fixed;
                align-items: stretch;
                padding: 0;
                gap: 0;
            ">
                <button class="close-btn" style="
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    color: #FAFAFA;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    font-size: 18px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 300;
                    z-index: 10;
                    transition: all 0.2s ease;
                ">&times;</button>
                
                <!-- Keep Original Profile Card (moves left, content unchanged) -->
                <div style="
                    width: 280px;
                    height: 200px;
                    background: linear-gradient(145deg, #0F0F0F 0%, #1A1A1A 100%);
                    border-radius: 20px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    position: relative;
                ">
                    <div style="position: absolute; top: 12px; left: 12px; opacity: 0.8;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L13.09 8.26L21 3L16 8H22V16H16L21 21L13.09 15.74L12 22L10.91 15.74L3 21L8 16H2V8H8L3 3L10.91 8.26L12 2Z" fill="#21E8A3"/>
                        </svg>
                    </div>
                    
                    <!-- Polaroid Style Profile -->
                    <div style="
                        background: white;
                        padding: 8px;
                        border-radius: 12px;
                        width: fit-content;
                        margin: 0 auto;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        transform: rotate(-2deg);
                    ">
                        <img src="${profileImage}" alt="Profile" style="
                            width: 80px;
                            height: 80px;
                            border-radius: 8px;
                            object-fit: cover;
                            display: block;
                        ">
                        <div style="
                            text-align: center;
                            font-size: 10px;
                            color: #333;
                            margin-top: 4px;
                            font-family: 'Courier New', monospace;
                        ">PERK #${profileNftId || 'XXXX'}</div>
                    </div>
                    
                    <!-- Tags -->
                    <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                        <span style="
                            background: rgba(33, 232, 163, 0.15);
                            color: #21E8A3;
                            padding: 4px 8px;
                            border-radius: 12px;
                            font-size: 10px;
                            font-weight: 600;
                            border: 1px solid rgba(33, 232, 163, 0.3);
                        ">ISLAND DAO</span>
                        <span style="
                            background: rgba(33, 232, 163, 0.15);
                            color: #21E8A3;
                            padding: 4px 8px;
                            border-radius: 12px;
                            font-size: 10px;
                            font-weight: 600;
                            border: 1px solid rgba(33, 232, 163, 0.3);
                        ">PERKS</span>
                    </div>
                    
                    <!-- Social Links -->
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <div style="
                            width: 24px;
                            height: 24px;
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                        ">🐦</div>
                        <div style="
                            width: 24px;
                            height: 24px;
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                        ">🌐</div>
                        <div style="
                            width: 24px;
                            height: 24px;
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                        ">💬</div>
                    </div>
                    
                    <!-- Collection Preview -->
                    <div style="
                        text-align: center;
                        font-size: 11px;
                        color: #AFAFAF;
                        border-top: 1px solid rgba(255, 255, 255, 0.1);
                        padding-top: 8px;
                    ">
                        PERKS Collection (${nftCount})
                        <div style="display: flex; gap: 4px; justify-content: center; margin-top: 4px;">
                            <div style="width: 12px; height: 12px; background: #21E8A3; border-radius: 2px;"></div>
                            <div style="width: 12px; height: 12px; background: #888; border-radius: 2px;"></div>
                            <div style="width: 12px; height: 12px; background: #666; border-radius: 2px;"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Empty revealed space (right side) -->
                <div style="
                    width: 470px;
                    height: 200px;
                    background: transparent;
                "></div>
            </div>
        </div>
    `;
}

function closeSimpleModal(modal) {
    const content = modal.querySelector('.modal-content');
    
    // Add closing animation
    content.classList.add('closing');
    modal.style.opacity = '0';
    
    setTimeout(() => {
        modal.remove();
        modalState = 'closed';
        
        // Show sidebar again
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.style.display = 'block';
            sidebar.style.transition = 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            setTimeout(() => {
                sidebar.style.transform = 'translateX(0)';
                sidebar.style.opacity = '1';
            }, 100);
        }
    }, 500);
}

async function loadGovernanceData(citizen, modal) {
    try {
        const walletAddress = citizen.wallet_address || citizen.wallet;
        const response = await fetch(`/api/governance/${walletAddress}`);
        if (response.ok) {
            const governanceData = await response.json();
            const islandStat = modal.querySelector('.island-tokens');
            if (islandStat) {
                islandStat.textContent = governanceData.island_token_balance || 0;
            }
        }
    } catch (error) {
        console.error('Error loading governance data:', error);
    }
}
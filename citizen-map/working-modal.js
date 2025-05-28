// Working Modal System - Simple and Reliable
let cardState = 'closed';

window.closeCard = function() {
    console.log('Closing card');
    const card = document.getElementById('citizenPanel');
    const backdrop = document.querySelector('.profile-backdrop');
    
    if (backdrop) backdrop.remove();
    if (card) {
        card.style.display = 'none';
        card.classList.remove('open');
    }
    cardState = 'closed';
};

window.toggleCard = function() {
    console.log('Polaroid clicked, current state:', cardState);
    const card = document.getElementById('citizenPanel');
    if (!card) {
        console.log('No card found');
        return;
    }
    
    if (cardState === 'small') {
        console.log('Expanding from small to full');
        expandCard(card);
        cardState = 'expanded';
    } else if (cardState === 'expanded') {
        console.log('Collapsing from full to small');
        collapseCard(card);
        cardState = 'small';
    } else {
        console.log('Card not in proper state:', cardState);
    }
};

function expandCard(card) {
    console.log('Expanding card');
    
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'profile-backdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 999998;
        background: rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(backdrop);
    
    // Make card wider
    card.style.width = '580px';
    card.style.transition = 'width 0.6s ease';
    
    // Add right panel if it doesn't exist
    if (!card.querySelector('.right-panel')) {
        const rightPanel = document.createElement('div');
        rightPanel.className = 'right-panel';
        rightPanel.style.cssText = `
            position: absolute;
            right: 0; top: 0;
            width: 280px; height: 100%;
            background: linear-gradient(145deg, #0F0F0F 0%, #1A1A1A 100%);
            border-radius: 0 20px 20px 0;
            padding: 20px;
            color: #666;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        rightPanel.innerHTML = 'Additional content<br>goes here';
        card.appendChild(rightPanel);
    }
}

function collapseCard(card) {
    console.log('Collapsing card');
    
    // Remove backdrop
    const backdrop = document.querySelector('.profile-backdrop');
    if (backdrop) backdrop.remove();
    
    // Remove right panel
    const rightPanel = card.querySelector('.right-panel');
    if (rightPanel) rightPanel.remove();
    
    // Make card smaller
    card.style.width = '280px';
}

window.openEnhancedProfile = function(citizen) {
    console.log('Opening profile for:', citizen.nickname || 'citizen');
    
    const card = document.getElementById('citizenPanel');
    if (!card) return;
    
    // Reset card
    card.style.display = '';
    card.style.width = '280px';
    card.classList.add('open');
    cardState = 'small';
    
    // Clean up any existing buttons and handlers
    cleanupCard(card);
    
    // Add single X button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.onclick = closeCard;
    closeBtn.style.cssText = `
        position: absolute; top: 16px; right: 16px;
        background: rgba(255,255,255,0.1); border: none;
        color: #FAFAFA; width: 32px; height: 32px;
        border-radius: 50%; font-size: 18px;
        cursor: pointer; z-index: 100;
    `;
    card.appendChild(closeBtn);
    
    // Add click handler to profile image
    const profileImg = card.querySelector('.profile-pfp img');
    if (profileImg) {
        profileImg.onclick = toggleCard;
        profileImg.style.cursor = 'pointer';
    }
    
    console.log('Card setup complete');
};

function cleanupCard(card) {
    // Remove all buttons
    const buttons = card.querySelectorAll('button');
    buttons.forEach(btn => btn.remove());
    
    // Remove right panels
    const rightPanels = card.querySelectorAll('.right-panel');
    rightPanels.forEach(panel => panel.remove());
    
    // Remove backdrop
    const backdrop = document.querySelector('.profile-backdrop');
    if (backdrop) backdrop.remove();
    
    // Reset image handlers
    const profileImg = card.querySelector('.profile-pfp img');
    if (profileImg) {
        profileImg.onclick = null;
        profileImg.style.cursor = '';
    }
}
// Fresh Modal System - Built from scratch for reliability
let modalState = 'closed';

// Close card function
window.closeCard = function() {
    console.log('Closing card');
    const card = document.getElementById('citizenPanel');
    const backdrop = document.querySelector('.modal-backdrop');
    
    if (backdrop) backdrop.remove();
    if (card) {
        card.style.display = 'none';
        card.classList.remove('open');
        card.style.width = '';
        card.innerHTML = card.getAttribute('data-original-content') || '';
    }
    modalState = 'closed';
    console.log('Card closed successfully');
};

// Toggle card size function
window.toggleCardSize = function() {
    console.log('Polaroid image clicked! Current state:', modalState);
    const card = document.getElementById('citizenPanel');
    
    if (!card) {
        console.log('ERROR: No card found');
        return;
    }
    
    if (modalState === 'small') {
        console.log('Expanding card from small to large');
        expandToLarge(card);
        modalState = 'large';
    } else if (modalState === 'large') {
        console.log('Shrinking card from large to small');
        shrinkToSmall(card);
        modalState = 'small';
    }
    
    console.log('Toggle complete, new state:', modalState);
};

function expandToLarge(card) {
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.4);
        z-index: 999;
    `;
    document.body.appendChild(backdrop);
    
    // Expand card
    card.style.width = '580px';
    card.style.transition = 'width 0.5s ease';
    
    // Add extra content area
    const extraContent = document.createElement('div');
    extraContent.className = 'extra-content';
    extraContent.style.cssText = `
        position: absolute;
        right: 0; top: 0;
        width: 280px; height: 100%;
        background: linear-gradient(145deg, #0F0F0F 0%, #1A1A1A 100%);
        border-radius: 0 20px 20px 0;
        padding: 20px;
        color: #888;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
    `;
    extraContent.innerHTML = 'Extended profile<br>content area';
    card.appendChild(extraContent);
}

function shrinkToSmall(card) {
    // Remove backdrop
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) backdrop.remove();
    
    // Remove extra content
    const extraContent = card.querySelector('.extra-content');
    if (extraContent) extraContent.remove();
    
    // Shrink card
    card.style.width = '280px';
}

// Main function to open profile
window.openEnhancedProfile = function(citizen) {
    console.log('Opening profile for citizen:', citizen.nickname || 'Unknown');
    
    const card = document.getElementById('citizenPanel');
    if (!card) {
        console.log('ERROR: citizenPanel not found');
        return;
    }
    
    // Store original content
    if (!card.getAttribute('data-original-content')) {
        card.setAttribute('data-original-content', card.innerHTML);
    }
    
    // Reset and show card
    card.style.display = 'block';
    card.style.width = '280px';
    card.classList.add('open');
    modalState = 'small';
    
    // Clean up old handlers
    removeAllHandlers(card);
    
    // Add close button
    addCloseButton(card);
    
    // Add polaroid click handler
    addPolaroidHandler(card);
    
    console.log('Profile opened successfully in small state');
};

function removeAllHandlers(card) {
    // Remove all buttons
    const buttons = card.querySelectorAll('button');
    buttons.forEach(btn => btn.remove());
    
    // Remove backdrop
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) backdrop.remove();
    
    // Remove extra content
    const extraContent = card.querySelector('.extra-content');
    if (extraContent) extraContent.remove();
    
    // Clear image handlers
    const imgs = card.querySelectorAll('img');
    imgs.forEach(img => {
        img.onclick = null;
        img.style.cursor = '';
    });
}

function addCloseButton(card) {
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 16px; right: 16px;
        width: 32px; height: 32px;
        background: rgba(255,255,255,0.1);
        border: none; border-radius: 50%;
        color: #FAFAFA; font-size: 18px;
        cursor: pointer; z-index: 1000;
    `;
    closeBtn.onclick = closeCard;
    card.appendChild(closeBtn);
}

function addPolaroidHandler(card) {
    const profileImg = card.querySelector('.profile-pfp img');
    if (profileImg) {
        console.log('Adding click handler to profile image');
        profileImg.style.cursor = 'pointer';
        profileImg.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Profile image clicked!');
            toggleCardSize();
        };
    } else {
        console.log('WARNING: Profile image not found');
    }
}
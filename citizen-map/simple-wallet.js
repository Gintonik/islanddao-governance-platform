/**
 * Simple Wallet Connector
 * Clean vanilla JavaScript wallet connection with proper modal positioning
 */

class SimpleWallet {
    constructor() {
        this.wallets = new Map();
        this.connectedWallet = null;
        this.publicKey = null;
        this.listeners = new Map();
        
        this.initializeWallets();
        
        // Wait for DOM to be ready before creating modal
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.createModal());
        } else {
            this.createModal();
        }
    }

    initializeWallets() {
        const walletConfigs = [
            {
                name: 'Phantom',
                identifier: 'phantom',
                icon: 'https://phantom.app/img/phantom-logo.svg',
                provider: () => window.solana,
                detect: () => window.solana && window.solana.isPhantom
            },
            {
                name: 'Solflare',
                identifier: 'solflare', 
                icon: 'https://solflare.com/images/logo.svg',
                provider: () => window.solflare,
                detect: () => window.solflare && window.solflare.isSolflare
            },
            {
                name: 'Backpack',
                identifier: 'backpack',
                icon: 'https://backpack.app/icon.png',
                provider: () => window.backpack,
                detect: () => window.backpack && window.backpack.isBackpack
            }
        ];

        walletConfigs.forEach(config => {
            this.wallets.set(config.identifier, config);
        });
    }

    createModal() {
        // Remove any existing modal
        const existingModal = document.getElementById('simpleWalletModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div id="simpleWalletModal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 100000;
                font-family: 'Inter', sans-serif;
            ">
                <div style="
                    background: #1a1a1a;
                    border-radius: 16px;
                    padding: 32px;
                    width: 400px;
                    max-width: 90vw;
                    position: relative;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
                ">
                    <button onclick="window.simpleWallet.closeModal()" style="
                        position: absolute;
                        top: 16px;
                        right: 16px;
                        background: none;
                        border: none;
                        color: #999;
                        font-size: 24px;
                        cursor: pointer;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='#333'; this.style.color='white'" onmouseout="this.style.background='none'; this.style.color='#999'">&times;</button>
                    
                    <h2 style="
                        color: white;
                        margin: 0 0 24px 0;
                        font-size: 24px;
                        font-weight: 600;
                        text-align: center;
                    ">Connect Wallet</h2>
                    
                    <div id="walletList" style="
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    ">
                        <div style="text-align: center; color: #999; padding: 20px;">Loading wallets...</div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    async showModal() {
        const modal = document.getElementById('simpleWalletModal');
        const walletList = document.getElementById('walletList');
        
        modal.style.display = 'flex';
        walletList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">Detecting wallets...</div>';
        
        try {
            const detectedWallets = await this.detectWallets();
            this.populateWalletList(detectedWallets);
        } catch (error) {
            console.error('Error detecting wallets:', error);
            walletList.innerHTML = '<div style="text-align: center; color: #ff6b6b; padding: 20px;">Error detecting wallets</div>';
        }
    }

    closeModal() {
        const modal = document.getElementById('simpleWalletModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async detectWallets() {
        const detected = [];
        for (const [identifier, wallet] of this.wallets) {
            if (wallet.detect()) {
                detected.push({ ...wallet, detected: true });
            }
        }
        return detected;
    }

    populateWalletList(detectedWallets) {
        const walletList = document.getElementById('walletList');
        
        if (detectedWallets.length === 0) {
            walletList.innerHTML = `
                <div style="text-align: center; color: #999; padding: 20px;">
                    <p>No Solana wallets detected.</p>
                    <p style="margin: 16px 0;">Install a wallet extension:</p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <a href="https://phantom.app" target="_blank" style="
                            color: #00d4aa;
                            text-decoration: none;
                            padding: 8px 16px;
                            border: 1px solid #00d4aa;
                            border-radius: 8px;
                            font-size: 14px;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#00d4aa'; this.style.color='black'" onmouseout="this.style.background='transparent'; this.style.color='#00d4aa'">Phantom</a>
                        <a href="https://solflare.com" target="_blank" style="
                            color: #00d4aa;
                            text-decoration: none;
                            padding: 8px 16px;
                            border: 1px solid #00d4aa;
                            border-radius: 8px;
                            font-size: 14px;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#00d4aa'; this.style.color='black'" onmouseout="this.style.background='transparent'; this.style.color='#00d4aa'">Solflare</a>
                        <a href="https://backpack.app" target="_blank" style="
                            color: #00d4aa;
                            text-decoration: none;
                            padding: 8px 16px;
                            border: 1px solid #00d4aa;
                            border-radius: 8px;
                            font-size: 14px;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#00d4aa'; this.style.color='black'" onmouseout="this.style.background='transparent'; this.style.color='#00d4aa'">Backpack</a>
                    </div>
                </div>
            `;
            return;
        }

        walletList.innerHTML = '';
        
        Array.from(this.wallets.values()).forEach((wallet) => {
            const isDetected = detectedWallets.some(detected => detected.identifier === wallet.identifier);
            
            const walletElement = document.createElement('div');
            walletElement.style.cssText = `
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px;
                background: #2a2a2a;
                border-radius: 12px;
                cursor: ${isDetected ? 'pointer' : 'not-allowed'};
                transition: all 0.2s;
                border: 1px solid transparent;
                opacity: ${isDetected ? '1' : '0.5'};
            `;
            
            if (isDetected) {
                walletElement.onmouseover = () => {
                    walletElement.style.background = '#333';
                    walletElement.style.borderColor = '#555';
                };
                walletElement.onmouseout = () => {
                    walletElement.style.background = '#2a2a2a';
                    walletElement.style.borderColor = 'transparent';
                };
                walletElement.onclick = () => this.connect(wallet.identifier);
            }
            
            walletElement.innerHTML = `
                <img src="${wallet.icon}" alt="${wallet.name}" style="
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    flex-shrink: 0;
                " onerror="this.style.display='none'">
                <div style="flex: 1;">
                    <div style="color: white; font-weight: 500; margin-bottom: 4px;">${wallet.name}</div>
                    <div style="color: ${isDetected ? '#00d4aa' : '#888'}; font-size: 14px;">${isDetected ? 'Detected' : 'Not Installed'}</div>
                </div>
            `;

            walletList.appendChild(walletElement);
        });
    }

    async connect(walletIdentifier) {
        try {
            const walletConfig = this.wallets.get(walletIdentifier);
            if (!walletConfig || !walletConfig.detect()) {
                throw new Error(`${walletConfig?.name || walletIdentifier} not available`);
            }

            const provider = walletConfig.provider();
            let response;
            let publicKey;

            if (walletIdentifier === 'phantom') {
                response = await provider.connect({ onlyIfTrusted: false });
                publicKey = response.publicKey.toString();
            } else if (walletIdentifier === 'solflare') {
                await provider.connect();
                publicKey = provider.publicKey.toString();
            } else if (walletIdentifier === 'backpack') {
                response = await provider.connect();
                publicKey = response.publicKey.toString();
            }

            this.connectedWallet = walletIdentifier;
            this.publicKey = publicKey;
            
            this.emit('connect', { 
                publicKey, 
                wallet: walletIdentifier,
                provider 
            });

            this.closeModal();

        } catch (error) {
            console.error('Connection error:', error);
            this.emit('error', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.connectedWallet) {
                const walletConfig = this.wallets.get(this.connectedWallet);
                const provider = walletConfig.provider();
                
                if (provider && provider.disconnect) {
                    await provider.disconnect();
                }
            }

            this.connectedWallet = null;
            this.publicKey = null;
            this.emit('disconnect');

        } catch (error) {
            console.error('Disconnect error:', error);
            throw error;
        }
    }

    async signMessage(message) {
        if (!this.connectedWallet) {
            throw new Error('No wallet connected');
        }

        const walletConfig = this.wallets.get(this.connectedWallet);
        const provider = walletConfig.provider();
        const encodedMessage = typeof message === 'string' ? new TextEncoder().encode(message) : message;

        if (this.connectedWallet === 'phantom' || this.connectedWallet === 'solflare') {
            return await provider.signMessage(encodedMessage, 'utf8');
        } else {
            return await provider.signMessage(encodedMessage);
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }

    isConnected() {
        return !!this.connectedWallet && !!this.publicKey;
    }

    getPublicKey() {
        return this.publicKey;
    }

    getConnectedWallet() {
        return this.connectedWallet;
    }
}

// Initialize global instance
if (typeof window !== 'undefined') {
    window.SimpleWallet = SimpleWallet;
    window.simpleWallet = new SimpleWallet();
}
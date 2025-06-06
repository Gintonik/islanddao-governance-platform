/**
 * Jupiter-style Wallet Adapter for Vanilla JavaScript
 * Based on solana-wallets-universal core functionality
 */

// Wallet configurations with official metadata
const WALLET_CONFIGS = {
    phantom: {
        name: 'Phantom',
        icon: 'https://phantom.app/img/phantom-logo.svg',
        url: 'https://phantom.app',
        mobile: {
            native: 'https://phantom.app/ul/browse/{url}?ref=phantom.app',
            universal: 'https://phantom.app/ul/browse/{url}?ref=phantom.app'
        },
        detect: () => window.phantom?.solana?.isPhantom,
        provider: () => window.phantom?.solana
    },
    solflare: {
        name: 'Solflare',
        icon: 'https://solflare.com/images/logo.svg',
        url: 'https://solflare.com',
        mobile: {
            native: 'https://solflare.com/ul/browse/{url}',
            universal: 'https://solflare.com/ul/browse/{url}'
        },
        detect: () => window.solflare?.isSolflare,
        provider: () => window.solflare
    },
    backpack: {
        name: 'Backpack',
        icon: 'https://backpack.app/icon.png',
        url: 'https://backpack.app',
        mobile: {
            native: 'https://backpack.app/connect?url={url}',
            universal: 'https://backpack.app/connect?url={url}'
        },
        detect: () => window.backpack?.isBackpack,
        provider: () => window.backpack
    },
    coinbase: {
        name: 'Coinbase Wallet',
        icon: 'https://images.ctfassets.net/q5ulk4bp65r7/3VbZqohOorINNZM8tGEzJn/72d6e35936b7cef3a1f0a3ae7b123fa7/coinbase-wallet.png',
        url: 'https://www.coinbase.com/wallet',
        mobile: {
            native: 'https://go.cb-w.com/dapp?cb_url={url}',
            universal: 'https://go.cb-w.com/dapp?cb_url={url}'
        },
        detect: () => window.coinbaseSolana,
        provider: () => window.coinbaseSolana
    }
};

class JupiterWalletAdapter {
    constructor(config = {}) {
        this.wallets = config.wallets || ['phantom', 'solflare', 'backpack', 'coinbase'];
        this.autoConnect = config.autoConnect || false;
        this.cluster = config.cluster || 'mainnet-beta';
        
        this.connectedWallet = null;
        this.publicKey = null;
        this.connection = null;
        this.listeners = new Map();
        
        this.init();
    }

    async init() {
        this.createModal();
        
        if (this.autoConnect) {
            await this.attemptAutoConnect();
        }
    }

    createModal() {
        const existingModal = document.getElementById('jupiter-wallet-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div id="jupiter-wallet-modal" class="jupiter-wallet-modal">
                <div class="jupiter-wallet-content">
                    <div class="jupiter-wallet-header">
                        <h3>Connect a wallet on Solana to continue</h3>
                        <button class="jupiter-close-btn">&times;</button>
                    </div>
                    <div class="jupiter-wallet-list" id="jupiter-wallet-list">
                        <!-- Wallets populated here -->
                    </div>
                    <div class="jupiter-wallet-footer">
                        <span>New to Solana?</span>
                        <a href="https://phantom.app" target="_blank">Learn more</a>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.addStyles();
        this.attachEventListeners();
    }

    addStyles() {
        if (document.getElementById('jupiter-wallet-styles')) return;

        const styles = `
            <style id="jupiter-wallet-styles">
                .jupiter-wallet-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    z-index: 20000;
                    backdrop-filter: blur(8px);
                    animation: jupiterFadeIn 0.2s ease-out;
                }

                .jupiter-wallet-content {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: #1B1B1F;
                    border: 1px solid #323234;
                    border-radius: 20px;
                    width: 400px;
                    max-width: 90vw;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
                    animation: jupiterSlideIn 0.3s ease-out;
                }

                .jupiter-wallet-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    padding: 24px 24px 16px;
                    border-bottom: 1px solid #323234;
                }

                .jupiter-wallet-header h3 {
                    margin: 0;
                    color: #FFFFFF;
                    font-size: 16px;
                    font-weight: 600;
                    line-height: 1.4;
                    max-width: 280px;
                }

                .jupiter-close-btn {
                    background: transparent;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #9CA3AF;
                    transition: color 0.2s ease;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .jupiter-close-btn:hover {
                    color: #FFFFFF;
                }

                .jupiter-wallet-list {
                    padding: 16px 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .jupiter-wallet-item {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px;
                    border: 1px solid transparent;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: rgba(255, 255, 255, 0.02);
                }

                .jupiter-wallet-item:hover {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: #323234;
                }

                .jupiter-wallet-item.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .jupiter-wallet-item.disabled:hover {
                    background: rgba(255, 255, 255, 0.02);
                    border-color: transparent;
                }

                .jupiter-wallet-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    object-fit: contain;
                    background: white;
                    padding: 2px;
                }

                .jupiter-wallet-info {
                    flex: 1;
                }

                .jupiter-wallet-name {
                    font-weight: 600;
                    color: #FFFFFF;
                    margin-bottom: 2px;
                    font-size: 14px;
                }

                .jupiter-wallet-status {
                    font-size: 12px;
                    color: #9CA3AF;
                }

                .jupiter-wallet-status.detected {
                    color: #10B981;
                }

                .jupiter-wallet-footer {
                    padding: 16px 24px 24px;
                    border-top: 1px solid #323234;
                    text-align: center;
                    font-size: 14px;
                    color: #9CA3AF;
                }

                .jupiter-wallet-footer a {
                    color: #3B82F6;
                    text-decoration: none;
                    margin-left: 8px;
                }

                .jupiter-wallet-footer a:hover {
                    text-decoration: underline;
                }

                @keyframes jupiterFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes jupiterSlideIn {
                    from { 
                        opacity: 0;
                        transform: translate(-50%, -60%);
                    }
                    to { 
                        opacity: 1;
                        transform: translate(-50%, -50%);
                    }
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    attachEventListeners() {
        const modal = document.getElementById('jupiter-wallet-modal');
        const closeBtn = modal.querySelector('.jupiter-close-btn');

        closeBtn.addEventListener('click', () => this.closeModal());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    async select() {
        await this.populateWallets();
        const modal = document.getElementById('jupiter-wallet-modal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    closeModal() {
        const modal = document.getElementById('jupiter-wallet-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async populateWallets() {
        const walletList = document.getElementById('jupiter-wallet-list');
        if (!walletList) return;

        walletList.innerHTML = '';

        for (const walletKey of this.wallets) {
            const wallet = WALLET_CONFIGS[walletKey];
            if (!wallet) continue;

            const isDetected = wallet.detect();
            const status = isDetected ? 'Detected' : 'Not installed';
            const statusClass = isDetected ? 'detected' : '';
            const disabled = !isDetected ? 'disabled' : '';

            const walletItem = document.createElement('div');
            walletItem.className = `jupiter-wallet-item ${disabled}`;
            walletItem.innerHTML = `
                <img src="${wallet.icon}" alt="${wallet.name}" class="jupiter-wallet-icon" 
                     onerror="this.style.display='none'">
                <div class="jupiter-wallet-info">
                    <div class="jupiter-wallet-name">${wallet.name}</div>
                    <div class="jupiter-wallet-status ${statusClass}">${status}</div>
                </div>
            `;

            if (isDetected) {
                walletItem.addEventListener('click', () => this.connectWallet(walletKey, wallet));
            } else {
                walletItem.addEventListener('click', () => {
                    window.open(wallet.url, '_blank');
                });
            }

            walletList.appendChild(walletItem);
        }
    }

    async connectWallet(walletKey, wallet) {
        try {
            const provider = wallet.provider();
            if (!provider) throw new Error(`${wallet.name} not available`);

            const response = await provider.connect();
            this.publicKey = response.publicKey;
            this.connectedWallet = { key: walletKey, ...wallet };
            this.provider = provider;

            // Save connection for auto-connect
            localStorage.setItem('jupiterLastWallet', walletKey);

            this.closeModal();
            this.emit('connect', { 
                publicKey: this.publicKey.toString(),
                wallet: wallet.name
            });

        } catch (error) {
            console.error('Connection failed:', error);
            this.emit('error', error);
        }
    }

    async disconnect() {
        try {
            if (this.provider && this.provider.disconnect) {
                await this.provider.disconnect();
            }
            
            this.publicKey = null;
            this.connectedWallet = null;
            this.provider = null;
            
            localStorage.removeItem('jupiterLastWallet');
            this.emit('disconnect');
        } catch (error) {
            console.error('Disconnect failed:', error);
        }
    }

    async signMessage(message) {
        if (!this.isConnected()) {
            throw new Error('Wallet not connected');
        }

        if (!this.provider || !this.provider.signMessage) {
            throw new Error('Wallet does not support message signing');
        }

        return await this.provider.signMessage(message, 'utf8');
    }

    async attemptAutoConnect() {
        const lastWallet = localStorage.getItem('jupiterLastWallet');
        if (lastWallet && WALLET_CONFIGS[lastWallet]) {
            const wallet = WALLET_CONFIGS[lastWallet];
            if (wallet.detect()) {
                try {
                    await this.connectWallet(lastWallet, wallet);
                } catch (error) {
                    console.log('Auto-connect failed:', error);
                }
            }
        }
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    // Getters
    get connected() {
        return !!this.publicKey;
    }

    isConnected() {
        return this.connected;
    }

    getPublicKey() {
        return this.publicKey?.toString();
    }

    getConnectedWallet() {
        return this.connectedWallet;
    }

    getWallets() {
        return this.wallets.map(key => WALLET_CONFIGS[key]).filter(Boolean);
    }
}

// Factory function to match Jupiter's API
function createWalletAdapter(config = {}) {
    const adapter = new JupiterWalletAdapter(config);
    
    return {
        select: () => adapter.select(),
        wallets: adapter.getWallets(),
        get publicKey() { return adapter.publicKey; },
        signMessage: (message) => adapter.signMessage(message),
        get connected() { return adapter.connected; },
        disconnect: () => adapter.disconnect(),
        on: (event, callback) => adapter.on(event, callback)
    };
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JupiterWalletAdapter, createWalletAdapter };
} else {
    window.JupiterWalletAdapter = JupiterWalletAdapter;
    window.createWalletAdapter = createWalletAdapter;
}
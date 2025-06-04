/**
 * Unified Wallet Component for Vanilla JavaScript
 * Provides a clean wallet connection interface with official logos
 */

class UnifiedWallet {
    constructor(options = {}) {
        this.wallets = new Map();
        this.connectedWallet = null;
        this.publicKey = null;
        this.listeners = new Map();
        
        this.initializeWallets();
        this.createModal();
    }

    initializeWallets() {
        // Official wallet configurations with correct logos
        const walletConfigs = [
            {
                name: 'Phantom',
                identifier: 'phantom',
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTA4IiBoZWlnaHQ9IjEwOCIgdmlld0JveD0iMCAwIDEwOCAxMDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcl80NF8zKSIvPgo8cGF0aCBkPSJNMjYuNSA5NEwyNi41IDQ3LjVDMjYuNSAzOC45MzUgMzMuNDM1IDMyIDQyIDMySDY5LjI1QzgwLjUwNzYgMzIgODkuNSA0MC45OTI0IDg5LjUgNTIuMjVWODkuNUg4MC41VjUyLjI1QzgwLjUgNDUuOTY0NCA3NS41MzU2IDQwLjUgNjkuMjUgNDAuNUg0M0MzOC4zMDU2IDQwLjUgMzQuNSA0NC4zMDU2IDM0LjUgNDlWOTRIMjYuNVoiIGZpbGw9IndoaXRlIi8+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MF9saW5lYXJfNDRfMyIgeDE9IjU0IiB5MT0iMCIgeDI9IjU0IiB5Mj0iMTA4IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CjxzdG9wIHN0b3AtY29sb3I9IiM1MzRCQjgiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNTUxQkY5Ii8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+',
                provider: () => window.solana,
                detect: () => window.solana && window.solana.isPhantom,
                downloadUrl: 'https://phantom.app'
            },
            {
                name: 'Solflare',
                identifier: 'solflare',
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcl8xXzIpIi8+CjxwYXRoIGQ9Ik0yOCAxNi44TDEyLjggMzJMMTIgMzEuMkwyNy4yIDE2SDI4VjE2LjhaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIgOC44TDI3LjIgMjRIMjhWMjMuMkwxMi44IDhMMTIgOC44WiIgZmlsbD0id2hpdGUiLz4KPGRlZnM+CjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQwX2xpbmVhcl8xXzIiIHgxPSIwIiB5MT0iMCIgeDI9IjQwIiB5Mj0iNDAiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agc3RvcC1jb2xvcj0iI0ZGQzEwQiIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNGRkY2Mzk3NSIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+Cjwvc3ZnPg==',
                provider: () => window.solflare,
                detect: () => window.solflare && window.solflare.isSolflare,
                downloadUrl: 'https://solflare.com'
            },
            {
                name: 'Backpack',
                identifier: 'backpack',
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMwMDAwMDAiLz4KPHBhdGggZD0iTTIwIDEwTDMwIDI1SDE5SDE1SDEwTDIwIDEwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+',
                provider: () => window.backpack,
                detect: () => window.backpack && window.backpack.isBackpack,
                downloadUrl: 'https://backpack.app'
            }
        ];

        walletConfigs.forEach(config => {
            this.wallets.set(config.identifier, config);
        });
    }

    createModal() {
        // Create modal HTML structure
        const modalHTML = `
            <div id="unifiedWalletModal" class="wallet-modal" style="display: none;">
                <div class="wallet-modal-backdrop" onclick="window.unifiedWallet.closeModal()"></div>
                <div class="wallet-modal-content">
                    <div class="wallet-modal-header">
                        <h2>Connect Your Wallet</h2>
                        <button class="wallet-modal-close" onclick="window.unifiedWallet.closeModal()">×</button>
                    </div>
                    <div class="wallet-modal-body">
                        <div id="walletList" class="wallet-list">
                            <div class="loading">Detecting wallets...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Create modal styles
        const modalStyles = `
            <style>
                .wallet-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                }
                
                .wallet-modal-backdrop {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                }
                
                .wallet-modal-content {
                    background: #1a1a1a;
                    border-radius: 16px;
                    padding: 0;
                    width: 90%;
                    max-width: 400px;
                    position: relative;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                }
                
                .wallet-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 24px;
                    border-bottom: 1px solid #333;
                }
                
                .wallet-modal-header h2 {
                    color: white;
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                }
                
                .wallet-modal-close {
                    background: none;
                    border: none;
                    color: #999;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: all 0.2s;
                }
                
                .wallet-modal-close:hover {
                    color: white;
                    background: #333;
                }
                
                .wallet-modal-body {
                    padding: 24px;
                }
                
                .wallet-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                .wallet-option {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px;
                    background: #2a2a2a;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: 1px solid transparent;
                }
                
                .wallet-option:hover {
                    background: #333;
                    border-color: #555;
                }
                
                .wallet-option.not-detected {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .wallet-option.not-detected:hover {
                    background: #2a2a2a;
                    border-color: transparent;
                }
                
                .wallet-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    flex-shrink: 0;
                }
                
                .wallet-info {
                    flex: 1;
                }
                
                .wallet-name {
                    color: white;
                    font-weight: 500;
                    margin-bottom: 4px;
                }
                
                .wallet-status {
                    color: #888;
                    font-size: 14px;
                }
                
                .wallet-status.detected {
                    color: #00d4aa;
                }
                
                .no-wallets {
                    text-align: center;
                    color: #999;
                    padding: 20px;
                }
                
                .wallet-suggestions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    margin-top: 16px;
                }
                
                .wallet-suggestions a {
                    color: #00d4aa;
                    text-decoration: none;
                    padding: 8px 16px;
                    border: 1px solid #00d4aa;
                    border-radius: 8px;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                
                .wallet-suggestions a:hover {
                    background: #00d4aa;
                    color: black;
                }
                
                .loading {
                    text-align: center;
                    color: #999;
                    padding: 20px;
                }
            </style>
        `;

        // Inject styles and modal into document
        document.head.insertAdjacentHTML('beforeend', modalStyles);
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    async showModal() {
        const modal = document.getElementById('unifiedWalletModal');
        const walletList = document.getElementById('walletList');
        
        modal.style.display = 'flex';
        walletList.innerHTML = '<div class="loading">Detecting wallets...</div>';
        
        try {
            const detectedWallets = await this.detectWallets();
            this.populateWalletList(detectedWallets);
        } catch (error) {
            console.error('Error detecting wallets:', error);
            walletList.innerHTML = '<div class="error">Error detecting wallets</div>';
        }
    }

    closeModal() {
        const modal = document.getElementById('unifiedWalletModal');
        modal.style.display = 'none';
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
                <div class="no-wallets">
                    <p>No Solana wallets detected.</p>
                    <p>Please install a wallet extension:</p>
                    <div class="wallet-suggestions">
                        <a href="https://phantom.app" target="_blank">Phantom</a>
                        <a href="https://solflare.com" target="_blank">Solflare</a>
                        <a href="https://backpack.app" target="_blank">Backpack</a>
                    </div>
                </div>
            `;
            return;
        }

        walletList.innerHTML = '';
        
        Array.from(this.wallets.values()).forEach((wallet) => {
            const isDetected = detectedWallets.some(detected => detected.identifier === wallet.identifier);
            
            const walletElement = document.createElement('div');
            walletElement.className = `wallet-option ${isDetected ? 'detected' : 'not-detected'}`;
            walletElement.innerHTML = `
                <img src="${wallet.icon}" alt="${wallet.name}" class="wallet-icon">
                <div class="wallet-info">
                    <div class="wallet-name">${wallet.name}</div>
                    <div class="wallet-status ${isDetected ? 'detected' : ''}">${isDetected ? 'Detected' : 'Not Installed'}</div>
                </div>
            `;

            if (isDetected) {
                walletElement.onclick = () => this.connect(wallet.identifier);
            }

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

            // Handle different wallet connection patterns
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

    // Event system
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
    window.UnifiedWallet = UnifiedWallet;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedWallet;
}
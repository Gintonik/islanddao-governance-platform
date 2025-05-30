import { Injectable } from '@nestjs/common'
import { getGovernanceAccounts, pubkeyFilter, TokenOwnerRecord } from '@solana/spl-governance'
import { Connection, PublicKey } from '@solana/web3.js'
import { ApiCoreService } from '@deanslist-platform/api-core-data-access'
import { LRUCache } from 'lru-cache'
import { ApiLeaderboardVotingPowerService } from './api-leaderboard-voting-power.service'

const cacheOpts = {
  max: 1000,
  ttl: 1000 * 60 * 60, // 1 hour
}

@Injectable()
export class ApiLeaderboardService {
  private connection: Connection

  private governingTokenMint = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a')
  private programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw')
  private realm = new PublicKey('F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9')

  private readonly tokenHolders = new LRUCache<string, PublicKey[]>({
    ...cacheOpts,
    fetchMethod: async () => this._getTokenHolders(),
  })

  constructor(private votingPowerService: ApiLeaderboardVotingPowerService, private core: ApiCoreService) {
    this.connection = new Connection(this.core.config.solanaMainnetUrl)
  }

  clearCache() {
    this.votingPowerService.clearCache()
    this.tokenHolders.clear()
  }

  async getTokenHolders(): Promise<PublicKey[]> {
    return (await this.tokenHolders.fetch('')) || []
  }

  async _getTokenHolders(): Promise<PublicKey[]> {
    console.log('Fetching new token holders')
    const filter1 = pubkeyFilter(1, this.realm)
    const filter2 = pubkeyFilter(1 + 32, this.governingTokenMint)

    if (!(filter1 && filter2)) {
      throw new Error('Unable to create filters to getGovernanceAccounts')
    }

    const governaceAccounts = await getGovernanceAccounts(this.connection, this.programId, TokenOwnerRecord, [
      filter1,
      filter2,
    ])
    return governaceAccounts.map((governaceAccount) => governaceAccount.account.governingTokenOwner)
  }

  async getVotingPowerPerWallet(wallets: PublicKey[]) {
    return this.votingPowerService.getVotingPowerPerWallet(wallets)
  }

  async getDelegatedVotingPower(wallets: PublicKey[]) {
    return this.votingPowerService.getDelegatedVotingPower(wallets)
  }
}

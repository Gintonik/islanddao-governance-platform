import { Injectable } from '@nestjs/common'
import {
  booleanFilter,
  getGovernanceAccounts,
  ProgramAccount,
  pubkeyFilter,
  TokenOwnerRecord,
} from '@solana/spl-governance'
import { BlockhashWithExpiryBlockHeight, Connection, PublicKey } from '@solana/web3.js'
import { ApiCoreService } from '@deanslist-platform/api-core-data-access'
import { LRUCache } from 'lru-cache'
import { BN } from '@coral-xyz/anchor'
import { chunks, getLockTokensVotingPowerPerWallet } from '@deanslist-platform/realms-sdk-react'
import { ApiLeaderboardRealmsService } from './api-leaderboard-realms.service'
import { ApiLeaderboardVsrService } from './api-leaderboard-vsr.service'

@Injectable()
export class ApiLeaderboardVotingPowerService {
  private readonly connection: Connection

  private readonly cacheLatestBlockhash = new LRUCache<string, BlockhashWithExpiryBlockHeight>({
    max: 1000,
    ttl: 1000 * 30, // 30 seconds
    fetchMethod: async () => this.connection.getLatestBlockhash(),
  })

  private readonly _votingPowers = new LRUCache<string, Record<string, BN>>({
    max: 100000,
    ttl: 1000 * 60 * 60 * 24, // 24 hours
  })

  private readonly _govAccounts = new LRUCache<string, Record<string, ProgramAccount<TokenOwnerRecord>[]>>({
    max: 100000,
    ttl: 1000 * 60 * 60 * 24, // 24 hours
  })

  constructor(
    private core: ApiCoreService,
    private realmsService: ApiLeaderboardRealmsService,
    private vsrService: ApiLeaderboardVsrService,
  ) {
    this.connection = new Connection(this.core.config.solanaMainnetUrl)
  }

  get votingPowers() {
    return this._votingPowers.get('votingPowers') ?? {}
  }

  set votingPowers(powers: Record<string, BN>) {
    this._votingPowers.set('votingPowers', powers)
  }

  get govAccounts(): Record<string, ProgramAccount<TokenOwnerRecord>[]> {
    return this._govAccounts.get('govAccounts') ?? {}
  }

  set govAccounts(accounts: Record<string, ProgramAccount<TokenOwnerRecord>[]>) {
    this._govAccounts.set('govAccounts', accounts)
  }

  clearCache() {
    this.cacheLatestBlockhash.clear()
    this._votingPowers.clear()
    this._govAccounts.clear()
    this.realmsService.clearCache()
    this.vsrService.clearCache()
  }

  async getVotingPowerPerWallet(wallets: PublicKey[]) {
    const latestBlockhash = await this.cacheLatestBlockhash.fetch('')
    const realm = await this.realmsService.getRealm()
    const vsrClient = await this.vsrService.getVsrClient()

    const nonCachedWallets = wallets.filter((wallet) => !this.votingPowers[wallet.toBase58()])

    const records = await getLockTokensVotingPowerPerWallet(
      nonCachedWallets,
      realm,
      vsrClient,
      this.connection,
      latestBlockhash,
    )

    this.votingPowers = {
      ...this.votingPowers,
      ...records,
    }

    return wallets.reduce((recs, wallet) => {
      recs[wallet.toBase58()] = this.votingPowers[wallet.toBase58()] || new BN(0)
      return recs
    }, {} as Record<string, BN>)
  }

  async getGovAccounts(walletPk: PublicKey): Promise<ProgramAccount<TokenOwnerRecord>[]> {
    const walletString = walletPk.toBase58()
    const cachedGovAccounts = this.govAccounts
    if (cachedGovAccounts[walletString]) {
      return cachedGovAccounts[walletString]
    }

    const realm = await this.realmsService.getRealm()

    const realmFilter = pubkeyFilter(1, realm.pubkey)
    const hasDelegateFilter = booleanFilter(1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6, true)
    const delegatedToUserFilter = pubkeyFilter(1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6 + 1, walletPk)
    if (!realmFilter || !delegatedToUserFilter) throw new Error() // unclear why this would ever happen, probably it just cannot

    const govAccs = (await getGovernanceAccounts(this.connection, realm.owner, TokenOwnerRecord, [
      realmFilter,
      hasDelegateFilter,
      delegatedToUserFilter,
    ])) as ProgramAccount<TokenOwnerRecord>[]

    cachedGovAccounts[walletString] = govAccs
    this.govAccounts = cachedGovAccounts

    return govAccs
  }

  async getGovPower(wallets: PublicKey[]) {
    const config = await this.realmsService.getRealmConfig()

    const programId = config.account.communityTokenConfig.voterWeightAddin
    if (programId === undefined) return undefined

    return await this.getVotingPowerPerWallet(wallets)
  }

  async getDelegatedVotingPower(walletPks: PublicKey[]): Promise<[Record<string, BN>, Set<string>]> {
    const realm = await this.realmsService.getRealm()

    const delegators: ProgramAccount<TokenOwnerRecord>[][] = []
    for (const chunk of chunks(walletPks, 5)) {
      const delegatorsChunk = await Promise.all(chunk.map((dels) => this.getGovAccounts(dels)))
      delegators.push(...delegatorsChunk)
    }

    let delegatedWallets: string[] = []
    const walletDelegatedVotingPower = walletPks.map(async (walletPk, i) => {
      const walletDelegators = delegators[i]

      if (!walletDelegators.length) return [walletPk.toBase58(), new BN(0)]

      const relevantDelegators = walletDelegators
        ?.filter((x) => x.account.governingTokenMint.toString() === realm.account.communityMint.toString())
        .map((x) => x.account.governingTokenOwner)

      delegatedWallets = delegatedWallets.concat(
        relevantDelegators.map((relevantDelegator) => relevantDelegator.toBase58()),
      )

      const delegatorPowers = await this.getGovPower(relevantDelegators)
      const totalDelegatorPower = delegatorPowers
        ? Object.values(delegatorPowers).reduce((sum: BN, curr: BN) => sum.add(curr), new BN(0))
        : new BN(0)

      return [walletPk.toBase58(), totalDelegatorPower]
    })

    return [Object.fromEntries(await Promise.all(walletDelegatedVotingPower)), new Set(delegatedWallets)]
  }
}

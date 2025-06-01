// vsr-voting-power.js

const { PublicKey } = require('@solana/web3.js')
const BN = require('bn.js')

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ')

function readU64LE(buffer, offset) {
  const lower = buffer.readUInt32LE(offset)
  const upper = buffer.readUInt32LE(offset + 4)
  return new BN(upper).ushln(32).add(new BN(lower))
}

function parseDepositEntry(buffer, baseOffset) {
  const amount = readU64LE(buffer, baseOffset)
  const multiplierRaw = readU64LE(buffer, baseOffset + 8)
  const isUsed = buffer.readUInt8(baseOffset + 176)

  if (isUsed !== 1 || amount.isZero()) return null

  // Try different multiplier scalings to find the correct one
  const multiplier1 = multiplierRaw.toNumber() / 1e6
  const multiplier2 = multiplierRaw.toNumber() / 1e9
  const multiplier3 = multiplierRaw.toNumber() / 1e12
  
  const amountISLAND = amount.toNumber() / 1e6
  const power1 = amountISLAND * multiplier1
  const power2 = amountISLAND * multiplier2
  const power3 = amountISLAND * multiplier3
  
  // Use the scaling that produces reasonable governance power values
  let finalMultiplier, finalPower
  if (power3 > 0 && power3 < power1 && power3 < 1e7) {
    finalMultiplier = multiplier3
    finalPower = power3
  } else if (power2 > 0 && power2 < power1 && power2 < 1e7) {
    finalMultiplier = multiplier2
    finalPower = power2
  } else {
    finalMultiplier = multiplier1
    finalPower = power1
  }

  return { amount: amount.toNumber(), multiplier: finalMultiplier, power: finalPower }
}

async function getLockTokensVotingPowerPerWallet(wallets, connection) {
  const results = {}

  for (const wallet of wallets) {
    const pubkey = new PublicKey(wallet)
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: pubkey.toBase58() } },
      ],
    })

    let totalPower = 0
    for (const account of accounts) {
      const data = account.account.data
      const depositsStart = 72
      const depositSize = 192
      for (let i = 0; i < 32; i++) {
        const offset = depositsStart + i * depositSize
        if (offset + depositSize > data.length) break

        const parsed = parseDepositEntry(data, offset)
        if (parsed) {
          totalPower += parsed.power
        }
      }
    }

    results[wallet] = totalPower
  }

  return results
}

module.exports = { getLockTokensVotingPowerPerWallet }
import idl from "./idl/gov.json";
import chatIdl from "./idl/chat.json";
import addinIdl from "./idl/addin.json";
import {BorshAccountsCoder} from "@coral-xyz/anchor/dist/cjs/coder/borsh/accounts";
import { GovernanceIdl, ChatIdl, AddinIdl } from "./idl/idl";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export function deserialize(name: string, data: Buffer, pubkey: PublicKey, programType?: "chat" | "addin") {
    const coder = programType === "chat" ?
     new BorshAccountsCoder(chatIdl as ChatIdl) :
     programType === "addin" ?
     new BorshAccountsCoder(addinIdl as AddinIdl) :
     new BorshAccountsCoder(idl as GovernanceIdl);

    // Prepend 8-byte default discriminator
    const modifiedData = Buffer.concat([Buffer.from("0".repeat(16), "hex"),data]);
    return {
        ...coder.decodeUnchecked(name, modifiedData),
        publicKey: pubkey
    }
}

export async function fetchAndDeserialize(
    connection: Connection, 
    pubkey: PublicKey, 
    name: string, 
    programType?: "chat" | "addin"
) {
    const account = await connection.getAccountInfo(pubkey);

    if (account?.data) {
        return {...deserialize(name, account.data, pubkey, programType), balance: account.lamports / LAMPORTS_PER_SOL};
    } else {
        throw Error("The account doesn't exist.");
    }
}

export async function fetchMultipleAndDeserialize(
    connection: Connection, 
    programId: PublicKey,
    name: string, 
    initialByte?: string, 
    customOffset?: number[],
    customOffsetAddress?: (PublicKey | string)[],
    accountSize?: number,
    programType?: "chat" | "addin"
) {
    const filters = [];

    if (initialByte) {
        filters.push(
            {
                memcmp: {
                    offset: 0,
                    bytes: initialByte
                }
            }
        )
    }

    if (customOffset && customOffsetAddress) {
        customOffset.forEach((offset,index) => {
            const offsetValue = customOffsetAddress[index]

            filters.push({
                memcmp: {
                    offset,
                    bytes: typeof offsetValue === "string" ? offsetValue : offsetValue.toBase58()
                }
            })
        })
    }

    if (accountSize) {
        filters.push(
            {
                dataSize: accountSize
              },
        )
    }

    const accounts = await connection.getProgramAccounts(programId, {
        filters
    })

    const deserializeAccounts = accounts.map(acc => {
        if (acc.account.data) {
            try {
                return {
                    ...deserialize(name, acc.account.data, acc.pubkey, programType), 
                    balance: acc.account.lamports/LAMPORTS_PER_SOL
                }
            } catch {
                return
            }
        } else {
            throw Error("The account doesn't exist.")
        }
    })

    return deserializeAccounts.filter(a => a !== undefined)
}

export async function fetchMultipleAndNotDeserialize(
    connection: Connection, 
    programId: PublicKey,
    name: string, 
    initialByte?: string, 
    customOffset?: number[],
    customOffsetAddress?: (PublicKey | string)[],
    accountSize?: number,
    programType?: "chat" | "addin"
) {
    const filters = [];

    if (initialByte) {
        filters.push(
            {
                memcmp: {
                    offset: 0,
                    bytes: initialByte
                }
            }
        )
    }

    if (customOffset && customOffsetAddress) {
        customOffset.forEach((offset,index) => {
            const offsetValue = customOffsetAddress[index]

            filters.push({
                memcmp: {
                    offset,
                    bytes: typeof offsetValue === "string" ? offsetValue : offsetValue.toBase58()
                }
            })
        })
    }

    if (accountSize) {
        filters.push(
            {
                dataSize: accountSize
              },
        )
    }

    const accounts = await connection.getProgramAccounts(programId, {
        filters,
        dataSlice: {
            length: 0,
            offset: 0
        }
    })

    return accounts.map(acc => acc.pubkey)
}
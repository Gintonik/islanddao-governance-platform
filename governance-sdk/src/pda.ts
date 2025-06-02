import BN from "bn.js";
import { PublicKey } from "@solana/web3.js"

type Pda = {
    publicKey: PublicKey,
    bump: number
}

export class PdaClient {
    private readonly programId: PublicKey;

    constructor(programId: PublicKey) {
        this.programId = programId;
    }

    realmAccount({name}: {name: string}): Pda {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            Buffer.from(name)
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    communityTokenHoldingAccount(
        {realmAccount, communityMint} : 
        {realmAccount: PublicKey, communityMint: PublicKey}): Pda 
    {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            realmAccount.toBuffer(),
            communityMint.toBuffer()
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    councilTokenHoldingAccount(
        {realmAccount, councilMint} : 
        {realmAccount: PublicKey, councilMint: PublicKey}): Pda 
    {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            realmAccount.toBuffer(),
            councilMint.toBuffer()
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    realmConfigAccount({realmAccount}: {realmAccount: PublicKey}): Pda {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("realm-config"), 
            realmAccount.toBuffer(),  
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    tokenOwnerRecordAccount(
        {realmAccount, governingTokenMintAccount, governingTokenOwner} : 
        {realmAccount: PublicKey, governingTokenMintAccount: PublicKey, governingTokenOwner: PublicKey}): Pda 
    {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            realmAccount.toBuffer(),
            governingTokenMintAccount.toBuffer(),
            governingTokenOwner.toBuffer()
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    governingTokenHoldingAccount(
        {realmAccount, governingTokenMintAccount} :
        {realmAccount: PublicKey, governingTokenMintAccount: PublicKey}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            realmAccount.toBuffer(),
            governingTokenMintAccount.toBuffer(),
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    governanceAccount(
        {realmAccount, seed} :
        {realmAccount: PublicKey, seed: PublicKey}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("account-governance"), 
            realmAccount.toBuffer(),
            seed.toBuffer(),
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    nativeTreasuryAccount(
        {governanceAccount} : {governanceAccount: PublicKey}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("native-treasury"), 
            governanceAccount.toBuffer(),
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    proposalAccount(
        {governanceAccount, governingTokenMint, proposalSeed} :
        {governanceAccount: PublicKey, governingTokenMint: PublicKey, proposalSeed: PublicKey}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            governanceAccount.toBuffer(),
            governingTokenMint.toBuffer(),
            proposalSeed.toBuffer()
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    proposalDepositAccount(
        {proposal, depositPayer} :
        {proposal: PublicKey, depositPayer: PublicKey}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("proposal-deposit"), 
            proposal.toBuffer(),
            depositPayer.toBuffer(),
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    signatoryRecordAccount(
        {proposal, signatory} :
        {proposal: PublicKey, signatory: PublicKey}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            proposal.toBuffer(),
            signatory.toBuffer(),
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    proposalTransactionAccount(
        {proposal, optionIndex, index}:
        {proposal: PublicKey, optionIndex: number, index: number}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            proposal.toBuffer(),
            new BN(optionIndex).toArrayLike(Buffer, 'le', 1),
            new BN(index).toArrayLike(Buffer, 'le', 2)
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }

    voteRecordAccount(
        {proposal, tokenOwnerRecord}:
        {proposal: PublicKey, tokenOwnerRecord: PublicKey}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("governance"), 
            proposal.toBuffer(),
            tokenOwnerRecord.toBuffer(),
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }
    
    requiredSignatoryAccount(
        {governanceAccount, signatory}:
        {governanceAccount: PublicKey, signatory: PublicKey}
    ) {
        const pda = PublicKey.findProgramAddressSync([
            Buffer.from("required-signatory"), 
            governanceAccount.toBuffer(),
            signatory.toBuffer(),
        ],
            this.programId
        )

        return {publicKey: pda[0], bump: pda[1]};
    }
}
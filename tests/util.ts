import {
    type ConfirmOptions,
    Keypair, LAMPORTS_PER_SOL,
    PublicKey,
    RpcResponseAndContext, SignatureResult,
    type Signer,
    SystemProgram,
    Transaction
} from "@solana/web3.js";
import {AnchorProvider} from "@coral-xyz/anchor";
import {
    createMint,
    createTransferInstruction,
    getAssociatedTokenAddressSync,
    TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";

const programId = new PublicKey("2ToisBtFhnbpXQ8BUCnReWbDpSMMDoiTMr84DHtCUutc");

export const provider = AnchorProvider.env();

const Seeds = {
    TE_WRAPPER: "te_wrapper",
    TE_MINT_AUTHORITY: "te_mint_authority"
} as const

export const sendAndConfirmTransaction = (
    provider: AnchorProvider,
    transaction: Transaction,
    signers: Signer[] = [],
    opts: ConfirmOptions = {},
): Promise<string> =>
    provider.sendAndConfirm(transaction, signers, opts).catch((err) => {
        console.error(err);
        throw err;
    });

export const fund = async (
    provider: AnchorProvider,
    account: PublicKey,
    amount = 1,
): Promise<void> => {
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: provider.publicKey,
            toPubkey: account,
            lamports: amount * LAMPORTS_PER_SOL,
        }),
    );
    await sendAndConfirmTransaction(provider, transaction);
};

export const initializeTestMint = async (
    provider: AnchorProvider,
): Promise<{
    mint: PublicKey;
    authority: Keypair;
}> => {
    const mint = Keypair.generate();
    const authority = Keypair.generate();
    await fund(provider, authority.publicKey);
    const mintAddress = await createMint(
        provider.connection,
        authority,
        authority.publicKey,
        authority.publicKey,
        0,
        mint,
    );
    return {
        mint: mintAddress,
        authority,
    };
};

export const deriveTEMint = (
    splTokenMint: PublicKey,
): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [splTokenMint.toBuffer(), Buffer.from(Seeds.TE_WRAPPER)],
        programId,
    );
}

export const deriveTEMintAuthority = (
    splTokenMint: PublicKey,
): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [splTokenMint.toBuffer(), Buffer.from(Seeds.TE_MINT_AUTHORITY)],
        programId,
    );
}

export const confirmTransaction = async (
    provider: AnchorProvider,
    signature: string,
): Promise<RpcResponseAndContext<SignatureResult>> => {
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    return provider.connection.confirmTransaction({signature, ...latestBlockhash});
}

export const transferTETokens = async (
    provider: AnchorProvider,
    from: PublicKey,
    to: PublicKey,
    mint: PublicKey,
    amount: number,
    additionalSigners: Keypair[] = [],
): Promise<string> => {
    const fromATA = getAssociatedTokenAddressSync(mint, from, true, TOKEN_2022_PROGRAM_ID);
    const toATA = getAssociatedTokenAddressSync(mint, to, true, TOKEN_2022_PROGRAM_ID);
    const transferIx = createTransferInstruction(
        fromATA, toATA, from, amount, [], TOKEN_2022_PROGRAM_ID
    );
    const transaction = new Transaction().add(
        transferIx
    );
    return sendAndConfirmTransaction(provider, transaction, additionalSigners);
}
import * as client from "/Users/daniel/code/solana-labs/spl-token-wasm/pkg/spl_token_wasm.js";
import {Keypair, PublicKey, Transaction, TransactionInstruction} from "@solana/web3.js";
import * as tweetnacl from "tweetnacl";
import {
    createAssociatedTokenAccountInstruction,
    createReallocateInstruction,
    ExtensionType,
    getAssociatedTokenAddressSync,
    TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import {Provider} from "@coral-xyz/anchor";

const signMessage = (message: Uint8Array, keypair: Keypair) => {
    // console.log("signing message", message, "with key", keypair.publicKey.toString())
    const signature = tweetnacl.sign.detached(
        Buffer.from(message),
        keypair.secretKey,
    );
    // console.log("signature", signature)
    return signature;
}

type RawInstruction = {
    program_id: Uint8Array,
    accounts: {pubkey: Uint8Array, is_signer: boolean, is_writable: boolean}[],
    data: Uint8Array
}

const rawToTxIx = (rawIx: RawInstruction) => new TransactionInstruction({
    keys: rawIx.accounts.map((acc) => ({
        pubkey: new PublicKey(acc.pubkey),
        isSigner: acc.is_signer,
        isWritable: acc.is_writable
    })),
    programId: new PublicKey(rawIx.program_id),
    data: Buffer.from(rawIx.data)
})

function createSigner(keypair: Keypair) {
    const jsSigner = {
        publicKey: keypair.publicKey.toBytes(), // This could be a string or another suitable format
        signMessage: (message: Uint8Array) => signMessage(message, keypair)
    };
    return client.WasmSigner.new(jsSigner);
}

const configureAccount = async (
    provider: Provider,
    mint: PublicKey,
    tokenAccount: PublicKey,
    keypair: Keypair
):Promise<TransactionInstruction[]> => {
    const wasmSigner = createSigner(keypair);

    client.solana_program_init()
    const rawIxes: RawInstruction[] = await client.configure_confidential_transfer_instructions(
        mint.toString(),
        tokenAccount.toString(),
        wasmSigner
    )

    // // TODO remove this by removing the auditor approval address
    // const approveIx = await client.approve_account(mint.toString(), tokenAccount.toString(), provider.publicKey.toString());

    return rawIxes.map(rawToTxIx);
}

const getAccountData = async (provider: Provider, account: PublicKey): Promise<Uint8Array> => {
    const accountInfo = await provider.connection.getAccountInfo(account);
    if (accountInfo === null) {
        throw new Error("Account not found");
    }
    return accountInfo.data;
}

export const transferConfidential = async (
    provider: Provider,
    mint: PublicKey,
    sender: Keypair,
    recipient: PublicKey,
    amount: number
): Promise<string> => {
    const wasmSigner = createSigner(sender);

    const senderATA = getAssociatedTokenAddressSync(mint, sender.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const senderData = await getAccountData(provider, senderATA);
    const recipientATA = getAssociatedTokenAddressSync(mint, recipient, false, TOKEN_2022_PROGRAM_ID);
    const recipientData = await getAccountData(provider, recipientATA);

    const transferRawIx = await client.transfer_confidential(
        mint.toString(),
        senderATA.toString(),
        senderData,
        wasmSigner,
        recipientATA.toString(),
        recipientData,
        BigInt(amount)
    )

    const transaction = new Transaction().add(rawToTxIx(transferRawIx));

    const txSig = await provider.sendAndConfirm(transaction, [sender]);

    console.log("Transfer tx", txSig);

    return txSig;
}

export const createAndConfigureATA = async (
    provider: Provider,
    recipient: Keypair,
    mint: PublicKey
): Promise<PublicKey> => {
    const recipientATA = getAssociatedTokenAddressSync(mint, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createATAIx = createAssociatedTokenAccountInstruction(
        provider.publicKey, recipientATA, recipient.publicKey, mint, TOKEN_2022_PROGRAM_ID
    )
    const reallocateATAIx = createReallocateInstruction(
        recipientATA, provider.publicKey,
        [ExtensionType.ConfidentialTransferAccount],
        recipient.publicKey
    )
    const configureATAIxes =  await configureAccount(provider, mint, recipientATA, recipient);

    const transaction = new Transaction().add(createATAIx, reallocateATAIx, ...configureATAIxes);

    const txSig = await provider.sendAndConfirm(transaction, [recipient]);

    console.log("ATA created and configured", recipientATA.toString(), "with tx", txSig);

    return recipientATA;
}

export const depositConfidential = async (
    provider: Provider,
    owner: Keypair,
    mint: PublicKey,
    amount: number
): Promise<void> => {
    const ownerATA = getAssociatedTokenAddressSync(mint, owner.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const depositRawIx = await client.deposit_confidential(
        mint.toString(),
        ownerATA.toString(),
        owner.publicKey.toString(),
        BigInt(amount),
        0
    )

    console.log("Deposit raw ix", depositRawIx.data)

    const depositTx = new Transaction().add(rawToTxIx(depositRawIx));
    const depositTxSig = await provider.sendAndConfirm(depositTx, [owner]);
    console.log("Deposit tx", depositTxSig);

    const wasmSigner = createSigner(owner);
    const ownerData = await getAccountData(provider, ownerATA);
    const applyRawIx = await client.apply_pending(ownerATA.toString(), ownerData, wasmSigner);

    const applyTx = new Transaction().add(rawToTxIx(applyRawIx));
    const applyTxSig = await provider.sendAndConfirm(applyTx, [owner]);
    console.log("Apply tx", applyTxSig);
}
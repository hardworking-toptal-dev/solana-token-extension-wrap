import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaTokenExtensionWrapper } from "../target/types/solana_token_extension_wrapper";
import {
    confirmTransaction,
    deriveTEMint,
    deriveTEMintAuthority, fund,
    initializeTestMint,
    provider,
    sendAndConfirmTransaction, transferTETokens
} from "./util";
import {Keypair, PublicKey, Transaction} from "@solana/web3.js";
import {
    TOKEN_2022_PROGRAM_ID,
    createMintToInstruction,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction, createReallocateInstruction, ExtensionType
} from "@solana/spl-token";
import BN from "bn.js";
import {
    configureAccount,
    createAndConfigureATA,
    depositConfidential,
    transferConfidential
} from "./confidentialTokenClient";

describe("solana-token-extension-wrapper", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.SolanaTokenExtensionWrapper as Program<SolanaTokenExtensionWrapper>;

    let splTokenMint: PublicKey;
    let splTokenAuthority: Keypair;
    let teTokenMint: PublicKey;
    let teMintAuthority: PublicKey;
    let mySPLATA: PublicKey;
    let myTEATA: PublicKey;

    let confidential1: Keypair;
    let confidential2: Keypair;

    before("Create SPL Token", async () => {
        ({ mint: splTokenMint, authority: splTokenAuthority } = await initializeTestMint(provider));
        teTokenMint = deriveTEMint(splTokenMint)[0];
        teMintAuthority = deriveTEMintAuthority(splTokenMint)[0];
        mySPLATA = getAssociatedTokenAddressSync(splTokenMint, provider.publicKey)
        myTEATA = getAssociatedTokenAddressSync(teTokenMint, provider.publicKey, false, TOKEN_2022_PROGRAM_ID);

        // mint me some spl tokens
        const amount = 100;
        const transaction = new Transaction().add(
            createAssociatedTokenAccountInstruction(provider.publicKey, mySPLATA, provider.publicKey, splTokenMint),
            createMintToInstruction(splTokenMint, mySPLATA, splTokenAuthority.publicKey, amount)
        );
        await sendAndConfirmTransaction(provider, transaction, [splTokenAuthority]);
    })

    it("Is initialized!", async () => {
        const tx = await program.methods.initialize()
            .accounts({
                splTokenMint,
                teMintAuthority,
                teTokenMint,
                tokenProgram: TOKEN_2022_PROGRAM_ID
            })
            .rpc();
        await confirmTransaction(provider, tx);
    });

    it("can wrap", async () => {
        const accounts = {
            splTokenMint,
            teMintAuthority,
            teTokenMint,
            depositSplFrom: mySPLATA,
            depositSplTo: getAssociatedTokenAddressSync(splTokenMint, teMintAuthority, true),
            mintTeTo: myTEATA,
            tokenProgram2022: TOKEN_2022_PROGRAM_ID
        };

        const tx = await program.methods.wrap(new BN(10))
            .accounts(accounts)
            .rpc();

        await confirmTransaction(provider, tx);
    });

    it("can unwrap", async () => {
        const accounts = {
            splTokenMint,
            teMintAuthority,
            teTokenMint,
            withdrawSplTo: mySPLATA,
            withdrawSplFrom: getAssociatedTokenAddressSync(splTokenMint, teMintAuthority, true),
            burnTeFrom: myTEATA,
            tokenProgram2022: TOKEN_2022_PROGRAM_ID
        };

        const tx = await program.methods.unwrap(new BN(5))
            .accounts(accounts)
            .rpc();
        await confirmTransaction(provider, tx);
    });

    it("can create a confidential account", async () => {
        // configure the source token account for confidential transfers
        confidential1 = Keypair.generate();
        await fund(provider, confidential1.publicKey);
        await createAndConfigureATA(provider, confidential1, teTokenMint);

        // transfer tokens to this new confidential account
        await transferTETokens(provider, provider.publicKey, confidential1.publicKey, teTokenMint, 5);

        // deposit them
        await depositConfidential(provider, confidential1, teTokenMint, 5);
    });

    it('can transfer to a second confidential account', async () => {
        // configure the recipient token account for confidential transfers
        confidential2 = Keypair.generate();
        await createAndConfigureATA(provider, confidential2, teTokenMint);

        // transfer tokens to this new confidential account
        // const txSig = await transferTETokens(provider, confidential1.publicKey, confidential2.publicKey, teTokenMint, 2, [confidential1]);
        // console.log("transfer sig", txSig);

        const txSig = await transferConfidential(provider, teTokenMint, confidential1, confidential2.publicKey, 2);
        console.log("transfer sig", txSig);
    });
});

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::transfer;
use anchor_spl::token::Transfer;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenInterface, TokenAccount};
use anchor_spl::token_interface::{mint_to, burn};
use anchor_spl::token_interface::{MintTo, Burn};

declare_id!("2ToisBtFhnbpXQ8BUCnReWbDpSMMDoiTMr84DHtCUutc");

pub const TE_WRAPPER: &'static [u8] = b"te_wrapper";
pub const TE_MINT_AUTHORITY: &'static [u8] = b"te_mint_authority";

#[program]
pub mod solana_token_extension_wrapper {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
    pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
        // deposit spl tokens
        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.deposit_spl_from.to_account_info(),
                    to: ctx.accounts.deposit_spl_to.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        let spl_token_mint = ctx.accounts.spl_token_mint.key();
        // mint wrapped te tokens
        let seeds = &[
            spl_token_mint.as_ref(),
            TE_MINT_AUTHORITY,
            &[ctx.bumps.te_mint_authority],
        ];
        let signer = &[&seeds[..]];

        mint_to(
            CpiContext::new(
                ctx.accounts.token_program_2022.to_account_info(),
                MintTo {
                    authority: ctx.accounts.te_mint_authority.to_account_info(),
                    to: ctx.accounts.mint_te_to.to_account_info(),
                    mint: ctx.accounts.te_token_mint.to_account_info(),
                },
            ).with_signer(signer),
            amount,
        )?;

        Ok(())
    }
    pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
        let spl_token_mint = ctx.accounts.spl_token_mint.key();
        let seeds = &[
            spl_token_mint.as_ref(),
            TE_MINT_AUTHORITY,
            &[ctx.bumps.te_mint_authority],
        ];
        let signer = &[&seeds[..]];

        // withdraw spl tokens
        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.withdraw_spl_from.to_account_info(),
                    to: ctx.accounts.withdraw_spl_to.to_account_info(),
                    authority: ctx.accounts.te_mint_authority.to_account_info(),
                },
            ).with_signer(signer),
            amount,
        )?;

        // burn wrapped te tokens
        burn(
            CpiContext::new(
                ctx.accounts.token_program_2022.to_account_info(),
                Burn {
                    from: ctx.accounts.burn_te_from.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                    mint: ctx.accounts.te_token_mint.to_account_info(),
                },
            ).with_signer(signer),
            amount,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub spl_token_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Valid PDA seeds.
    #[account(
    seeds = [
        spl_token_mint.key().as_ref(),
        TE_MINT_AUTHORITY
    ],
    bump
    )]
    pub te_mint_authority: UncheckedAccount<'info>,

    #[account(
        init,
        seeds = [spl_token_mint.key().as_ref(), TE_WRAPPER],
        bump,
        payer = payer,
        mint::decimals = spl_token_mint.decimals,
        mint::authority = te_mint_authority,
        mint::token_program = token_program,
        extensions::confidential_transfer::authority = None::<Pubkey>,
    )]
    pub te_token_mint: Box<InterfaceAccount<'info, Mint>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,

    // TODO METADATA
    // /// CHECK: account constraint checked in account trait
    // #[account(address = mpl_token_metadata::id())]
    // pub token_metadata_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Wrap<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub owner: Signer<'info>,

    pub spl_token_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Valid PDA seeds.
    #[account(
    seeds = [
    spl_token_mint.key().as_ref(),
    TE_MINT_AUTHORITY
    ],
    bump
    )]
    pub te_mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [spl_token_mint.key().as_ref(), TE_WRAPPER],
        bump,
    )]
    pub te_token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = spl_token_mint,
        associated_token::authority = owner,
    )]
    pub deposit_spl_from: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = spl_token_mint,
        associated_token::authority = te_mint_authority,
    )]
    pub deposit_spl_to: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = te_token_mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program_2022,
    )]
    pub mint_te_to: Box<InterfaceAccount<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Unwrap<'info> {
    pub owner: Signer<'info>,

    pub spl_token_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Valid PDA seeds.
    #[account(
    seeds = [
    spl_token_mint.key().as_ref(),
    TE_MINT_AUTHORITY
    ],
    bump
    )]
    pub te_mint_authority: UncheckedAccount<'info>,

    #[account(
    mut,
    seeds = [spl_token_mint.key().as_ref(), TE_WRAPPER],
    bump,
    )]
    pub te_token_mint: InterfaceAccount<'info, Mint>,

    #[account(
    mut,
    associated_token::mint = spl_token_mint,
    associated_token::authority = owner,
    )]
    pub withdraw_spl_to: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
    mut,
    associated_token::mint = spl_token_mint,
    associated_token::authority = te_mint_authority,
    )]
    pub withdraw_spl_from: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
    mut,
    associated_token::mint = te_token_mint,
    associated_token::authority = owner,
    associated_token::token_program = token_program_2022,
    )]
    pub burn_te_from: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
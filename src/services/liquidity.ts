import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityStateV4, MAINNET_PROGRAM_ID, Market, parseBigNumberish } from "@raydium-io/raydium-sdk";
import { connection } from "../adapter/rpc";
import { MINIMAL_MARKET_STATE_LAYOUT_V3 } from "../types/market";
import { config } from "../utils/config";
import { Commitment, ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { WSOL_ADDRESS } from "../utils/const";
import { BotLiquidityState, MintInfo } from "../types";
import { BN } from "bn.js";
import { resolve } from "path";
import { rejects } from "assert";
import { payer } from "../adapter/payer";
import { BotTokenAccount } from "./tokenaccount";
import { TransactionCompute } from "../types";
import { BotError } from "../types/error";
import sleep from "atomic-sleep";

const getAccountPoolKeysFromAccountDataV4 = async (
    id: PublicKey,
    accountData: LiquidityStateV4
  ) : Promise<LiquidityPoolKeys> => {
    const marketInfo = await connection.getAccountInfo(accountData.marketId, {
      commitment: config.get('default_commitment') as Commitment,
      dataSlice: {
        offset: 253, // eventQueue
        length: 32 * 3,
      },
    });

    if(!marketInfo) { throw new Error('Error fetching market info')}
  
    const minimalMarketData = MINIMAL_MARKET_STATE_LAYOUT_V3.decode(
      marketInfo.data
    );
  
    return {
      id,
      baseMint: accountData.baseMint,
      quoteMint: accountData.quoteMint,
      lpMint: accountData.lpMint,
      baseDecimals: accountData.baseDecimal.toNumber(),
      quoteDecimals: accountData.quoteDecimal.toNumber(),
      lpDecimals: 5,
      version: 4,
      programId: MAINNET_PROGRAM_ID.AmmV4,
      authority: Liquidity.getAssociatedAuthority({
        programId: MAINNET_PROGRAM_ID.AmmV4,
      }).publicKey,
      openOrders: accountData.openOrders,
      targetOrders: accountData.targetOrders,
      baseVault: accountData.baseVault,
      quoteVault: accountData.quoteVault,
      marketVersion: 3,
      marketProgramId: accountData.marketProgramId,
      marketId: accountData.marketId,
      marketAuthority: Market.getAssociatedAuthority({
        programId: accountData.marketProgramId,
        marketId: accountData.marketId,
      }).publicKey,
      marketBaseVault: accountData.baseVault,
      marketQuoteVault: accountData.quoteVault,
      marketBids: minimalMarketData.bids,
      marketAsks: minimalMarketData.asks,
      marketEventQueue: minimalMarketData.eventQueue,
      withdrawQueue: accountData.withdrawQueue,
      lpVault: accountData.lpVault,
      lookupTableAccount: PublicKey.default,
    };
};

export const getLiquidityMintState = async (accountData: LiquidityStateV4) : Promise<BotLiquidityState>  => {
  let mint: PublicKey
  let decimal: number
  let isMintBase = true
  if (accountData.baseMint.toString() === WSOL_ADDRESS) {
    mint = accountData.quoteMint;
    decimal = accountData.quoteDecimal.toNumber()
    isMintBase = false
  } else if(accountData.quoteMint.toString() === WSOL_ADDRESS) {
    mint = accountData.baseMint;
    decimal = accountData.baseDecimal.toNumber()
    isMintBase = true
  } else {
    throw new Error('Pool doesnt have SOL')
  }
  
  return {
    ammId: accountData.marketId,
    mint,
    isMintBase,
    mintDecimal: decimal, 
    lastWSOLInAmount: new BN(0),
    lastWSOLOutAmount: new BN(0),
    lastTokenInAmount: new BN(0),
    lastTokenOutAmount: new BN(0)
  }
}

export {
  getAccountPoolKeysFromAccountDataV4
}

export class BotLiquidity {

  /**
   * 
   * @param ammId 
   * @returns 
   */
  static getAccountPoolKeysFromAccountDataV4 = async (
    ammId: PublicKey
  ) : Promise<LiquidityPoolKeys> => {

    let account = await connection.getAccountInfo(ammId, {
      commitment: config.get('default_commitment') as Commitment
    })
    
    if(!account) { throw new Error(BotError.INVALID_AMM_ID) }

    const accountData = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data);

    const marketInfo = await connection.getAccountInfo(accountData.marketId, {
      commitment: config.get('default_commitment') as Commitment,
      dataSlice: {
        offset: 253, // eventQueue
        length: 32 * 3,
      },
    });
    sleep(10000)

    if(!marketInfo) { throw new Error(BotError.MARKET_FETCH_ERROR)}

    const minimalMarketData = MINIMAL_MARKET_STATE_LAYOUT_V3.decode(
      marketInfo.data
    );
  
    return {
      id: ammId,
      baseMint: accountData.baseMint,
      quoteMint: accountData.quoteMint,
      lpMint: accountData.lpMint,
      baseDecimals: accountData.baseDecimal.toNumber(),
      quoteDecimals: accountData.quoteDecimal.toNumber(),
      lpDecimals: 5,
      version: 4,
      programId: MAINNET_PROGRAM_ID.AmmV4,
      authority: Liquidity.getAssociatedAuthority({
        programId: MAINNET_PROGRAM_ID.AmmV4,
      }).publicKey,
      openOrders: accountData.openOrders,
      targetOrders: accountData.targetOrders,
      baseVault: accountData.baseVault,
      quoteVault: accountData.quoteVault,
      marketVersion: 3,
      marketProgramId: accountData.marketProgramId,
      marketId: accountData.marketId,
      marketAuthority: Market.getAssociatedAuthority({
        programId: accountData.marketProgramId,
        marketId: accountData.marketId,
      }).publicKey,
      marketBaseVault: accountData.baseVault,
      marketQuoteVault: accountData.quoteVault,
      marketBids: minimalMarketData.bids,
      marketAsks: minimalMarketData.asks,
      marketEventQueue: minimalMarketData.eventQueue,
      withdrawQueue: accountData.withdrawQueue,
      lpVault: accountData.lpVault,
      lookupTableAccount: PublicKey.default,
    };
  }

  /**
   * Get token mint address from LiquidityPoolKeysV4
   * Token mint can be either in baseMint or quoteMint
   * This called only focus on WSOL pair only
   * @param poolKeys 
   * @returns 
   */
  static getMintInfoFromWSOLPair = (poolKeys: LiquidityPoolKeysV4) : MintInfo => {

    let mint: PublicKey | undefined = undefined
    let decimal: number = 0
    let isMintBase: boolean = true

    // Check if either of is WSOL
    if(poolKeys.baseMint.toBase58() === WSOL_ADDRESS) {
      mint = poolKeys.quoteMint
      decimal = poolKeys.quoteDecimals
      isMintBase = false
    } else {
      if(poolKeys.quoteMint.toBase58() === WSOL_ADDRESS) {
        mint = poolKeys.baseMint
        decimal = poolKeys.baseDecimals
      }
    }

    return {
      mint,
      decimal,
      isMintBase
    }
  }

  /**
   * Create a simple signed swap instructions
   * @param poolKeys 
   * @param direction 
   * @param wsolTokenAccount 
   * @param amount 
   * @param latestBlockHash 
   * @returns 
   */
  static makeSimpleSwapInstruction = async (
    poolKeys: LiquidityPoolKeys,
    direction: 'in' | 'out',
    wsolTokenAccount: PublicKey,
    amount: BigNumberish,
    latestBlockHash?: String,
    config?: {
      compute?: TransactionCompute
    }
  ): Promise<VersionedTransaction> => {
    let tokenAccountIn;
    let tokenAccountOut;
    let accountInDecimal;
    let blockhash = latestBlockHash
  
    let startInstructions: TransactionInstruction[] = [];
  
    if(!blockhash) {
      const block = await connection.getLatestBlockhash({
          commitment: 'confirmed'
      })
      blockhash = block.blockhash
    }
  
    if (direction === 'in') {
      let accountOut;
      if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
        accountOut = poolKeys.quoteMint;
      } else {
        accountOut = poolKeys.baseMint;
      }
  
      const { ata, instructions } = await BotTokenAccount.getOrCreateTokenAccountInstruction(
        accountOut,
        true
      );
  
      tokenAccountIn = wsolTokenAccount;
      tokenAccountOut = ata;
      startInstructions = instructions;
    } else {
      let accountIn: PublicKey;
  
      if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
        accountIn = poolKeys.quoteMint;
        accountInDecimal = poolKeys.quoteDecimals;
      } else {
        accountIn = poolKeys.baseMint;
        accountInDecimal = poolKeys.baseDecimals;
      }
  
      const { ata } = await BotTokenAccount.getOrCreateTokenAccountInstruction(
        accountIn,
        false
      );
  
      tokenAccountIn = ata;
      tokenAccountOut = wsolTokenAccount;	
    }
  
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys,
        userKeys: {
          tokenAccountIn,
          tokenAccountOut,
          owner: payer.publicKey,
        },
        amountIn: amount,
        minAmountOut: 0,
      },
      poolKeys.version
    );
    
    let computeInstructions: TransactionInstruction[] = []

    if(config?.compute && config?.compute.units > 0) {
      computeInstructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: config.compute.units }))
    }

    if(config?.compute && config?.compute.units > 0) {
      computeInstructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: config.compute.microLamports }))
    }

    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash as string,
      instructions: [
        ...computeInstructions,
        ...startInstructions,
        ...innerTransaction.instructions,
      ],
    }).compileToV0Message();
  
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([payer, ...innerTransaction.signers]);
    
    return transaction
  }
}
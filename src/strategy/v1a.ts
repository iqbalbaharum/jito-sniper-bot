import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { mainSearcherClient } from "../adapter/jito";
import { mempool } from "../generators";
import { BotLiquidity, BotLookupTable, BotTokenAccount, setupWSOLTokenAccount } from "../services";
import { ExistingRaydiumMarketStorage } from "../storage";
import { ArbIdea, BotLiquidityState, LookupIndex, TxInstruction, TxPool } from "../types";
import { RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils";
import { logger } from "../utils/logger";
import { BigNumberish, Liquidity, LiquidityPoolKeys, LiquidityPoolKeysV4, Percent, TOKEN_PROGRAM_ID, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { RaydiumAmmCoder } from "../utils/coder";
import raydiumIDL from '../idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";
import { connection } from "../adapter/rpc";
import { submitBundleDefaultTip } from "../services/bundle";

let trackedPoolKeys: Map<string, LiquidityPoolKeys> = new Map<
  string,
  LiquidityPoolKeys>();
let mints: Map<string, BotLiquidityState> = new Map<
  string,
  BotLiquidityState
>();
let tokenBalances: Map<string, BN> = new Map<string, BN>()
let lookupTable: BotLookupTable
let botTokenAccount: BotTokenAccount
let existingMarkets: ExistingRaydiumMarketStorage

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const onBundleResult = () => {
  mainSearcherClient.onBundleResult(
    (bundleResult) => {
      const bundleId = bundleResult.bundleId;
      const isAccepted = bundleResult.accepted;
      const isRejected = bundleResult.rejected;
      
      if (isAccepted) {
        logger.info(
          `Bundle ${bundleId} accepted in slot ${bundleResult.accepted?.slot}`,
        );
      }

      if (isRejected) {
        logger.warn(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      }
    },
    (error) => {
      logger.error(error);
    },
  );
};

const buyTokenInstruction = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amountIn: BigNumberish, amountOut: BigNumberish, blockhash?: string) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'in',
      ata,
      amountIn,
      amountOut,
      'out',
      {
        compute: {
          microLamports: 10000,
          units: 101337
        },
        blockhash
      }
    );
    
    return transaction
  } catch(e: any) {
    logger.error(e.toString())
  }
}

const sellTokenInstruction = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amountIn: BigNumberish, amountOut: BigNumberish, blockhash: string) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'out',
      ata,
      amountIn,
      amountOut,
      'in',
      {
        compute: {
          microLamports: 10000,
          units: 101337
        },
        blockhash
      }
    );

    return transaction
  } catch(e) {
    console.log(e)
  }
}

const executeSingleBlockTrade = async (ammId: PublicKey, ata: PublicKey) => {
  const poolKeys = await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)
  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  const poolInfo = await Liquidity.fetchInfo({ connection: connection, poolKeys });
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }

  const block = await connection.getLatestBlockhash({
    commitment: 'finalized'
  })

  // const currentTokenPrice = await BotLiquidity.getTokenPrice(info.mint, poolKeys, poolInfo)
  // const tradeSize = (0.01 / currentTokenPrice).toFixed(0)

  // let amountInBN = new BN(0.0001 * LAMPORTS_PER_SOL)
  // let outputTokenAmount = new TokenAmount(new Token(TOKEN_PROGRAM_ID, info.mint!, info.decimal!), tradeSize)
  
  // // const { amountOut, minAmountOut, executionPrice } = Liquidity.computeAmountOut({
  // //   poolKeys: poolKeys,
  // //   poolInfo: poolInfo,
  // //   amountIn: staticAmountIn,
  // //   currencyOut: new Token(TOKEN_PROGRAM_ID, info.mint!, info.decimal),
  // //   slippage: new Percent(1, 100),
  // // })

  // const { amountIn, maxAmountIn } = Liquidity.computeAmountIn({
  //   poolKeys: poolKeys,
  //   poolInfo: poolInfo,
  //   amountOut: outputTokenAmount,
  //   currencyIn: new Token(TOKEN_PROGRAM_ID, new PublicKey(WSOL_ADDRESS), 9),
  //   slippage: new Percent(1, 100),
  // })

  // console.log(tradeSize, amountIn.toExact(), maxAmountIn.toExact())

  // let buyTx  = await buyTokenInstruction(poolKeys, ata, amountIn.raw, new BN(0), block.blockhash)
  // // let sellTx  = await sellTokenInstruction(poolKeys, ata, amountOut.raw, new BN(0), block.blockhash)

  // submitBundleDefaultTip([
  //   {
  //     vtransaction: buyTx as VersionedTransaction,
  //     expectedProfit: new BN(0)
  //   },
  //   // {
  //   //   vtransaction: sellTx as VersionedTransaction,
  //   //   expectedProfit: new BN(0)
  //   // }
  // ])

  // Add trade logic in single bundle

  logger.info(`Single block trading ${info.mint.toBase58()}`)
}

let count = 0

const processDeposit = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {

  if(count > 0) { return }
  count++

  const tx = txPool.mempoolTxns

  const accountIndexes: number[] = instruction.accounts

  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)
  
  let ammId: PublicKey | undefined

  const accountIndex = accountIndexes[1]
  if(accountIndex >= tx.accountKeys.length) {
    const lookupIndex = accountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[accountIndex])
  }

  if(!ammId) { return }
  
  // Check if we this market has already been bought
  if(!existingMarkets.isExisted(ammId)) {
    await executeSingleBlockTrade(ammId, ata)
  }

}

const processTx = async (tx: TxPool, ata: PublicKey) => {
    try {
        for(const ins of tx.mempoolTxns.instructions) {
        const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
        if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
            const decodedIx = coder.instruction.decode(Buffer.from(ins.data))

            if(decodedIx.hasOwnProperty('swapBaseIn')) { // remove liquidity
              await processDeposit(ins, tx, ata)
            } 
        }
        }
    } catch(e) {
        console.log(e)
    }
}

(async () => {
    const { ata } = await setupWSOLTokenAccount(true, 0.07)
    
    if(!ata) { 
      logger.error('No WSOL Account initialize')
      return 
    }
  
    lookupTable = new BotLookupTable()
    botTokenAccount = new BotTokenAccount()
    existingMarkets = new ExistingRaydiumMarketStorage()
    
    onBundleResult()

    const mempoolUpdates = mempool([RAYDIUM_AUTHORITY_V4_ADDRESS])
    for await (const update of mempoolUpdates) {
      processTx(update, ata) // You can process the updates as needed
    }
  
  })();
import { PublicKey } from "@solana/web3.js";
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
import { redisClient } from "../adapter/redis";

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

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, expectedProfit: BN, blockhash?: string) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'in',
      ata,
      amount,
      0,
      'in',
      {
        compute: {
          microLamports: 10000,
          units: 101337
        },
        blockhash
      }
    );
    
    let expected = new BN(0)
    if(!expectedProfit.isZero()) {
      expected = expectedProfit
    }
  
    const arb: ArbIdea = {
      vtransaction: transaction,
      expectedProfit: expected
    }

    // return await submitBundle(arb)
  } catch(e: any) {
    logger.error(e.toString())
    return ''
  }
}

const sellToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BN, expectedProfit: BN, blockhash: string) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'out',
      ata,
      amount.div(new BN(2)),
      0,
      'in',
      {
        compute: {
          microLamports: 8000000,
          units: 101337
        },
        blockhash
      }
    );
    
    let expected = new BN(0)
    if(!expectedProfit.isZero()) {
      expected = expectedProfit
    }
  
    const arb: ArbIdea = {
      vtransaction: transaction,
      expectedProfit: expected
    }

    // return await submitBundle(arb)

  } catch(e) {
    console.log(e)
  }
}

// Listen to price changes
const executeSingleBlockTrade = async (ammId: PublicKey, ata: PublicKey) => {
  const poolKeys = await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)

  if(!poolKeys) { return }
  
  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  const poolInfo = await Liquidity.fetchInfo({ connection: connection, poolKeys });
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }

  const currentPrice = BotLiquidity.getTokenPrice(info.mint, poolKeys, poolInfo)
  // if(parseFloat(currentPrice) <= (1 / 1e8)) {
  //   logger.info(`${info.mint.toBase58()} | ${currentPrice}`)   
  // }
}

const processDeposit = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {

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
  
    lookupTable = new BotLookupTable(redisClient, false)
    botTokenAccount = new BotTokenAccount(redisClient, false)
    existingMarkets = new ExistingRaydiumMarketStorage(redisClient, false)
  
    const mempoolUpdates = mempool([RAYDIUM_AUTHORITY_V4_ADDRESS])
    for await (const update of mempoolUpdates) {
      processTx(update, ata) // You can process the updates as needed
    }
  
    onBundleResult()
  })();
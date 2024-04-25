/**
 * Removed LP strategy
 */
import { AddressLookupTableAccount, Commitment, Connection, LAMPORTS_PER_SOL, Logs, MessageAccountKeys, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { confirmedConnection, connection, lite_rpc } from "../adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, Logger, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { JUPITER_ADDRESS, OPENBOOK_V1_ADDRESS, RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils/const";
import { config as SystemConfig, config } from "../utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "../services/token-account";
import { BotLiquidity, BotLookupTable, getLiquidityMintState, getTokenInWallet } from "../services";
import sleep from "atomic-sleep";
import { submitBundle } from "../services/bundle";
import { mainSearcherClient } from "../adapter/jito";
import { ArbIdea, TokenChunk, BotLiquidityState, LookupIndex, MempoolTransaction, TransactionCompute, TxInstruction, TxPool, PoolInfo } from "../types";
import { BotTransaction, getAmmIdFromSignature } from "../services/transaction";
import { logger } from "../utils/logger";
import { RaydiumAmmCoder } from "../utils/coder";
import raydiumIDL from '../idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";
import { BotError } from "../types/error";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import { IxSwapBaseIn } from "../utils/coder/layout";
import { payer } from "../adapter/payer";
import { BlockHashStorage, CountLiquidityPoolStorage, ExistingRaydiumMarketStorage, MintStorage, PoolKeysStorage, TokenChunkStorage } from "../storage";
import { mempool } from "../generators";
import { BotgRPC } from "../services/grpc";
import { redisClient } from "../adapter/redis";

let mints: MintStorage
let tokenBalances: TokenChunkStorage
let lookupTable: BotLookupTable
let botTokenAccount: BotTokenAccount
let existingMarkets: ExistingRaydiumMarketStorage
let countLiquidityPool: CountLiquidityPoolStorage
let trackedPoolKeys: PoolKeysStorage;
let blockhasher: BlockHashStorage

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const processBuy = async (ammId: PublicKey, ata: PublicKey, blockhash: string) => {
  
  const poolKeys = await BotLiquidity.getAccountPoolKeys(ammId)

  if(!poolKeys) { return }
  
  // Check the pool open time before proceed,
  // If the pool is not yet open, then sleep before proceeding
  // At configuration to check if for how long the system willing to wait
  let different = poolKeys.poolOpenTime * 1000 - new Date().getTime();
  if (different > 0) {
    logger.warn(`Sleep ${ammId} | ${different} ms`)
    if (different <= SystemConfig.get('pool_opentime_wait_max')) {
      await sleep(different);
    } else {
      return;
    }
  }

  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }
  
  if(!poolKeys) { return }
  
  logger.info(new Date(), `BUY ${ammId.toBase58()} | ${info.mint.toBase58()}`)
  
  let signature = await buyToken(
    poolKeys, 
    ata,
    new BN(SystemConfig.get('token_purchase_in_sol') * LAMPORTS_PER_SOL),
    new BN(0 * LAMPORTS_PER_SOL),
    blockhash
  )

  if(!signature) { return }
  
  logger.info(`BUY TX ${ammId} | ${signature}`)

  await trackedPoolKeys.set(ammId, poolKeys)
  await mints.set(ammId, {
    ammId,
    mint: info.mint,
    mintDecimal: info.decimal,
    isMintBase: info.isMintBase
  })

  // add into the record
  existingMarkets.add(ammId)

  return signature
}

async function processSell(
  ata: PublicKey,
  ammId: PublicKey,
  mint: PublicKey,
  useBundle: boolean,
  config: {
    blockhash: String
    compute: TransactionCompute
  },
  poolKeys?: LiquidityPoolKeysV4, 
  expectedProfit: BN = new BN(0)) {
  
  if(!poolKeys) {
    poolKeys = await trackedPoolKeys.get(ammId!)
    if(!poolKeys) { return }
  }

  // Check if the we have confirmed balance before
  // executing sell
  const balance = await tokenBalances.get(mint)
  if(balance === undefined) { return }

  if(balance && !balance.remaining.isZero()) {
    if(!balance.remaining.isNeg()) {

      logger.info(new Date(), `SELL | ${mint.toBase58()} ${balance?.total.toString()} | ${balance?.remaining.toString()}`)
      const signature = await sellToken(
        poolKeys, 
        ata, 
        balance.chuck,
        useBundle,
        config,
        expectedProfit
      )

      balance.remaining = balance.remaining.sub(balance.chuck)
      tokenBalances.set(mint, balance)
      logger.info(`SELL TX ${ammId} | ${signature}`)
    } else {
      tokenBalances.isUsedUp(ammId)
    }
  }
}

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BN, expectedProfit: BN, blockhash?: string) => {
  try {
    // const {sourceAccountIn, destinationAccountIn, startInstructions} = await BotLiquidity.getSourceDestinationTokenAccount(
    //   keys,
    //   'in',
    //   ata
    // )

    // return await BotTransaction.sendToSwapProgram(
    //   connection,
    //   keys,
    //   sourceAccountIn,
    //   destinationAccountIn,
    //   amount,
    //   new BN(0),
    //   startInstructions,
    //   {
    //     compute: {
    //       microLamports: 500000,
    //       units: 55000
    //     },
    //     blockhash
    //   }
    // )
    let block = await blockhasher.get()
    console.log(block)
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'in',
      ata,
      amount,
      0,
      'in',
      {
        compute: {
          microLamports: 500000,
          units: 55000
        },
        blockhash: block.recentBlockhash
      }
    );

    // const arb: ArbIdea = {
    //   vtransaction: transaction,
    //   expectedProfit: new BN(0)
    // }

    // return await submitBundle(arb)

    let selectedConnection : Connection = connection
    if(SystemConfig.get('use_lite_rpc')) {
      selectedConnection = lite_rpc
    }

    return BotTransaction.sendAutoRetryTransaction(selectedConnection, transaction)
  } catch(e: any) {
    logger.error(`TEST: ` + e.toString())
    console.log(e)
    return ''
  }
}

const sellToken = async (
  keys: LiquidityPoolKeysV4,
  ata: PublicKey,
  amount: BN,
  useBundle: boolean,
  config: {
    blockhash: String
    compute: TransactionCompute
  },
  expectedProfit: BN = new BN(0)) => {
  try {

    // const {sourceAccountIn, destinationAccountIn, startInstructions} = await BotLiquidity.getSourceDestinationTokenAccount(
    //   keys,
    //   'out',
    //   ata
    // )

    // return await BotTransaction.sendToSwapProgram(
    //   connection,
    //   keys,
    //   sourceAccountIn,
    //   destinationAccountIn,
    //   amount,
    //   new BN(0),
    //   startInstructions,
    //   {
    //     compute: config.compute,
    //   }
    // )

    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'out',
      ata,
      amount,
      0,
      'in',
      config
    );
    
    // if(useBundle) {
    //   let expected = new BN(0)
    //   if(!expectedProfit.isZero()) {
    //     expected = expectedProfit
    //   }
    
    //   const arb: ArbIdea = {
    //     vtransaction: transaction,
    //     expectedProfit: expected
    //   }

    //   return await submitBundle(arb)
    // } else {
    //   return await BotTransaction.sendTransaction(transaction, SystemConfig.get('default_commitment') as Commitment)
    // }

    let selectedConnection: Connection = connection
    if(SystemConfig.get('use_lite_rpc')) {
      selectedConnection = lite_rpc
    }

    return BotTransaction.sendAutoRetryTransaction(selectedConnection, transaction)
  } catch(e) {
    console.log(e)
  }
}

const getAmmIdFromMempoolTx = async (tx: MempoolTransaction, instruction: TxInstruction) => {
  const accountIndexes: number[] = instruction.accounts || []
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

  return ammId
}

/**
 * Burst sell trade based on balance chuck
 * @param ammId 
 * @param ata 
 * @param blockhash 
 * @returns 
 */
const burstSellAfterLP = async(ammId: PublicKey, ata: PublicKey, blockhash: string) => {
  logger.info(`Burst TXs | ${ammId.toBase58()}`)
    const state = await mints.get(ammId!)
    if(!state) { return }
    const totalChunck = SystemConfig.get('tx_balance_chuck_division')

    for(let i = 0; i < Math.floor(totalChunck / 4); i++) {
      await processSell(
        ata,
        ammId,
        state.mint, 
        false,
        {
          compute: {
            units: 55000,
            microLamports: 500000
          },
          blockhash
        },
      )

      // let newBlock = await connection.getLatestBlockhash(config.get('default_commitment') as Commitment)
      // blockhash = newBlock.blockhash

      let block = await blockhasher.get()
      blockhash = block.recentBlockhash

      sleep(1800)
    } 
}

const processWithdraw = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  const tx = txPool.mempoolTxns
  let ammId: PublicKey | undefined = await getAmmIdFromMempoolTx(tx, instruction)
  if(!ammId) { return }
  
  // If the token is not available, then buy the token. This to cover use cases:
  // 1. Didnt buy token initially
  // 2. Buy failed 
  let count: number | undefined = await countLiquidityPool.get(ammId)
  if(count === undefined || count === null) {
    if(await existingMarkets.isExisted(ammId)) {
      return
    }

    await processBuy(ammId, ata, txPool.mempoolTxns.recentBlockhash)
    await countLiquidityPool.set(ammId, 0)
  } else {
    await countLiquidityPool.set(ammId, count - 1)
  }

  // Burst sell transaction, if rugpull detected
  if(count && count - 1 === 0) {
    burstSellAfterLP(ammId, ata, txPool.mempoolTxns.recentBlockhash)
  }
}

const processInitialize2 = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  const tx = txPool.mempoolTxns

  const accountIndexes: number[] = instruction.accounts || []
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)

  let ammId: PublicKey | undefined

  const accountIndex = accountIndexes[4]
  
  if(accountIndex >= tx.accountKeys.length) {
    const lookupIndex = accountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[accountIndex])
  }

  if(!ammId) { return }

  // if(!countLiquidityPool.has(ammId.toBase58())) {
  //   countLiquidityPool.set(ammId.toBase58(), 1)
  //   logger.warn(`LP ${ammId} | ${1} | ${txPool.mempoolTxns.signature}`)
  // } else {
  //   let count: number = countLiquidityPool.get(ammId.toBase58()) || 0
  //   logger.warn(`LP ${ammId} | ${count} | ${txPool.mempoolTxns.signature}`)
  // }
  if(await existingMarkets.isExisted(ammId)) {
    return
  }

  await processBuy(ammId, ata, txPool.mempoolTxns.recentBlockhash)
}


// TODO: move to payer-listener.ts
const updateTokenBalance = async (ammId: PublicKey, mint: PublicKey, amount: BN, lpCount: number | undefined) => {
  if(amount.isNeg()) { // SELL
    const prevBalance = await tokenBalances.get(mint);
    if (prevBalance !== undefined && !prevBalance.remaining.isNeg()) {
      prevBalance.remaining = prevBalance.remaining.sub(amount.abs());

      // No more balance, remove from tracking
      if(prevBalance.remaining.isNeg()) {
        tokenBalances.isUsedUp(ammId)
        trackedPoolKeys.remove(ammId)
      } else {
        tokenBalances.set(mint, prevBalance); 
      }
    }
  } else { // BUY
    let chuck = amount.divn(SystemConfig.get('tx_balance_chuck_division'))
    tokenBalances.set(mint, {
      total: amount,
      remaining: amount,
      chuck,
      isUsedUp: false,
      isConfirmed: true
    });

    if(lpCount === undefined) {
      await countLiquidityPool.set(ammId, 1)
    }
  }
  return
}

// Most Raydium transaction is using swapBaseIn, so the bot need to figure out if this transaction
// is "in" @ "out" direction. This can be achieved by checking the mint token balance in transaction, 
// if mint token is negative, then it is sell, and if positive value it's buy
const processSwapBaseIn = async (swapBaseIn: IxSwapBaseIn, instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  
  const tx = txPool.mempoolTxns

  // Find the transaction is buy or sell by checking 
  const accountIndexes: number[] = Array.from(instruction.accounts)
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)
  let sourceTA: PublicKey | undefined
  let destTA: PublicKey | undefined
  let ammId: PublicKey | undefined
  let serumProgramId: PublicKey | undefined
  let signer: PublicKey | undefined

  // ammId
  const ammIdAccountIndex = accountIndexes[1]
  if(ammIdAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = ammIdAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[ammIdAccountIndex])
  }

  if(!ammId) { return }
  
  // TODO: Effect: Multiple purchase of same token
  // Check, if the ammId is not tracked, and the swapBaseIn/swapBaseOut is still zero
  // then it's a newly opened pool.
  // For this liquidity, add to market list before the buy complete, this to prevent
  // multiple purchase of the same token.
  if(!existingMarkets.isExisted(ammId)) {
    let isNewlyActive = await BotLiquidity.isLiquidityPoolNewlyActive(ammId, 1000)
    if(isNewlyActive) {
      existingMarkets.add(ammId)
      await processBuy(ammId, ata, txPool.mempoolTxns.recentBlockhash) 
    }

    return
  }
  
  // BUG: There's another method for Raydium swap which move the array positions
  // to differentiate which position, check the position of OPENBOOK program Id in accountKeys
  const serumAccountIndex = accountIndexes[7]
  if(serumAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = serumAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    serumProgramId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    serumProgramId = new PublicKey(tx.accountKeys[serumAccountIndex])
  }

  let sourceAccountIndex
  let destinationAccountIndex
  let signerAccountIndex
  if(serumProgramId?.toBase58() === OPENBOOK_V1_ADDRESS) {
    sourceAccountIndex = accountIndexes[15]
    destinationAccountIndex = accountIndexes[16]
    signerAccountIndex = accountIndexes[17]
  } else {
    sourceAccountIndex = accountIndexes[14]
    destinationAccountIndex = accountIndexes[15]
    signerAccountIndex = accountIndexes[16]
  }
  
  // signer
  if(signerAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = signerAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    signer = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    signer = new PublicKey(tx.accountKeys[signerAccountIndex])
  }
  
  // source 
  if(sourceAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = sourceAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    sourceTA = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    sourceTA = new PublicKey(tx.accountKeys[sourceAccountIndex])
  }

  // destination 
  if(destinationAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = destinationAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    destTA = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    destTA = new PublicKey(tx.accountKeys[destinationAccountIndex])
  }
  
  if(!sourceTA || !destTA || !ammId || !signer) { return }

  const state = await mints.get(ammId!)
  if(!state) { return }
  
  let txAmount = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, state.mint)
  let txSolAmount = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, new PublicKey(WSOL_ADDRESS))
  
  let count = await countLiquidityPool.get(ammId)
  
  // This function to calculate the latest balance token in payer wallet.
  // The getBalanceFromTransaction, can identify if the tx is BUY @ SELL call
  if(sourceTA.equals(ata) || signer.equals(payer.publicKey)) {
    // logger.info(`Token update ${ammId}`)
    // updateTokenBalance(ammId, state.mint, txAmount, count)
    
    return
  }

  // Validate if the swap fullfill certain condition
  // 1. LP have been removed (Check LP count)
  // 2. Buy swap
  // 3. Tracked poolKeys
  if(count === undefined || count === null) { return }
  if(count > 0) { return }

  let poolKeys
  poolKeys = await trackedPoolKeys.get(ammId!)
  if(!poolKeys) { return }
  
  let isBuyTradeAction = false

  if(txAmount.isNeg()) { isBuyTradeAction = false } else { isBuyTradeAction = true }
  
  const amount = parseFloat(txSolAmount.abs().toString()) / LAMPORTS_PER_SOL
  
  if(isBuyTradeAction && amount >= SystemConfig.get('min_sol_trigger')) {
    const totalChunck = SystemConfig.get('tx_balance_chuck_division')
    // The strategy similar as bot v3 (old). On every trade triggered,
    // burst out a number of txs (chunk)
    let blockhash = txPool.mempoolTxns.recentBlockhash
    let units = 55000
    let microLamports = 500000

    logger.warn(`Entry ${ammId} | ${state.mint.toBase58()} | ${amount} SOL`)

    for(let i=0; i < Math.floor(totalChunck/ 5); i++) {
      await processSell(
        ata,
        ammId,
        state.mint,
        false,
        {
          compute: {
            units,
            microLamports
          },
          blockhash,
        },
        poolKeys,
        new BN(amount * LAMPORTS_PER_SOL)
      )

      sleep(2000)
    }
    
    // If send as bundle, send tx as pairing as well
    if(amount > SystemConfig.get('jito_bundle_min_threshold')) {

      units = 1000000
      
      let block = await blockhasher.get()
      blockhash = block.recentBlockhash

      await processSell(
        ata,
        ammId,
        state.mint,
        false,
        {
          compute: {
            units,
            microLamports
          },
          blockhash,
        },
        undefined,
        new BN(amount * LAMPORTS_PER_SOL)
      ) 
    }
  }
}

const processTx = async (tx: TxPool, ata: PublicKey) => {
  for(const ins of tx.mempoolTxns.instructions) {
    const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
    if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {

      try {
        let dataBuffer = Buffer.from(ins.data)
        const decodedIx = coder.instruction.decode(dataBuffer)
        
        if(decodedIx.hasOwnProperty('withdraw')) { // remove liquidity
          logger.info(`Withdraw ${tx.mempoolTxns.signature}`)
          await processWithdraw(ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('swapBaseIn')) {
          await processSwapBaseIn((decodedIx as any).swapBaseIn, ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('initialize2')) {
          logger.info(`Initialize2 ${tx.mempoolTxns.signature}`)
          await processInitialize2(ins, tx, ata)
        }
      } catch(e:any) {
        console.log(tx.mempoolTxns.signature, e)
      }
    }
  }
}

(async () => {
  try {
    const { ata } = await setupWSOLTokenAccount(true, 0.3)
    
    if(!ata) { 
      logger.error('No WSOL Account initialize')
      return 
    }

    lookupTable = new BotLookupTable(redisClient, false)
    botTokenAccount = new BotTokenAccount(redisClient, true)
    existingMarkets = new ExistingRaydiumMarketStorage(redisClient, true)
    countLiquidityPool = new CountLiquidityPoolStorage(redisClient, true)
    tokenBalances = new TokenChunkStorage(redisClient, true)
    trackedPoolKeys = new PoolKeysStorage(redisClient, true)
    mints = new MintStorage(redisClient, true)
    blockhasher = new BlockHashStorage(redisClient)
    
    const mempoolUpdates = mempool([
      RAYDIUM_AUTHORITY_V4_ADDRESS, 
      payer.publicKey.toBase58(),
      '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'
    ])
    
    logger.info(`Starting bot V2`)

    for await (const update of mempoolUpdates) {
      processTx(update, ata) // You can process the updates as needed
    }

    // let botGrpc = new BotgRPC(SystemConfig.get('grpc_1_url'), SystemConfig.get('grpc_1_token'))
    // botGrpc.addTransaction('raydium_tx', {
    //   vote: false,
    //   failed: false,
    //   accountInclude: [
    //     RAYDIUM_AUTHORITY_V4_ADDRESS, 
    //     payer.publicKey.toBase58(),
    //     '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'
    //   ],
    //   accountExclude: [],
    //   accountRequired: [],
    // })

    // botGrpc.listen(
    //   () => {},
    //   (update) => processTx(update, ata) 
    // )
  } catch(e) {
    console.log(e)
  }
})();
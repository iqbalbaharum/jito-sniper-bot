import { AddressLookupTableAccount, Commitment, LAMPORTS_PER_SOL, Logs, MessageAccountKeys, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { confirmedConnection, connection } from "../adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { JUPITER_ADDRESS, OPENBOOK_V1_ADDRESS, RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils/const";
import { config as SystemConfig, config } from "../utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "../services/token-account";
import { BotLiquidity, BotLookupTable, getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet } from "../services";
import sleep from "atomic-sleep";
import { submitBundle } from "../services/bundle";
import { mainSearcherClient } from "../adapter/jito";
import { ArbIdea, BalanceTracker, BotLiquidityState, LookupIndex, MempoolTransaction, TransactionCompute, TxInstruction, TxPool } from "../types";
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
import { ExistingRaydiumMarketStorage } from "../storage";
import { mempool } from "../generators";

// let trackedLiquidityPool: Set<string> = new Set<string>()
let trackedPoolKeys: Map<string, LiquidityPoolKeys> = new Map<
  string,
  LiquidityPoolKeys>();
let mints: Map<string, BotLiquidityState> = new Map<
  string,
  BotLiquidityState
>();

// tracked for interested LP activities, number would reflect the number of LP
let countLiquidityPool: Map<string, number> = new Map()


let tokenBalances: Map<string, BalanceTracker> = new Map<string, BalanceTracker>()
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

const processBuy = async (ammId: PublicKey, ata: PublicKey, blockhash: string) => {

  if(existingMarkets.isExisted(ammId)) {
    return
  }
  
  const poolKeys = await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)
  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }

  if(!poolKeys) { return }
  
  logger.info(new Date(), `BUY ${info.mint.toBase58()}`)

  let signature = await buyToken(
    poolKeys, 
    ata,
    SystemConfig.get('token_purchase_in_sol') * LAMPORTS_PER_SOL,
    new BN(0 * LAMPORTS_PER_SOL),
    blockhash
  )

  if(!signature) { return }
  
  logger.info(`Buy TX send: ${signature}`)

  trackedPoolKeys.set(ammId.toBase58(), poolKeys)
  mints.set(ammId.toBase58(), {
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
  config: {
    blockhash: String
    compute: TransactionCompute
  },
  poolKeys?: LiquidityPoolKeysV4, ) {
  
  if(!poolKeys) {
    poolKeys = trackedPoolKeys.get(ammId!.toBase58())
    if(!poolKeys) { return }
  }

  logger.warn(`Key ${ammId}`)

  const balance = tokenBalances.get(mint.toBase58())
  logger.warn(`Selling ${ammId} ${balance?.total.toString()} | ${balance?.remaining.toString()}`)
  if(balance && !balance.remaining.isZero()) {
    if(!balance.remaining.isNeg()) {

      logger.info(new Date(), `SELL | ${mint.toBase58()} ${balance?.total.toString()} | ${balance?.remaining.toString()}`)
      const signature = await sellToken(
        poolKeys, 
        ata, 
        balance.chuck,
        config
      )

      balance.remaining = balance.remaining.sub(balance.chuck)
      tokenBalances.set(mint.toBase58(), balance)
      logger.info(`Sell TX send: ${signature}`)
    } else {
      // trackedPoolKeys.delete(ammId.toBase58())
      // mints.delete(ammId.toBase58())
      tokenBalances.delete(ammId.toBase58())
    }
  } else {
    // Since there's no check for tracking, the bundle might failed,
    // So if there's no balance in wallet - remove tracking
    trackedPoolKeys.delete(ammId.toBase58())
  }
}

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
    
    // let expected = new BN(0)
    // if(!expectedProfit.isZero()) {
    //   expected = expectedProfit
    // }
  
    // const arb: ArbIdea = {
    //   vtransaction: transaction,
    //   expectedProfit: expected
    // }

    // return await submitBundle(arb)
    return await BotTransaction.sendTransaction(transaction, SystemConfig.get('default_commitment') as Commitment)
  } catch(e: any) {
    logger.error(e.toString())
    return ''
  }
}

const sellToken = async (
  keys: LiquidityPoolKeysV4,
  ata: PublicKey,
  amount: BN,
  config: {
    blockhash: String
    compute: TransactionCompute
  }) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'out',
      ata,
      amount,
      0,
      'in',
      config
    );
    
    // let expected = new BN(0)
    // if(!expectedProfit.isZero()) {
    //   expected = expectedProfit
    // }
  
    // const arb: ArbIdea = {
    //   vtransaction: transaction,
    //   expectedProfit: expected
    // }

    // return await submitBundle(arb)
    return await BotTransaction.sendTransaction(transaction, SystemConfig.get('default_commitment') as Commitment)
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

const processWithdraw = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  const tx = txPool.mempoolTxns
  let ammId: PublicKey | undefined = await getAmmIdFromMempoolTx(tx, instruction)
  if(!ammId) { return }
  
  // SUGGESTION: Is it feasible to integrate v3 version in v2? If the token is not available, the buy the token
  // This to cover use cases
  // 1. Didnt buy token initially
  // 2. Buy failed 
  let count: number | undefined = countLiquidityPool.get(ammId.toBase58())!
  if(!count) {
    await processBuy(ammId, ata, txPool.mempoolTxns.recentBlockhash)
    return
  }

  // countLiquidityPool.set(ammId.toBase58(), count - 1)

  // Burst sell transaction, if rugpull detected
  if(count - 1 === 0) {
    const state = mints.get(ammId!.toBase58())
    if(!state) { return }
    const totalChunck = SystemConfig.get('tx_balance_chuck_division')
    let blockhash = txPool.mempoolTxns.recentBlockhash
    for(let i = 0; i < Math.floor(totalChunck / 2); i++) {
      await processSell(
        ata,
        ammId,
        state.mint, 
        {
          compute: {
            units: 100000,
            microLamports: 101337
          },
          blockhash
        }
      )

      let newBlock = await connection.getLatestBlockhash(config.get('default_commitment') as Commitment)
      blockhash = newBlock.blockhash

      sleep(1800)
    } 
  }
}

// Buy token after token release
const processDeposit = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  
  const tx = txPool.mempoolTxns

  let ammId: PublicKey | undefined = await getAmmIdFromMempoolTx(tx, instruction)
  if(!ammId) { return }
  
  // if(!countLiquidityPool.has(ammId.toBase58())) {
  //   countLiquidityPool.set(ammId.toBase58(), 1)
  //   logger.warn(`LP ${ammId} | ${1} | ${txPool.mempoolTxns.signature}`)
  // } else {
  //   let count: number = countLiquidityPool.get(ammId.toBase58()) || 0
  //   countLiquidityPool.set(ammId.toBase58(), count + 1)
  //   logger.warn(`LP ${ammId} | ${count} | ${txPool.mempoolTxns.signature}`)
  // }
  
  await processBuy(ammId, ata, txPool.mempoolTxns.recentBlockhash)
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
  
  await processBuy(ammId, ata, txPool.mempoolTxns.recentBlockhash)
}

// Most Raydium transaction is using swapBaseIn, so the bot need to figure out if this transaction
// is "in" @ "out" direction. This can be achieved by checking UserSourceTokenAccount and check if it's similar
// as the signer ATA account. If it's a WSOL, then it's a "in" process, and vice versa
// For swapBaseIn instruction, the position of "UserSourceTokenAccount" is at position #16
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
  const state = mints.get(ammId!.toBase58())
  if(!state) { return }
  // BUG: The bot tracked the ammId before tx is finalize, so the buy tx appear in request
  // To counter the bug, skip any tx if sourceTA is similar with user WSOL address
  if(sourceTA.equals(ata) || signer.equals(payer.publicKey)) {
    let txAmount = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, state.mint)
    if(txAmount.isNeg()) {
      const prevBalance = tokenBalances.get(state.mint.toBase58());
      if (prevBalance !== undefined) {
        prevBalance.remaining = txAmount.sub(prevBalance.remaining.abs());
        tokenBalances.set(state.mint.toBase58(), prevBalance);
      } else {
          let chuck = txAmount.divn(SystemConfig.get('tx_balance_chuck_division'))
          // Previous balance not found, set current balance directly
          tokenBalances.set(state.mint.toBase58(), {
            total: txAmount,
            remaining: txAmount,
            chuck
          });

          countLiquidityPool.set(ammId.toBase58(), 1)
      }
    } else {
      let chuck = txAmount.divn(SystemConfig.get('tx_balance_chuck_division'))
      tokenBalances.set(state.mint.toBase58(), {
        total: txAmount,
        remaining: txAmount,
        chuck
      });

      countLiquidityPool.set(ammId.toBase58(), 1)
    }
    return
  }
  
  let isBuyTradeAction = false
  let signerWSOLAccount = await BotTokenAccount.getAssociatedTokenAccount(new PublicKey(WSOL_ADDRESS), signer)

  if(!signerWSOLAccount.equals(sourceTA) && !signerWSOLAccount.equals(destTA)) {
    return
  }

  if(signerWSOLAccount.equals(sourceTA)) {
    isBuyTradeAction = true
  } else {
    if(!signerWSOLAccount.equals(destTA)) {
      return
    }
  }

  let amount = parseFloat(swapBaseIn.amountIn.toString()) / LAMPORTS_PER_SOL

  if(isBuyTradeAction && amount >= SystemConfig.get('min_sol_trigger')) {
    let count = countLiquidityPool.get(ammId.toBase58())
    if(!count || count != 0) {
      return
    }

    const totalChunck = SystemConfig.get('tx_balance_chuck_division')

    // The strategy to have faster swap upon trigger, and slower swap
    // for subsequence trade after the initial 
    let blockhash = txPool.mempoolTxns.recentBlockhash
    let units = 1000000
    let microLamports = 101337
    for(let i = 0; i < Math.floor(totalChunck / 3); i++) {
      await processSell(
        ata,
        ammId,
        state.mint, 
        {
          compute: {
            units,
            microLamports
          },
          blockhash
        }
      )

      units = 100000

      let newBlock = await connection.getLatestBlockhash(config.get('default_commitment') as Commitment)
      blockhash = newBlock.blockhash
    }
  }
}

const processTx = async (tx: TxPool, ata: PublicKey) => {
  try {
    for(const ins of tx.mempoolTxns.instructions) {
      const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
      if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
        const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
        
        if(decodedIx.hasOwnProperty('withdraw')) { // remove liquidity
          console.log(`Withdraw ${tx.mempoolTxns.signature}`)
          await processWithdraw(ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('deposit')) {
          console.log(`Deposit ${tx.mempoolTxns.signature}`)
          await processDeposit(ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('swapBaseIn')) {
          await processSwapBaseIn((decodedIx as any).swapBaseIn, ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('initialize2')) {
          console.log(`Initialize ${tx.mempoolTxns.signature}`)
          await processInitialize2(ins, tx, ata)
        }
      }
    }
  } catch(e) {
    console.log(e)
  }
}

(async () => {
  try {
    const { ata } = await setupWSOLTokenAccount(true, 0.07)
  
    if(!ata) { 
      logger.error('No WSOL Account initialize')
      return 
    }

    lookupTable = new BotLookupTable()
    botTokenAccount = new BotTokenAccount()
    existingMarkets = new ExistingRaydiumMarketStorage()

    const mempoolUpdates = mempool([RAYDIUM_AUTHORITY_V4_ADDRESS, payer.publicKey.toBase58()])
    for await (const update of mempoolUpdates) {
      processTx(update, ata) // You can process the updates as needed
    }
  } catch(e) {
    console.log(e)
  }
})();
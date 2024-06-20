/**
 * This tools is to speed up the process of retrieve the raydium pool state
 * listen to newly created pool state and store it in redis, that any user able to retrieve it
 */
import { redisClient } from "../adapter/redis";
import { confirmedConnection, connection, connectionAlt1 } from "../adapter/rpc";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS, config as SystemConfig } from "../utils";
import { BotgRPC } from "../library/grpc";
import { BlockHashStorage, CountLiquidityPoolStorage, MintStorage, PoolKeysStorage, TokenChunkStorage } from "../storage";
import { payer } from "../adapter/payer";
import { BotLiquidityState, LookupIndex, TxInstruction, TxPool } from "../types";
import { AccountChangeCallback, PublicKey, Transaction, VersionedTransactionResponse } from "@solana/web3.js";
import { RaydiumAmmCoder } from "../utils/coder";
import { Idl } from "@coral-xyz/anchor";
import raydiumIDL from '../idl/raydiumAmm.json'
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import sleep from "atomic-sleep";
import BN from "bn.js";
import { BotTransaction } from "../library/transaction";
import { BotLookupTable } from "../library";
import { logger } from "../utils/logger";
import { ConcurrentSet } from "../utils/concurrent-set";
import { countLiquidityPool, mints, tokenBalances, poolKeys, txBalanceUpdater, trackedAmm } from "../adapter/storage";
import { grpcs } from "../adapter/grpcs";
import { BotTradeTracker } from "../library/trade-tracker";
import { BotTrackedAmm } from "../library/tracked-amm";

const env = grpcs[0]

const TXS_COUNT = SystemConfig.get('payer_retrieve_txs_count')

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const updateTokenBalance = async (ammId: PublicKey, mint: PublicKey, amount: BN, lpCount: number | undefined) => {
  if(amount.isNeg()) { // SELL
    const prevBalance = await tokenBalances.get(ammId);
    if (prevBalance !== undefined && !prevBalance.remaining.isNeg()) {
      prevBalance.remaining = prevBalance.remaining.sub(amount.abs());

      // No more balance, remove from tracking
      if(prevBalance.remaining.isNeg()) {
        tokenBalances.isUsedUp(ammId)
        poolKeys.remove(ammId)
        BotTrackedAmm.unregister(ammId)
      } else {
        tokenBalances.set(ammId, prevBalance);
        BotTradeTracker.sellFinalized(ammId)
      }
    }
  } else { // BUY
    let chunk = amount.divn(SystemConfig.get('tx_balance_chuck_division'))
    BotTrackedAmm.register(ammId)
    tokenBalances.set(ammId, {
      total: amount,
      remaining: amount,
      chunk,
      isUsedUp: false,
      isConfirmed: true
    });
    BotTradeTracker.buyFinalized(ammId)

    if(lpCount === undefined) {
      await countLiquidityPool.set(ammId, 1)
    }
  }

  logger.info(`Token balance update ${ammId}`)
  return
}

const process = async (tx: TxPool, instruction: TxInstruction) => {
  
  const preTokenBalances = tx.mempoolTxns.preTokenBalances?.map((token: any) => ({
    mint: token.mint,
    owner: token.owner,
    amount: new BN(token.amount),
    decimals: token.decimals,
  })) || [];

  const postTokenBalances = tx.mempoolTxns.postTokenBalances?.map((token: any) => ({
    mint: token.mint,
    owner: token.owner,
    amount: new BN(token.amount),
    decimals: token.decimals,
  })) || [];

  let ammId = await getAmmId(tx, instruction)
  if(!ammId) { return }
  
  logger.info(`Processing ${ammId} | ${tx.mempoolTxns.signature}`)

  if(tx.mempoolTxns.err !== undefined && tx.mempoolTxns.err && tx.mempoolTxns.err > 0) {
    switch(tx.mempoolTxns.err) {
      case 40:
        logger.warn(`Token used up ${ammId}`)
        tokenBalances.isUsedUp(ammId)
        poolKeys.remove(ammId)
        break;
      case 38:
        poolKeys.remove(ammId)
      default:
        break
    }
    return
  }

  const state = await mints.get(ammId!)
  if(!state) { return }

  let count = await countLiquidityPool.get(ammId)
  
  let txAmount = BotTransaction.getBalanceFromTransaction(preTokenBalances, postTokenBalances, state.mint)
  
  updateTokenBalance(ammId, state.mint, txAmount, count)
}

const getTransaction = async (signature: string) : Promise<TxPool> => {
  // fetch transaction
  let transaction = null
  while(transaction === null) {
    transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    })

    sleep(1000)
  }

  let txPool = BotTransaction.formatTransactionToTxPool('payer_wallet_tx', transaction)
  
  return txPool
}

const getAmmId = async (txPool: TxPool, instruction: TxInstruction) => {

  const tx = txPool.mempoolTxns
  let ammId

  const accountIndexes: number[] = Array.from(instruction.accounts)
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)
  const ammIdAccountIndex = accountIndexes[1]
  if(ammIdAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = ammIdAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[ammIdAccountIndex])
  }

  return ammId
}

async function processTx(signature: string) {
  try {
    let tx = await getTransaction(signature)
    for(const ins of tx.mempoolTxns.instructions) {
      const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
      if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
  
        try {
          let dataBuffer = Buffer.from(ins.data as string, 'hex')
          const decodedIx = coder.instruction.decode(dataBuffer)
          
          if(decodedIx.hasOwnProperty('swapBaseIn')) {
            await process(tx, ins)
          }
          
        } catch(e:any) {
          console.log(tx.mempoolTxns.signature, e)
        }
      }
    }
  } catch(e) {
    console.log(e)
  }
}

async function getLatestTransactionInWallet() {
  const txs = await connection.getSignaturesForAddress(payer.publicKey, {
    limit: TXS_COUNT
  }, 'confirmed')

  for(const tx of txs) {
    if(!await txBalanceUpdater.exist(tx.signature)) {
      logger.info(`Missing signature: ${tx.signature}`)
      await txBalanceUpdater.set(tx.signature)
      await processTx(tx.signature)
    }
  }
}

async function run(data: any) {
  if(!data.account.account.txnSignature) {
    await getLatestTransactionInWallet()
    return
  }

  let signature = bs58.encode(data.account.account.txnSignature)
  
  if(!await txBalanceUpdater.exist(signature)) {
    logger.info(`Incoming  signature: ${signature}`)
    await txBalanceUpdater.set(signature)
    processTx(signature)
  }
}

// THERES BUG IN GEYSER - Return empty signature on failed transaction
// As a temporary fix, read the latest 10 signatures of the wallet, and check
// with the pool, if the signature does not exists, and execute the code
async function main() {

    // As start check the grpc
    await getLatestTransactionInWallet()
    
    let botGrpc = new BotgRPC(env.url, env.token)
    botGrpc.addAccount({
      name: 'my_wallet',
      owner: [],
      account: [payer.publicKey.toBase58()],
      filters: []
    })

    botGrpc.listen(
      run,
      () => {},
      () => {}
    )
}



main()
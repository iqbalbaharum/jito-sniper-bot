/**
 * This tools is to speed up the process of retrieve the raydium pool state
 * listen to newly created pool state and store it in redis, that any user able to retrieve it
 */
import { redisClient } from "../adapter/redis";
import { confirmedConnection, connection, connectionAlt1 } from "../adapter/rpc";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS, config as SystemConfig } from "../utils";
import { BotgRPC } from "../services/grpc";
import { BlockHashStorage, CountLiquidityPoolStorage, MintStorage, PoolKeysStorage, TokenChunkStorage } from "../storage";
import { payer } from "../adapter/payer";
import { BotLiquidityState, LookupIndex, TxInstruction, TxPool } from "../types";
import { PublicKey, Transaction, VersionedTransactionResponse } from "@solana/web3.js";
import { RaydiumAmmCoder } from "../utils/coder";
import { Idl } from "@coral-xyz/anchor";
import raydiumIDL from '../idl/raydiumAmm.json'
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import sleep from "atomic-sleep";
import BN from "bn.js";
import { BotTransaction } from "../services/transaction";
import { BotLookupTable } from "../services";
import { logger } from "../utils/logger";

const GRPC_URL = SystemConfig.get('grpc_1_url')
const GRPC_TOKEN = SystemConfig.get('grpc_1_token')

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)
let lookupTable: BotLookupTable = new BotLookupTable(redisClient, false)
let mints: MintStorage = new MintStorage(redisClient, true)
let tokenBalances: TokenChunkStorage = new TokenChunkStorage(redisClient, true)
let trackedPoolKeys = new PoolKeysStorage(redisClient, true)
let countLiquidityPool = new CountLiquidityPoolStorage(redisClient, true)

const updateTokenBalance = async (ammId: PublicKey, mint: PublicKey, amount: BN, lpCount: number | undefined) => {
  if(amount.isNeg()) { // SELL
    const prevBalance = await tokenBalances.get(ammId);
    if (prevBalance !== undefined && !prevBalance.remaining.isNeg()) {
      prevBalance.remaining = prevBalance.remaining.sub(amount.abs());

      // No more balance, remove from tracking
      if(prevBalance.remaining.isNeg()) {
        tokenBalances.isUsedUp(ammId)
        trackedPoolKeys.remove(ammId)
      } else {
        tokenBalances.set(ammId, prevBalance); 
      }
    }
  } else { // BUY
    let chunk = amount.divn(SystemConfig.get('tx_balance_chuck_division'))
    tokenBalances.set(ammId, {
      total: amount,
      remaining: amount,
      chunk,
      isUsedUp: false,
      isConfirmed: true
    });

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
    logger.warn(`Token used up ${ammId}`)
    switch(tx.mempoolTxns.err) {
      case 40:
        tokenBalances.isUsedUp(ammId)
        trackedPoolKeys.remove(ammId)
        break;
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
  logger.info(`Incoming signature: ${signature}`)
  // fetch transaction
  let transaction = null
  while(transaction === null) {
    transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    })

    sleep(1000)
  }

  let txPool = BotTransaction.formatTransactionToTxPool('payer_wallet_tx', transaction)
  console.log(txPool.mempoolTxns.err)
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
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
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

async function main() {
    let botGrpc = new BotgRPC(GRPC_URL, GRPC_TOKEN)
    botGrpc.addAccount({
      name: 'my_wallet',
      owner: [],
      account: [payer.publicKey.toBase58()],
      filters: []
    })

    botGrpc.listen(
      async (data) => {

        // THERES BUG IN GEYSER,
        // It return empty signature
        if(!data.account.account.txnSignature) {
          return
        }
        let signature = bs58.encode(data.account.account.txnSignature)
        processTx(signature)
      },
      () => {},
      () => {}
    )
    
}



main()
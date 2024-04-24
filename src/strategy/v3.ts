/**
 * Technique: Copy trade (ooo5qMf4R5ExWmnjGsb8ZD33UkmqBAnTtyN9D5Ne4Kn) + Reverse Dollar Cost Averaging (RDCA)
 */
import { AddressLookupTableAccount, Commitment, ComputeBudgetInstruction, LAMPORTS_PER_SOL, Logs, MessageAccountKeys, PublicKey, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { confirmedConnection, connection } from "../adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, Logger, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish, struct, u32, u8 } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { COMPUTE_BUDGET_ADDRESS, JUPITER_ADDRESS, OPENBOOK_V1_ADDRESS, RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils/const";
import { config as SystemConfig, config } from "../utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "../services/token-account";
import { BotLiquidity, BotLookupTable, getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet } from "../services";
import sleep from "atomic-sleep";
import { submitBundle } from "../services/bundle";
import { mainSearcherClient } from "../adapter/jito";
import { ArbIdea, TokenChunk, BotLiquidityState, LookupIndex, MempoolTransaction, TransactionCompute, TxInstruction, TxPool } from "../types";
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
import { CopyTrades, ExistingRaydiumMarketStorage } from "../storage";
import { fuseGenerators, mempool } from "../generators";
import { GrpcGenerator } from "../generators/grpc";
import { SignatureGenerator } from "../generators/signature";
import { redisClient } from "../adapter/redis";

// let trackedLiquidityPool: Set<string> = new Set<string>()
let tokenBalances: Map<string, TokenChunk> = new Map<string, TokenChunk>()
let rdcaTimers: Map<string, NodeJS.Timeout> = new Map()
let trackedPoolKeys: Map<string, LiquidityPoolKeys> = new Map<
  string,
  LiquidityPoolKeys>();
let mints: Map<string, BotLiquidityState> = new Map<
  string,
  BotLiquidityState
>();

let lookupTable: BotLookupTable
let copyTrades: CopyTrades

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

/**
 * Execute buy function
 * @param ammId 
 * @param ata 
 * @param amount 
 * @param blockhash 
 * @returns 
 */
const processBuy = async (
  ammId: PublicKey, 
  ata: PublicKey, 
  amount: BN,
  config: {
    blockhash: String
    compute: TransactionCompute
  }) => {
  
  const poolKeys = await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)

  if(!poolKeys) { return }

  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }

  if(!poolKeys) { return }
  
  logger.info(new Date(), `BUY ${info.mint.toBase58()}`)
  
  let adjustedAmount = amount.mul(new BN(SystemConfig.get('adjusted_percentage'))).div(new BN(100))

  let signature = await buyToken(
    poolKeys, 
    ata,
    adjustedAmount,
    config
  )

  if(!signature) { return }
  
  logger.info(`Buy TX send: ${signature}`)
  
  copyTrades.set(ammId, {
    originalAmount: amount,
    adjustedAmount
  })

  trackedPoolKeys.set(ammId.toBase58(), poolKeys)
  mints.set(ammId.toBase58(), {
    ammId,
    mint: info.mint,
    mintDecimal: info.decimal,
    isMintBase: info.isMintBase
  })

  return signature
}

async function processSell(
  ata: PublicKey,
  ammId: PublicKey,
  mint: PublicKey, 
  originalAmount: BN,
  config: {
    blockhash: String
    compute: TransactionCompute
  },
  poolKeys?: LiquidityPoolKeysV4) {
  
  if(!poolKeys) {
    poolKeys = trackedPoolKeys.get(ammId!.toBase58())
    if(!poolKeys) { return }
  }

  const balance = tokenBalances.get(mint.toBase58())
  if(balance === undefined) { return }
  
  if(originalAmount === undefined || originalAmount.isZero()) { return }

  let copyTradeData = copyTrades.get(ammId)
  
  if(copyTradeData === undefined || copyTradeData.adjustedAmount.isZero()) { return }

  const adjustedAmount = copyTradeData.adjustedAmount.mul(originalAmount).div(copyTradeData.originalAmount);

  const signature = await sellToken(
    poolKeys, 
    ata, 
    adjustedAmount,
    config
  )
  
  logger.info(new Date(), `SELL ${signature} | ${mint.toBase58()} ${originalAmount.toString()} | ${adjustedAmount.toString()}`)

  return signature
}

const buyToken = async (
  keys: LiquidityPoolKeysV4, 
  ata: PublicKey, 
  amount: BigNumberish, 
  config: {
    blockhash: String
    compute: TransactionCompute
  }) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'in',
      ata,
      amount,
      0,
      'in',
      config
    );
    
    // const arb: ArbIdea = {
    //   vtransaction: transaction,
    //   expectedProfit: new BN(0)
    // }

    // return await submitBundle(arb)

    return await BotTransaction.sendTransactionToMultipleRpcs(transaction)
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
    
    // const arb: ArbIdea = {
    //   vtransaction: transaction,
    //   expectedProfit: new BN(0)
    // }

    // return await submitBundle(arb)
    return await BotTransaction.sendTransactionToMultipleRpcs(transaction)
  } catch(e) {
    console.log(e)
  }
}

// Using Rever Dollar Cost Averaging technique, the bot would auto sell the token at specific interval
// over time. The first sell would always be 25%, and subsequent sell at 10%
// TODO:  Implement price tracker to decide how much subsequent token should be sold linearly. 
const startRDCA = async (
  ammId: PublicKey,
  mint: PublicKey,
  ata: PublicKey) => {
  const id = setInterval(async () => {

    const balance = tokenBalances.get(mint.toBase58());

    if(balance === undefined || balance.remaining.isNeg()) {
      const id = rdcaTimers.get(mint.toBase58())
      clearInterval(id)
    }

    if(balance !== undefined) {
      let percentage = 0

      if(balance.total.eq(balance.remaining)) {
        percentage = SystemConfig.get('rdca_1st_percentage')
      } else {
        percentage = SystemConfig.get('rdca_default_percentage')
      }

      logger.info(`Starting RDCA ${ammId}`)
      const sellAmount = balance.remaining.sub(balance.remaining.muln(percentage).divn(100));
    
      await processSell(
          ata,
          ammId,
          mint,
          sellAmount,
          {
            blockhash: '',
            compute: {
              microLamports: 0,
              units: 0
            }
          }
        ) 
    }
  }, SystemConfig.get('rdca_sell_interval'))

  rdcaTimers.set(mint.toBase58(), id)
}

// Most Raydium transaction is using swapBaseIn, so the bot need to figure out if this transaction
// is "in" @ "out" direction. This can be achieved by checking the mint token balance in transaction, 
// if mint token is negative, then it is sell, and if positive value it's buy
const processSwapBaseIn = async (
  accountIndexes: number[],
  txPool: TxPool,
  ata: PublicKey,
  computeUnits: number,
  computeMicroLamport: number
) => {
  
  const tx = txPool.mempoolTxns
 
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)
  let ammId: PublicKey | undefined
  let sourceTA: PublicKey | undefined
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
  let signerAccountIndex
  if(serumProgramId?.toBase58() === OPENBOOK_V1_ADDRESS) {
    sourceAccountIndex = accountIndexes[15]
    signerAccountIndex = accountIndexes[17]
  } else {
    sourceAccountIndex = accountIndexes[14]
    signerAccountIndex = accountIndexes[16]
  }

  if(sourceAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = sourceAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    sourceTA = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    sourceTA = new PublicKey(tx.accountKeys[sourceAccountIndex])
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
  
  if(!sourceTA || !ammId || !signer) { return }

  let txSolAmount = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, new PublicKey(WSOL_ADDRESS))

  // Listening to own wallet, to get balance confirmation.
  // Retrieve mint balance in the tx, and store in memory
  // Then, start RDCA process.
  // Everytime read from the payer wallet, update the balance of the token in wallet
  if(sourceTA.equals(ata) || signer.equals(payer.publicKey)) {
    const state = mints.get(ammId!.toBase58())
    if(!state) { return }

    let txAmount = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, state.mint)
    
    if(txAmount.isNeg()) { // WSOL swap to token
      tokenBalances.set(state.mint.toBase58(), {
        total: txAmount,
        remaining: txAmount,
        chuck: new BN(0),
        isConfirmed: false,
        isUsedUp: false
      });

      startRDCA(ammId, state.mint, ata)
    } else { // token swap to WSOL
      const prevBalance = tokenBalances.get(state.mint.toBase58());
      if (prevBalance !== undefined && !prevBalance.remaining.isNeg()) {
        prevBalance.remaining = prevBalance.remaining.sub(txAmount.abs());
        if(prevBalance.remaining.isNeg()) {
          const id = rdcaTimers.get(state.mint.toBase58())
          clearInterval(id)
          tokenBalances.delete(ammId.toBase58())
        } else {
          tokenBalances.set(state.mint.toBase58(), prevBalance); 
        }
      }
    }
    return
  }

  let compute = {
    compute: {
      units: computeUnits,
      microLamports: computeMicroLamport
    },
    blockhash: txPool.mempoolTxns.recentBlockhash
  }

  let isBuyTradeAction = false

  if(txSolAmount.isNeg()) { isBuyTradeAction = true } else { isBuyTradeAction = false }

  // Only listening on buy trade event only from the target account
  if(isBuyTradeAction) {
    logger.info(`BUY ${ammId}`)
    const signature = await processBuy(
      ammId,
      ata,
      txSolAmount.abs(),
      compute)
  }
}

const processTx = async (tx: TxPool, ata: PublicKey) => {
  try {
    let continueProcessing = false
    let computeUnit = 0
    let computeMicroLamport = 0
    let accountIndexes: number[] = []
    
    if(!tx.mempoolTxns.filter) { return }
    
    if(tx.mempoolTxns.filter.includes('oooEYsNtbAnQnkx6SMtVui9iwP4Eu3KuTGC6NAp2gk2_tx')) {
      if(tx.mempoolTxns.innerInstructions.length < 1) { return }
      for(const ins of tx.mempoolTxns.innerInstructions[0].instructions) {
        const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
        if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {

          const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
          if(decodedIx.hasOwnProperty('swapBaseIn')) {
            continueProcessing = true
            accountIndexes = Array.from(ins.accounts)
          }
        }
      }

      for(const ins of tx.mempoolTxns.instructions) {
        const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]

        if(programId === COMPUTE_BUDGET_ADDRESS) {
          const unitLayout = struct([u8("instruction"), u32("value")])
          const d = unitLayout.decode(ins.data as Buffer)
          if(d.instruction === 2) {
            computeUnit = d.value
          }

          if(d.instruction === 3) {
            computeMicroLamport = d.value
          }
        }
      }

      if(continueProcessing) {
        console.log(`Signature: ${tx.mempoolTxns.signature}`)
        await processSwapBaseIn(accountIndexes, tx, ata, computeUnit, computeMicroLamport)
      }
    }

    if(tx.mempoolTxns.filter.includes('wallet_tx')) {
      for(const ins of tx.mempoolTxns.instructions) {
        const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
        if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
          const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
          
          if(decodedIx.hasOwnProperty('swapBaseIn')) {
            console.log(`My wallet: ${tx.mempoolTxns.signature}`)
            await processSwapBaseIn(Array.from(ins.accounts), tx, ata, 0, 0)
          }
        }
      }
    }

  } catch(e) {
    console.log(e)
  }
}

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

(async () => {
  try {

    const { ata } = await setupWSOLTokenAccount(true, 0.3)
    
    if(!ata) { 
      logger.error('No WSOL Account initialize')
      return 
    }

    lookupTable = new BotLookupTable(redisClient, true)
    copyTrades =  new CopyTrades()

    const generators: AsyncGenerator<TxPool>[] = [];

    const geyserPool: GrpcGenerator = new GrpcGenerator('geyser', config.get('grpc_1_url'), config.get('grpc_1_token'))
    geyserPool.addTransaction('oooEYsNtbAnQnkx6SMtVui9iwP4Eu3KuTGC6NAp2gk2_tx', {
      vote: false,
      failed: false,
      accountInclude: ['oooEYsNtbAnQnkx6SMtVui9iwP4Eu3KuTGC6NAp2gk2'],
      accountExclude: [],
      accountRequired: [],
    })

    geyserPool.addTransaction('wallet_tx', {
      vote: false,
      failed: false,
      accountInclude: [payer.publicKey.toBase58()],
      accountExclude: [],
      accountRequired: [],
    })

    try {
      generators.push(geyserPool.listen())
    } catch(e: any) {
      console.log(e.toString())
    }

    const updates = fuseGenerators(generators)

    // if(config.get('mode') === 'development') {
    //   onBundleResult()
    // }

    for await (const update of updates) {
      if(update) {
        processTx(update, ata)
      }
    }

  } catch(e) {
    console.log(e)
  }
})();
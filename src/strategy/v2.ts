import { AddressLookupTableAccount, Commitment, LAMPORTS_PER_SOL, Logs, MessageAccountKeys, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { connection } from "../adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { JUPITER_ADDRESS, OPENBOOK_V1_ADDRESS, RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils/const";
import { config } from "../utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "../services/token-account";
import { BotLiquidity, BotLookupTable, getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet } from "../services";
import sleep from "atomic-sleep";
import { submitBundle } from "../services/bundle";
import { mainSearcherClient } from "../adapter/jito";
import { ArbIdea, BotLiquidityState, LookupIndex, MempoolTransaction, TxInstruction, TxPool } from "../types";
import { BotTransaction, getAmmIdFromSignature } from "../services/transaction";
import { logger } from "../utils/logger";
import { RaydiumAmmCoder } from "../utils/coder";
import raydiumIDL from '../idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";
import { BotError } from "../types/error";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import { IxSwapBaseIn } from "../utils/coder/layout";
import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { payer } from "../adapter/payer";
import { ExistingRaydiumMarketStorage } from "../storage";
import { mempool } from "../generators";
import { preSimulationFilter } from "../generators/pre-simulation-filter";

type V3BundleInTransit = {
  timestamp: number,
  poolKeys: LiquidityPoolKeysV4
  state: BotLiquidityState
}

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


let tokenBalances: Map<string, BN> = new Map<string, BN>()
let bundleInTransit: Map<string, V3BundleInTransit> = new Map<string, V3BundleInTransit>()
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
  const poolKeys = await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)
  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)

  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }
  
  logger.info(new Date(), `BUY ${info.mint.toBase58()}`)

  if(!poolKeys) { return }
  
  let signature = await buyToken(
    poolKeys, 
    ata,
    config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL,
    new BN(0 * LAMPORTS_PER_SOL),
    blockhash
  )

  if(!signature) { return }

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
    return await BotTransaction.sendTransaction(transaction, config.get('default_commitment') as Commitment)
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
      amount,
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
    
    // let expected = new BN(0)
    // if(!expectedProfit.isZero()) {
    //   expected = expectedProfit
    // }
  
    // const arb: ArbIdea = {
    //   vtransaction: transaction,
    //   expectedProfit: expected
    // }

    // return await submitBundle(arb)
    return await BotTransaction.sendTransaction(transaction, config.get('default_commitment') as Commitment)
  } catch(e) {
    console.log(e)
  }
}

const getAmmIdFromMempoolTx = async (tx: MempoolTransaction, instruction: TxInstruction) => {
  const accountIndexes: number[] = Array.from(instruction.accounts)
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
  if(countLiquidityPool.has(ammId.toBase58())) {
    let count: number = countLiquidityPool.get(ammId.toBase58())!
    countLiquidityPool.set(ammId.toBase58(), count - 1)
  }
}

// Buy token after token release
const processDeposit = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  
  const tx = txPool.mempoolTxns

  let ammId: PublicKey | undefined = await getAmmIdFromMempoolTx(tx, instruction)
  if(!ammId) { return }
  
  if(!countLiquidityPool.has(ammId.toBase58())) {
    countLiquidityPool.set(ammId.toBase58(), 1)
  } else {
    let count: number = countLiquidityPool.get(ammId.toBase58()) || 0
    countLiquidityPool.set(ammId.toBase58(), count + 1)
  }

  // Check if we this market has already been bought
  if(!existingMarkets.isExisted(ammId)) {
    const signature = await processBuy(ammId, ata, txPool.mempoolTxns.recentBlockhash)
    logger.info(`Buy TX send: ${signature}`)
  }
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

  let count = countLiquidityPool.get(ammId.toBase58())
  if(!count || count != 0) {
    return
  }

  const poolKeys = trackedPoolKeys.get(ammId!.toBase58())
  if(!poolKeys) { return }

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
    let balance = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, state.mint)
    if(balance.isNeg()) {
      const prevBalance = tokenBalances.get(state.mint.toBase58());
      if (prevBalance !== undefined) {
        const netChange = balance.sub(prevBalance.abs());
        tokenBalances.set(state.mint.toBase58(), netChange);
      } else {
          // Previous balance not found, set current balance directly
          tokenBalances.set(state.mint.toBase58(), balance);
      }
    } else {
      tokenBalances.set(state.mint.toBase58(), balance)
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

  if(isBuyTradeAction && amount >= config.get('min_sol_trigger')) {

    const balance = tokenBalances.get(state.mint.toBase58())
    
    logger.info(new Date(), `SELL ${state.mint.toBase58()} ${amount}`)

    if(balance && !balance.isZero()) {
      if(!balance.isNeg()) {
        logger.info(new Date(), `SELL ${state.mint.toBase58()} ${amount} ${balance?.toString()}`)
        const tradeSize = balance.divn(2)
        const signature = await sellToken(
          poolKeys as LiquidityPoolKeysV4, 
          ata, 
          tradeSize, 
          new BN(amount * LAMPORTS_PER_SOL),
          txPool.mempoolTxns.recentBlockhash
        )
  
        tokenBalances.set(state.mint!.toBase58(), balance.sub(tradeSize))
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
}

const processTx = async (tx: TxPool, ata: PublicKey) => {
  try {
    for(const ins of tx.mempoolTxns.instructions) {
      const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
      if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
        const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
        
        if(decodedIx.hasOwnProperty('withdraw')) { // remove liquidity
          await processWithdraw(ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('deposit')) {
          await processDeposit(ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('swapBaseIn')) {
          await processSwapBaseIn((decodedIx as any).swapBaseIn, ins, tx, ata)
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

  const mempoolUpdates = mempool([RAYDIUM_AUTHORITY_V4_ADDRESS, payer.publicKey.toBase58()])
  for await (const update of mempoolUpdates) {
    processTx(update, ata) // You can process the updates as needed
  }

  onBundleResult()
})();
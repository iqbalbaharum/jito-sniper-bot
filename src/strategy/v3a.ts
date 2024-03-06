import { AddressLookupTableAccount, Commitment, LAMPORTS_PER_SOL, Logs, MessageAccountKeys, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { connection } from "../adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { JUPITER_ADDRESS, OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils/const";
import { config } from "../utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "../services/token-account";
import { BotLiquidity, BotLookupTable, getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet } from "../services";
import sleep from "atomic-sleep";
import { submitBundle } from "../services/bundle";
import { mainSearcherClient } from "../adapter/jito";
import { ArbIdea, BotLiquidityState, LookupIndex, TxInstruction, TxPool } from "../types";
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
let tokenBalances: Map<string, BN> = new Map<string, BN>()
let bundleInTransit: Map<string, V3BundleInTransit> = new Map<string, V3BundleInTransit>()
let lookupTable: BotLookupTable
let botTokenAccount: BotTokenAccount
let existingMarkets: ExistingRaydiumMarketStorage

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const getBalance = async (mint: PublicKey, poolKeys: LiquidityPoolKeysV4, reset: boolean = false): Promise<BN> => {
  let balance: BN | undefined = new BN(0)

  if(!reset) {
    balance = tokenBalances.get(mint.toBase58())
  }

  if(!balance) {
    const taBalance = await getTokenInWallet(poolKeys)
    if(taBalance && taBalance.length > 0) {
      if(taBalance[0].balance > 0) {
        balance = new BN(taBalance[0].balance)
        tokenBalances.set(mint.toBase58(), balance)
      }
    }

    sleep(1000)
  }

  return balance!
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
        if(bundleInTransit.has(bundleId)) {
          const bundle = bundleInTransit.get(bundleId)
          if(!bundle) { return }
          // to make the request faster, initialize token balance after purchase confirm
          getBalance(bundle.state.mint, bundle.poolKeys, true)
        }
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

const processBuy = async (ammId: PublicKey, ata: PublicKey) => {
  const poolKeys = await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)
  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)

  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }
  
  logger.info(new Date(), `BUY ${info.mint.toBase58()}`)
  const block = await connection.getLatestBlockhash({
    commitment: 'finalized'
  })

  if(!poolKeys) { return }
  
  let bundleId = await buyToken(
    poolKeys, 
    ata,
    config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL,
    new BN(0 * LAMPORTS_PER_SOL),
    block.blockhash
  )

  if(!bundleId) { return }

  trackedPoolKeys.set(ammId.toBase58(), poolKeys)
  mints.set(ammId.toBase58(), {
    ammId,
    mint: info.mint,
    mintDecimal: info.decimal,
    isMintBase: info.isMintBase
  })

  // add into the record
  existingMarkets.add(ammId)

  bundleInTransit.set(bundleId, {
    timestamp: new Date().getTime(),
    poolKeys,
    state: {
      ammId,
      mint: info.mint,
      mintDecimal: info.decimal,
      isMintBase: info.isMintBase
    }
  })
}

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, expectedProfit: BN, blockhash?: string) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'in',
      ata,
      amount,
      blockhash,
      {
        compute: {
          microLamports: 10000,
          units: 101337
        }
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

    return await submitBundle(arb)
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
      blockhash,
      {
        compute: {
          microLamports: 8000000,
          units: 101337
        }
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

    return await submitBundle(arb)

  } catch(e) {
    console.log(e)
  }
}

// What we care about is only ammId from the Raydium instruction
// For LP withdrawal instruction, the location of "ammId" is at position #1
const processWithdraw = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  
  const tx = txPool.mempoolTxns

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

  if(!ammId) { return }
  
  // Check if we this market has already been bought
  if(!existingMarkets.isExisted(ammId)) {
    await processBuy(ammId, ata)
  }
}

// Most Raydium transaction is using swapBaseIn, so the bot need to figure out if this transaction
// is "in" @ "out" direction. This can be achieved by checking UserSourceTokenAccount and check if it's similar
// as the signer ATA account. If it's a WSOL, then it's a "in" process, and vice versa
// For swapBaseIn instruction, the position of "UserSourceTokenAccount" is at position #16
const processSwapBaseIn = async (swapBaseIn: IxSwapBaseIn, instruction: TxInstruction, txPool: TxPool, ata: PublicKey, blockhash: string) => {
  
  const tx = txPool.mempoolTxns

  // Find the transaction is buy or sell by checking 
  const accountIndexes: number[] = Array.from(instruction.accounts)
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)
  let sourceTA: PublicKey | undefined
  let ammId: PublicKey | undefined
  let serumProgramId: PublicKey | undefined

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
  if(serumProgramId?.toBase58() === OPENBOOK_V1_ADDRESS) {
    sourceAccountIndex = accountIndexes[15]
  } else {
    sourceAccountIndex = accountIndexes[14]
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

  if(!sourceTA || !ammId) { return }
  // BUG: The bot tracked the ammId before tx is finalize, so it appear in request
  // To counter the bug, check if sourceTA is similar with user WSOL address
  if(sourceTA.equals(ata)) { return }

  let account = await botTokenAccount.getTokenAccountInfo(sourceTA)
  if(!account) { return }

  let amount = parseFloat(swapBaseIn.amountIn.toString()) / LAMPORTS_PER_SOL
  
  if(account?.mint.toBase58() === WSOL_ADDRESS && amount >= config.get('min_sol_trigger')) {
    const state = mints.get(ammId!.toBase58())
    if(!state) { return }

    const balance = await getBalance(state?.mint, poolKeys!)
    logger.info(new Date(), `SELL ${state.mint.toBase58()} ${amount}`)

    const block = await connection.getLatestBlockhash({
      commitment: 'confirmed'
    })

    if(balance && !balance.isZero()) {
      await sellToken(
        poolKeys as LiquidityPoolKeysV4, 
        ata, 
        balance.mul(new BN(10 ** state.mintDecimal)), 
        new BN(amount * LAMPORTS_PER_SOL),
        block.blockhash
      )
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
        } else if(decodedIx.hasOwnProperty('swapBaseIn')) {
          await processSwapBaseIn((decodedIx as any).swapBaseIn, ins, tx, ata, tx.mempoolTxns.recentBlockhash)
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

  for await (const update of mempool()) {
    processTx(update, ata) // You can process the updates as needed
  }

  console.log('listening')
  // runGeyserListener(ata)
  onBundleResult()
})();
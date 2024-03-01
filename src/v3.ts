import { Commitment, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { connection } from "./adapter/rpc";
import { BigNumberish, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "./utils/const";
import { config } from "./utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "./services/tokenaccount";
import { BotLiquidity, getTokenInWallet } from "./services";
import sleep from "atomic-sleep";
import { submitBundle } from "./services/bundle";
import { fastTrackSearcherClient } from "./adapter/jito";
import { ArbIdea, BotLiquidityState } from "./types";
import { BotTransaction, getAmmIdFromSignature } from "./services/transaction";
import { logger } from "./utils/logger";
import { RaydiumAmmCoder } from "./utils/coder";
import raydiumIDL from './idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";
import { BotError } from "./types/error";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { IxSwapBaseIn } from "./utils/coder/layout";

type V3BundleInTransit = {
  timestamp: number,
  poolKeys: LiquidityPoolKeysV4
  state: BotLiquidityState
}

let trackedLiquidityPool: Set<string> = new Set<string>()
let trackedPoolKeys: Map<string, LiquidityPoolKeys> = new Map<
  string,
  LiquidityPoolKeys>();
let mints: Map<string, BotLiquidityState> = new Map<
  string,
  BotLiquidityState
>();
let tokenBalances: Map<string, BN> = new Map<string, BN>()
let bundleInTransit: Map<string, V3BundleInTransit> = new Map<string, V3BundleInTransit>()

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const getBalance = async (mint: PublicKey, poolKeys: LiquidityPoolKeysV4): Promise<BN> => {
  let balance = tokenBalances.get(mint.toBase58())
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
  fastTrackSearcherClient.onBundleResult(
    (bundleResult) => {
      const bundleId = bundleResult.bundleId;
      const isAccepted = bundleResult.accepted;
      const isRejected = bundleResult.rejected;
      if (isAccepted) {
        if(bundleInTransit.has(bundleId)) {
          const bundle = bundleInTransit.get(bundleId)
          if(!bundle) { return }
          logger.info(`Listening for token ${bundle!.state.mint.toBase58()} activities`)
          trackedPoolKeys.set(bundle!.state.ammId.toBase58(), bundle!.poolKeys)
          mints.set(bundle!.state.ammId.toBase58(), bundle!.state)
          // to make the request faster, initialize token balance after purchase confirm
          getBalance(bundle.state.mint, bundle.poolKeys)
        }
      }

      if (isRejected) {
        logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      }
    },
    (error) => {
      logger.error(error);
    },
  );
};

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, expectedProfit: BN, blockhash?: string): Promise<string> => {
  const transaction = await BotLiquidity.makeSimpleSwapInstruction(
    keys,
    'in',
    ata,
    amount,
    blockhash,
    {
      compute: {
        microLamports: 100000,
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
}

const sellToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BN, expectedProfit: BN, blockhash: string) => {
  const transaction = await BotLiquidity.makeSimpleSwapInstruction(
    keys,
    'out',
    ata,
    amount.div(new BN(2)),
    blockhash,
    {
      compute: {
        microLamports: 1000000,
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
}

/**
 * Run `onProgramUpdate` to listen to swapBaseIn (swap In) activities after LP removed triggered
 * @param ata 
 */
const runJitoMempoolListener = (ata: PublicKey) => {
  try {
    fastTrackSearcherClient.onProgramUpdate(
      [new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS)],
      [],
      (transactions: VersionedTransaction[]) => {
        transactions.map(async (transaction : VersionedTransaction) => {
          if(!transaction.message) { return }
          
          let mint: PublicKey | undefined = undefined
          let ammId: PublicKey | undefined = undefined
          let poolKeys: LiquidityPoolKeysV4 | undefined
          let state: BotLiquidityState | undefined
          let sourceTA: PublicKey | undefined
          let transactionValue = 0

          for (let ins of transaction.message.compiledInstructions) {
            let programId = transaction.message.staticAccountKeys[ins.programIdIndex]
            
            const processSwapBaseIn = async (swapBaseIn: IxSwapBaseIn) => {
              const { amountIn } = swapBaseIn
              transactionValue = Number.parseFloat(amountIn.toString()) / LAMPORTS_PER_SOL
              poolKeys = trackedPoolKeys.get(ammId!.toBase58())
              state = mints.get(ammId!.toBase58())
            }

            // Raydium
            if(programId && ins.data.length > 0 && programId?.toBase58() === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
              sourceTA = transaction.message.staticAccountKeys[ins.accountKeyIndexes[15]]
              // destTA = transaction.message.staticAccountKeys[ins.accountKeyIndexes[16]]
              // requesterAddress = transaction.message.staticAccountKeys[ins.accountKeyIndexes[17]]
              
              const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
              ammId = transaction.message.staticAccountKeys[ins.accountKeyIndexes[1]]

              if(!ammId) { return }

              if(trackedLiquidityPool.has(ammId.toBase58()) && decodedIx.hasOwnProperty('swapBaseIn')) {
                processSwapBaseIn((decodedIx as any).swapBaseIn)
              }
            }
          }

          // Only proceed after we got all the information
          // To confirm the transaction is not a swap out (selling)
          if(state && state.mint && ammId && poolKeys && sourceTA) {
            const info = await BotTokenAccount.getTokenAccountInfo(sourceTA)
            if(!info?.value?.data) { return }
            const parsedInfo = (info?.value?.data as any).parsed
            if(parsedInfo.info.mint === WSOL_ADDRESS) {
              // if(transactionValue > 0.0001) {
                
              // }
              logger.warn(`${bs58.encode(transaction.signatures[0])}`)
                logger.info(new Date(), `SELL ${state.mint.toBase58()} ${transactionValue}`)
                poolKeys = trackedPoolKeys.get(ammId!.toBase58())
                state = mints.get(ammId!.toBase58())
            }
            
            // const balance = await getBalance(state?.mint, poolKeys!)
            // logger.info(new Date(), `SELL ${state.mint.toBase58()} ${transactionValue}`)
            // await sellToken(
            //   poolKeys as LiquidityPoolKeysV4, 
            //   ata, 
            //   balance.mul(new BN(10 ** state.mintDecimal)), 
            //   new BN(transactionValue * LAMPORTS_PER_SOL),
            //   transaction.message.recentBlockhash
            // )
          }

        })
      },
      (e: any) => {
        console.log(e)
      }
    )
  } catch(e) {
    console.log(e)
  }
}

const processRemovedLP = async (ata: PublicKey, ammId: PublicKey, signature: string) => {
  try {
    const poolKeys = await BotTransaction.generatePoolKeysFromSignature(signature)
    if(!poolKeys) { return }

    const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)

    // Cancel process if pair is not WSOL
    if(info.mint === undefined) { return }

    logger.info(new Date(), `BUY ${info.mint.toBase58()}`)
    const block = await connection.getLatestBlockhash({
      commitment: 'confirmed'
    })

    trackedLiquidityPool.add(poolKeys.id.toBase58())

    let bundleId = await buyToken(
      poolKeys, 
      ata,
      config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL,
      new BN(0 * LAMPORTS_PER_SOL),
      block.blockhash
    )
    
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
  } catch(e: any) {
    console.log(e)
  }
}

/**
 * Listen to LP removed events.
 * Note: Originally try to listen using 'onProgramAccountChange' (web3js) @ 'onProgramUpdate' (jito) but it doesnt work as effective as 
 * 'onLogs' to detect removed LP
 * @param ata 
 */
const listenToLPRemovedEvent = (ata: PublicKey) => {
  const subscriptionId = connection.onLogs(
    new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
    async (logs, context) => {
      if (logs.err) {
        return;
      }

      let logSequence = [];

      for (const l of logs.logs) {
        // Remove LP
        if (l.includes('Transfer')) {
          logSequence.push('T');
        } else if (l.includes('Burn')) {
          logSequence.push('B');
        }
      }

      if (logSequence.join(',') === 'T,T,B') {
        const ammId = await BotTransaction.getAmmIdFromSignature(logs.signature)
        if(ammId) {
          processRemovedLP(ata, ammId, logs.signature)
        }
      }
    },
    config.get('default_commitment') as Commitment
  );
}


(async () => {
  const { ata } = await setupWSOLTokenAccount(true, 0.01)
  
  if(!ata) { 
    logger.error('No WSOL Account initialize')
    return 
  }

  runJitoMempoolListener(ata)
  listenToLPRemovedEvent(ata)
  onBundleResult()
})();
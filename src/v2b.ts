import { Commitment, KeyedAccountInfo, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { connection } from "./adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "./utils/const";
import { config } from "./utils/config";
import { setupWSOLTokenAccount } from "./services/token-account";
import { getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet, swap } from "./services";
import sleep from "atomic-sleep";
import { submitBundle } from "./services/bundle";
import { fastTrackSearcherClient } from "./adapter/jito";
import { ArbIdea, BotLiquidityState } from "./types";
import { getAmmIdFromSignature, getTokenMintFromSignature } from "./services/transaction";
import { logger } from "./utils/logger";
import { BundleInTransit } from "./types/bundleInTransit";
import { RaydiumAmmCoder } from "./utils/coder";
import raydiumIDL from './idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";

let trackedLiquidityPool: Set<string> = new Set<string>()
let removedLiquidityPool: Set<string> = new Set<string>()
let trackedPoolKeys: Map<string, LiquidityPoolKeys> = new Map<
  string,
  LiquidityPoolKeys>();
let mints: Map<string, BotLiquidityState> = new Map<
  string,
  BotLiquidityState
>();
let tokenBalances: Map<string, BN> = new Map<string, BN>()
let bundleInTransit: Map<string, BundleInTransit> = new Map<string, BundleInTransit>()

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
          logger.info(`Listening for token ${bundle!.mint.toBase58()} activities`)
          trackedPoolKeys.set(bundle!.mint.toBase58(), bundle!.poolKeys)
          mints.set(bundle!.state.ammId.toBase58(), bundle!.state)
        }
      }

      // if (isRejected) {
      //   logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      // }
    },
    (error) => {
      logger.error(error);
    },
  );
};

const listenToLPRemoved = () => {
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
        const ammId = await getAmmIdFromSignature(logs.signature)
        if(ammId) {
          removedLiquidityPool.add(ammId.toBase58())
        }
      }
    },
    config.get('default_commitment') as Commitment
  );
}

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, expectedProfit: BN, blockhash?: string): Promise<string> => {
  const { transaction } = await swap(
    keys,
    'in',
    ata,
    amount,
    blockhash
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
  const { transaction } = await swap(
    keys,
    'out',
    ata,
    amount.div(new BN(2)),
    blockhash
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

// The fastest so far is Jito
const runJitoMempoolListener = (ata: PublicKey) => {
  try {
    fastTrackSearcherClient.onProgramUpdate(
      [new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS)],
      [],
      (transactions: VersionedTransaction[]) => {
        transactions.map(async transaction => {
          for (let ins of transaction.message.compiledInstructions) {
            if(ins.data.length > 0 && transaction.message.staticAccountKeys[ins.programIdIndex].toBase58() === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
              const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
              const ammId = transaction.message.staticAccountKeys[ins.accountKeyIndexes[1]]
              if(removedLiquidityPool.has(ammId.toBase58()) && decodedIx.hasOwnProperty('swapBaseIn')) {
                const { amountIn } = (decodedIx as any).swapBaseIn
                const transactionValue = amountIn.toNumber() / LAMPORTS_PER_SOL
                if(transactionValue > config.get('min_sol_trigger')) {
                  const poolKeys = trackedPoolKeys.get(ammId.toBase58())
                  const state = mints.get(ammId.toBase58())
                  if(poolKeys && state) {
                    const balance = await getBalance(state?.mint, poolKeys!)
                    logger.info(new Date(), `SELL ${state.mint.toBase58()}`)
                    await sellToken(
                      poolKeys as LiquidityPoolKeysV4, 
                      ata, 
                      balance.mul(new BN(10 ** state.mintDecimal)), 
                      new BN(transactionValue * LAMPORTS_PER_SOL),
                      transaction.message.recentBlockhash
                    )
                  }
                }
              }
            }
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

const runListener = async (ata: PublicKey) => {
  
  const subscriptionId = connection.onProgramAccountChange(
    new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
    async (updatedAccountInfo: KeyedAccountInfo) => {
      let accountData = LIQUIDITY_STATE_LAYOUT_V4.decode(
        updatedAccountInfo.accountInfo.data
      );
      
      // 
      try {
        let state = await getLiquidityMintState(accountData)

        let SOLIn: BN
        let SOLOut: BN
        let tokenIn: BN
        let tokenOut: BN
        let SOLDenominator: BN
        let tokenDenominator: BN

        if(!state.isMintBase) {
          SOLIn = accountData.swapBaseInAmount
          SOLOut = accountData.swapBaseOutAmount
          tokenIn = accountData.swapQuoteInAmount
          tokenOut = accountData.swapQuoteOutAmount
          SOLDenominator = new BN(10).pow(accountData.baseDecimal);
          tokenDenominator = new BN(10).pow(accountData.quoteDecimal);
        } else {
          SOLIn = accountData.swapQuoteInAmount
          SOLOut = accountData.swapQuoteOutAmount
          tokenIn = accountData.swapBaseInAmount
          tokenOut = accountData.swapBaseOutAmount
          SOLDenominator = new BN(10).pow(accountData.quoteDecimal);
          tokenDenominator = new BN(10).pow(accountData.baseDecimal);
        }

        const poolOpenTime = accountData.poolOpenTime.toNumber();
        if(new Date().getTime() / 1000 < poolOpenTime) {
          return
        }
        
        if(SOLOut.isZero()) {
          if(!trackedLiquidityPool.has(state.mint.toBase58())) {
            trackedLiquidityPool.add(state.mint.toBase58())
            const poolKeys = await getAccountPoolKeysFromAccountDataV4(
              updatedAccountInfo.accountId,
              accountData
            )
            
            logger.info(new Date(), `BUY ${state.mint.toBase58()}`)
            const block = await connection.getLatestBlockhash({
              commitment: 'confirmed'
            })

            let bundleId = await buyToken(poolKeys, ata, config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL, new BN(0 * LAMPORTS_PER_SOL), block.blockhash)
            bundleInTransit.set(bundleId, {
              mint: state.mint,
              timestamp: new Date().getTime(),
              poolKeys,
              state
            })
          }
        }
      } catch(e: any) {
        // console.log(e.toString())
      }
    },
    config.get('default_commitment') as Commitment,
    [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
          bytes: OPENBOOK_V1_ADDRESS,
        },
      }
    ]
  );

  console.log('Starting web socket, subscription ID: ', subscriptionId);
}


(async () => {
  const { ata } = await setupWSOLTokenAccount(true, 0.01)
  
  if(!ata) { 
    logger.error('No WSOL Account initialize')
    return 
  }

  runListener(ata)
  runJitoMempoolListener(ata)
  listenToLPRemoved()
  onBundleResult()
})();
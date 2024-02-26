import { Commitment, KeyedAccountInfo, LAMPORTS_PER_SOL, MessageCompiledInstruction, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { connection } from "./adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, TOKEN_PROGRAM_ID, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "./utils/const";
import { config } from "./utils/config";
import { setupWSOLTokenAccount } from "./controller/tokenaccount";
import { getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet, swap } from "./controller";
import sleep from "atomic-sleep";
import { submitBundle } from "./controller/bundle";
import { fastTrackSearcherClient } from "./adapter/jito";
import { ArbIdea, BotLiquidityState } from "./types";
import { getTokenMintFromSignature } from "./controller/transaction";
import { logger } from "./utils/logger";
import { BundleInTransit } from "./types/bundleInTransit";
import bs58 from 'bs58'
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

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
        logger.info(
          `Bundle ${bundleId} accepted in slot ${bundleResult.accepted?.slot}`,
        );
        if(bundleInTransit.has(bundleId)) {
          const bundle = bundleInTransit.get(bundleId)
          trackedPoolKeys.set(bundle!.mint.toBase58(), bundle!.poolKeys)
          mints.set(bundle!.mint.toBase58(), bundle!.state)
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
        const tokenMint = await getTokenMintFromSignature(logs.signature)
        if(tokenMint) {
          removedLiquidityPool.add(tokenMint)
        }
      }
    },
    config.get('default_commitment') as Commitment
  );
}

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, expectedProfit?: BN): Promise<string> => {
  const { transaction } = await swap(
    keys,
    'in',
    ata,
    amount
  );
  
  let expected = new BN(0)
  if(expectedProfit) {
    expected = expectedProfit
  }

  const arb: ArbIdea = {
    vtransaction: transaction,
    expectedProfit: expected
  }

  return await submitBundle(arb)
}

const sellToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, expectedProfit?: BN) => {
  const { transaction } = await swap(
    keys,
    'out',
    ata,
    amount
  );
  
  let expected = new BN(0)
  if(expectedProfit) {
    expected = expectedProfit
  }

  const arb: ArbIdea = {
    vtransaction: transaction,
    expectedProfit: expected
  }

  return await submitBundle(arb)
}

const checkNewLP = (tx: VersionedTransaction, ins: MessageCompiledInstruction) => {
  if (ins.data[0] == 1 && ins.data[1] == 254) {
    const now = new Date().toISOString();
    logger.info(`tx sig: ${bs58.encode(tx.signatures[0])}`)
    console.log("tx ins new lp: ", ins, ins.data)
  }
}

const checkRemoveLP = (tx: VersionedTransaction, ins: MessageCompiledInstruction) => {

  const accKeyIdx = ins.accountKeyIndexes[0]
  const foundAcc = tx.message.staticAccountKeys[accKeyIdx]

  if (ins.data[0] == 4 && foundAcc != undefined && foundAcc.toString() == TOKEN_PROGRAM_ID.toBase58()) {
    const now = new Date().toISOString();
    logger.info(`tx sig: ${bs58.encode(tx.signatures[0])}`)
    console.log("tx ins remove lp: ", tx.message.staticAccountKeys, ins, ins.data)
    logger.info("tx ins found: ", accKeyIdx, foundAcc)
  }
}

const runListener = async () => {
  // const { ata } = await setupWSOLTokenAccount(true, 0.1)
  
  fastTrackSearcherClient.onProgramUpdate(
    [new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS)],
    [],
    (transactions: VersionedTransaction[]) => {
      transactions.map(tx => {
        for (let ins of tx.message.compiledInstructions) {
          checkNewLP(tx, ins)
          checkRemoveLP(tx, ins)
        }
      })
    },
    (e: any) => {
      console.log(e)
    }
  )
  // const subscriptionId = connection.onProgramAccountChange(
  //   new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
  //   async (updatedAccountInfo: KeyedAccountInfo) => {
  //     let accountData = LIQUIDITY_STATE_LAYOUT_V4.decode(
  //       updatedAccountInfo.accountInfo.data
  //     );
      
  //     // 
  //     try {
  //       let state = await getLiquidityMintState(accountData)
  //       let SOLIn: BN
  //       let SOLOut: BN
  //       let tokenIn: BN
  //       let tokenOut: BN
  //       let SOLDenominator: BN
  //       let tokenDenominator: BN

  //       if(!state.isMintBase) {
  //         SOLIn = accountData.swapBaseInAmount
  //         SOLOut = accountData.swapBaseOutAmount
  //         tokenIn = accountData.swapQuoteInAmount
  //         tokenOut = accountData.swapQuoteOutAmount
  //         SOLDenominator = new BN(10).pow(accountData.baseDecimal);
  //         tokenDenominator = new BN(10).pow(accountData.quoteDecimal);
  //       } else {
  //         SOLIn = accountData.swapQuoteInAmount
  //         SOLOut = accountData.swapQuoteOutAmount
  //         tokenIn = accountData.swapBaseInAmount
  //         tokenOut = accountData.swapBaseOutAmount
  //         SOLDenominator = new BN(10).pow(accountData.quoteDecimal);
  //         tokenDenominator = new BN(10).pow(accountData.baseDecimal);
  //       }

  //       const poolOpenTime = accountData.poolOpenTime.toNumber();
  //       if(new Date().getTime() / 1000 < poolOpenTime) {
  //         return
  //       }
        
  //       if(SOLIn.isZero() || SOLOut.isZero()) {
  //         if(!trackedLiquidityPool.has(state.mint.toBase58())) {
  //           trackedLiquidityPool.add(state.mint.toBase58())
  //           const poolKeys = await getAccountPoolKeysFromAccountDataV4(
  //             updatedAccountInfo.accountId,
  //             accountData
  //           )
            
  //           logger.info(new Date(), `BUY ${state.mint.toBase58()}`)
  //           trackedPoolKeys.set(state.mint.toBase58(), poolKeys)
  //           mints.set(state.mint.toBase58(), state)
  //           let bundleId = await buyToken(poolKeys, ata, config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL, new BN(0))
  //           bundleInTransit.set(bundleId, {
  //             mint: state.mint,
  //             timestamp: new Date().getTime(),
  //             poolKeys,
  //             state
  //           })
  //         }
  //       } else {
  //         let tokenMint = state.isMintBase ? accountData.baseMint : accountData.quoteMint
  //         if(removedLiquidityPool.has(tokenMint.toBase58())) {

  //           let botState = mints.get(tokenMint.toBase58())
  //           if(botState?.mint) {
  //             let solInDiff =
  //               parseFloat(SOLIn.sub(botState.lastWSOLInAmount).toString()) /
  //               parseFloat(SOLDenominator.toString());
              
  //             const key = trackedPoolKeys.get(tokenMint.toBase58())
  //             const balance = await getBalance(tokenMint, key!)
  //             if(
  //                 !botState.lastWSOLInAmount.isZero() && 
  //                 !SOLIn.sub(botState.lastWSOLInAmount).isZero() && 
  //                 solInDiff > config.get('min_sol_trigger')
  //               ) {
  //               logger.info(`Someone purchase ${state.mint.toBase58()} with ${solInDiff} | min: ${config.get('min_sol_trigger')}`)
  //               logger.info(new Date(), `SELL ${state.mint.toBase58()}`)
  //               // await sellToken(key as LiquidityPoolKeysV4, ata, balance.mul(new BN(10 ** state.mintDecimal)), new BN(solInDiff * LAMPORTS_PER_SOL)) 
  //             }

  //             botState.lastWSOLInAmount = SOLIn;
  //             botState.lastWSOLOutAmount = new BN(SOLOut.toString());
  //             botState.lastTokenInAmount = new BN(tokenIn.toString());
  //             botState.lastTokenOutAmount = new BN(tokenOut.toString());
  //           }
  //         }
  //       }
  //     } catch(e: any) {
  //       // console.log(e.toString())
  //     }
  //   },
  //   config.get('default_commitment') as Commitment,
  //   [
  //     { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
  //     {
  //       memcmp: {
  //         offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
  //         bytes: OPENBOOK_V1_ADDRESS,
  //       },
  //     }
  //   ]
  // );

  // console.log('Starting web socket, subscription ID: ', subscriptionId);
}


(async () => {
  runListener()
  // listenToLPRemoved()
  // onBundleResult()
})();
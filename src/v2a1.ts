import { Commitment, KeyedAccountInfo, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection } from "./adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "./utils/const";
import { config } from "./utils/config";
import { setupWSOLTokenAccount } from "./services/token-account";
import { getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet, swap } from "./services";
import sleep from "atomic-sleep";
import { submitBundle } from "./services/bundle";
import { mainSearcherClient } from "./adapter/jito";
import { ArbIdea, BotLiquidityState } from "./types";
import { getTokenMintFromSignature } from "./services/transaction";
import { logger } from "./utils/logger";
import { BundleInTransit } from "./types/bundleInTransit";
import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

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
    const taBalance = await getTokenInWallet(poolKeys, config.get('default_commitment') as Commitment)
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
      // const isRejected = bundleResult.rejected;
      if (isAccepted) {
        if(bundleInTransit.has(bundleId)) {
          const bundle = bundleInTransit.get(bundleId)
          logger.info(`Listening for token ${bundle!.mint.toBase58()} activities`)
          trackedPoolKeys.set(bundle!.mint.toBase58(), bundle!.poolKeys)
          mints.set(bundle!.mint.toBase58(), bundle!.state)
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
        const tokenMint = await getTokenMintFromSignature(logs.signature)
        if(tokenMint) {
          removedLiquidityPool.add(tokenMint)
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

const sellToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BN, expectedProfit: BN) => {
  const { transaction } = await swap(
    keys,
    'out',
    ata,
    amount.div(new BN(2))
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

const execution = async (accountData: LiquidityStateV4, accountId: PublicKey, ata: PublicKey) => {
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
    
    if(!SOLIn.isZero() && SOLOut.isZero()) {
      if(!trackedLiquidityPool.has(state.mint.toBase58())) {
        trackedLiquidityPool.add(state.mint.toBase58())
        const poolKeys = await getAccountPoolKeysFromAccountDataV4(
          accountId,
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
    } else {
      // let tokenMint = state.isMintBase ? accountData.baseMint : accountData.quoteMint
      // if(removedLiquidityPool.has(tokenMint.toBase58())) {

      //   let botState = mints.get(tokenMint.toBase58())
      //   if(botState?.mint) {
      //     let solInDiff =
      //       parseFloat(SOLIn.sub(botState.lastWSOLInAmount).toString()) /
      //       parseFloat(SOLDenominator.toString());
          
      //     const key = trackedPoolKeys.get(tokenMint.toBase58())
      //     const balance = await getBalance(tokenMint, key!)
      //     if(
      //         !botState.lastWSOLInAmount.isZero() && 
      //         !SOLIn.sub(botState.lastWSOLInAmount).isZero() && 
      //         solInDiff > config.get('min_sol_trigger')
      //       ) {
      //       logger.info(`Someone purchase ${state.mint.toBase58()} with ${solInDiff} | min: ${config.get('min_sol_trigger')}`)
      //       logger.info(new Date(), `SELL ${state.mint.toBase58()}`)
      //       await sellToken(key as LiquidityPoolKeysV4, ata, balance.mul(new BN(10 ** state.mintDecimal)), new BN(solInDiff * LAMPORTS_PER_SOL))
      //     }

      //     botState.lastWSOLInAmount = new BN(SOLIn.toString());
      //     botState.lastWSOLOutAmount = new BN(SOLOut.toString());
      //     botState.lastTokenInAmount = new BN(tokenIn.toString());
      //     botState.lastTokenOutAmount = new BN(tokenOut.toString());
      //   }
      // }
    }
  } catch(e: any) {
    // console.log(e.toString())
  }
}

const runListener = async () => {
  const { ata } = await setupWSOLTokenAccount(true, 0.01)

  const client = new Client(config.get('triton_one_url'), config.get('triton_one_api_key'), {})

  try {
		const stream = await client.subscribe();
		stream.on("data", (d) => {
			if(d && d.account) {
        let accountData = LIQUIDITY_STATE_LAYOUT_V4.decode(
          d.account.account.data
        );
        
        const accountId = new PublicKey(bs58.encode(d.account.account.pubkey))
        execution(accountData, accountId, ata)
			}
		});

		const request = {
			slots: {
				slots: {}
			},
			accounts: {
				raydium: {
					owner: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"],
					account: [],
					filters: []
				}
			},
			transactions: {},
			blocks: {},
			blocksMeta: {},
			accountsDataSlice: [],
			entry: {},
			commitment: CommitmentLevel.PROCESSED
		};

		const streamClosed = new Promise<void>((resolve, reject) => {
			stream.on("error", (error) => {
				reject(error);
				stream.end();
			});
			stream.on("end", () => {
				resolve();
			});
			stream.on("close", () => {
				resolve();
			});
		});

		await new Promise<void>((resolve, reject) => {
			stream.write(request as SubscribeRequest, (err: any) => {
				if (err === null || err === undefined) {
					resolve();
				} else {
					reject(err);
				}
			});
		}).catch((reason) => {
			console.error(reason);
			throw reason;
		});
	
		await streamClosed;
	} catch(e) {
		console.log(e)
	}
}


(async () => {
  runListener()
  listenToLPRemoved()
  onBundleResult()
})();
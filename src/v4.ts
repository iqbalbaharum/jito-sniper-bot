import { Commitment, KeyedAccountInfo, LAMPORTS_PER_SOL, MessageCompiledInstruction, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { connection } from "./adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, TOKEN_PROGRAM_ID, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "./utils/const";
import { config } from "./utils/config";
import { setupWSOLTokenAccount } from "./services/token-account";
import { getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet, swap } from "./services";
import sleep from "atomic-sleep";
import { submitBundle } from "./services/bundle";
import { mainSearcherClient } from "./adapter/jito";
import { ArbIdea, BotLiquidityState } from "./types";
import { getAmmIdFromSignature, getTokenMintFromSignature } from "./services/transaction";
import { logger } from "./utils/logger";
import { BundleInTransit } from "./types/bundleInTransit";
import bs58 from 'bs58'
import { TOKEN_2022_PROGRAM_ID, TokenInstruction } from "@solana/spl-token";
import { BorshCoder, Idl } from "@coral-xyz/anchor";
import raydiumIDL from './idl/raydiumAmm.json'
import { RaydiumAmmCoder } from "./utils/coder";
import { IxSwapBaseIn } from "./utils/coder/layout";

let trackedLiquidityPool: Set<string> = new Set<string>()
let removedLiquidityPool: Set<string> = new Set<string>()
let trackedPoolKeys: Map<string, LiquidityPoolKeys | undefined> = new Map<
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

// Check if there's transaction that above 1 SOL. 
// if there's transaction above 1 SOL then return the transaction
const swapBaseIn = (data: IxSwapBaseIn) => {
  const { amountIn, minimumAmountOut } = data;

  logger.info(`amountIn: ${amountIn.toNumber() / LAMPORTS_PER_SOL} SOL`)
  logger.info(`minAmountOut: ${minimumAmountOut.toString()}`)
}

// Check if poolkeys has already been registered, if already stored in HashMap
// then return the object. This make the initial retrieval would be slow, but as the 2nd call onwards would instant
// To reduce rpc spamming, store "undefined" as initial value in HashMap
// Retrieve poolkeys of the transaction using getAccountInfo
// To check if it's a valid pool, call fetchInfo and check the start time should be less than now
// TODO: separate this process from the main thread
const getPoolKeys = async (ammId: PublicKey) => {
  if(trackedPoolKeys.has(ammId.toBase58())) {
    let pk = trackedPoolKeys.get(ammId.toBase58())
    if(pk) {
      return pk
    }
  }
  
  trackedPoolKeys.set(ammId.toBase58(), undefined)
  
  let account = await connection.getAccountInfo(ammId, {
    commitment: config.get('default_commitment') as Commitment
  })

  if(account) {
    const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data);
    const poolKeys = await getAccountPoolKeysFromAccountDataV4(ammId, info)

    const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys })

    if(poolInfo.startTime.toNumber() < new Date().getTime() / 1000) {
      trackedPoolKeys.set(ammId.toBase58(), poolKeys)
    }
  }
}

// Check if this is raydium swap
// the #1 is always Token Program address (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA) - it can be shown as undefined also
// #2 is always the ammId
const processTx = async (transaction: VersionedTransaction) => {
  for (let ins of transaction.message.compiledInstructions) {
    if(ins.data.length > 0 && transaction.message.staticAccountKeys[ins.programIdIndex].toBase58() === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
      const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
      if(decodedIx.hasOwnProperty('swapBaseIn')) {
        const ammId = transaction.message.staticAccountKeys[ins.accountKeyIndexes[1]]
        if(!ammId) { return }

        const poolKeys = await getPoolKeys(ammId)
        if(poolKeys) {
          logger.info(`ammId: ${ammId}, signature: ${bs58.encode(transaction.signatures[0])}`)
          // const ammId = await getAmmIdFromSignature(bs58.encode(transaction.signatures[0]))
          // console.log(ammId)
          swapBaseIn((decodedIx as any).swapBaseIn)
        }
      }
    }
  }
}

const runListener = async () => {
  // const { ata } = await setupWSOLTokenAccount(true, 0.1)
  
  try {
    mainSearcherClient.onProgramUpdate(
      [new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS)],
      [],
      (transactions: VersionedTransaction[]) => {
        transactions.map(transaction => processTx(transaction))
      },
      (e: any) => {
        console.log(e)
      }
    )
  } catch(e) {
    console.log(e)
  }
}


(async () => {
  runListener()
  // listenToLPRemoved()
  // onBundleResult()
})();
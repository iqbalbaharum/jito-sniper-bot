import { Commitment, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getJitoTipAccount } from "./jito";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import { payer } from "../adapter/payer";
import { connection } from "../adapter/rpc";
import { mainSearcherClient } from "../adapter/jito";
import { logger } from "../utils/logger";
import { ArbIdea } from "../types";

export class BotBundle {

  static async submitBundle(arb: ArbIdea) {
    const tipAddress = await getJitoTipAccount()
    const tipAccount = new PublicKey(tipAddress)
    
    const resp = await connection.getLatestBlockhash('confirmed');
  
    const bundle = new Bundle([arb.vtransaction], 5)
  
    bundle.addTipTx(
        payer,
        parseFloat(arb.tipAmount.toString()),
        tipAccount,
        resp.blockhash
    )
    
    const bundleId = await mainSearcherClient.sendBundle(bundle)
    
    return bundleId
  }
}

const onDefaultBundleResult = () => {
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
        logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      }
    },
    (error) => {
      logger.error(error);
    },
  );
};

export { onDefaultBundleResult }
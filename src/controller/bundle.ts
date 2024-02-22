import { Commitment, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getJitoTipAccount } from "./jito";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import { payer } from "../adapter/payer";
import { connection } from "../adapter/rpc";
import { config } from "../utils/config";
import { fastTrackSearcherClient } from "../adapter/jito";
import { SearcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { logger } from "../utils/logger";

const submitBundle = async (transaction: VersionedTransaction) => {
    const tipAddress = await getJitoTipAccount()
    const tipAccount = new PublicKey(tipAddress)
    
    const resp = await connection.getLatestBlockhash(config.get('default_commitment') as Commitment);

    const bundle = new Bundle([transaction], 5)

    bundle.addTipTx(
        payer,
        0.001 * LAMPORTS_PER_SOL,
        tipAccount,
        resp.blockhash
    )

    const bundleId = 
    await fastTrackSearcherClient.sendBundle(bundle)
    console.log(bundleId)
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
            // if (bundlesInTransit.has(bundleId)) {
            //   bundlesInTransit.get(bundleId).accepted += 1;
            // }
          }
          if (isRejected) {
            logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
            // if (bundlesInTransit.has(bundleId)) {
            //   const trade: Trade = bundlesInTransit.get(bundleId);
            //   trade.rejected = true;
            //   const rejectedEntry = Object.entries(bundleResult.rejected).find(
            //     // eslint-disable-next-line @typescript-eslint/no-unused-vars
            //     ([_, value]) => value !== undefined,
            //   );
            //   const [errorType, errorContent] = rejectedEntry;
            //   trade.errorType = errorType;
            //   trade.errorContent = JSON.stringify(errorContent);
            // }
          }
        },
        (error) => {
          logger.error(error);
          throw error;
        },
      );
  };

export { submitBundle, onBundleResult }
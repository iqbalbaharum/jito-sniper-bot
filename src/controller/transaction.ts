import { TxVersion } from "@raydium-io/raydium-sdk"
import { connection } from "../adapter/rpc"
import { RAYDIUM_AUTHORITY_V4_ADDRESS, USDC_ADDRESS, WSOL_ADDRESS, config } from "../utils";

const getTokenMintFromSignature = async (signature: string): Promise<string | undefined> => {
	let tx;
  let timer = new Date().getTime();

	while (true) {
    let res = await fetch(
      `https://api.helius.xyz/v0/transactions/?api-key=${config.get('helius_api_key')}&commitment=confirmed`,
      {
        method: 'POST',
        body: JSON.stringify({
          transactions: [`${signature}`],
        }),
      }
    );

    const json = await res.json();
    tx = json[0];
    if (tx) {
      break;
    }

    if (new Date().getTime() - timer > 30000) {
      return undefined
    }
  }

	const token = tx.tokenTransfers.find(
		(token: any) =>
			token.mint !== WSOL_ADDRESS &&
			token.fromUserAccount === RAYDIUM_AUTHORITY_V4_ADDRESS
	);
	
	if(!token) {
		return undefined
	}

	if (token.mint === USDC_ADDRESS) {
    return undefined
  }

	return token.mint
}

export {
    getTokenMintFromSignature
}
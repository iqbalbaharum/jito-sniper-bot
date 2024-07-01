import { PublicKey } from "@solana/web3.js";
import { pipeline } from "stream";
import { Agent, request } from "undici";
import { promisify } from "util";
import { createGunzip, createInflate } from "zlib";
import { DexscreenerResponse } from "../types/dexscreener";
import { TokenLpDetail } from "../types";

const agent = new Agent({
    keepAliveTimeout: 20 * 1000,
    keepAliveMaxTimeout: 20 * 1000,
    connections: 500,
    pipelining: 1,
});

const pipelineAsync = promisify(pipeline);

export class DexScreenerApi {

    static async fetchGetRequest(mint: PublicKey) {
        const { headers, body } = await request(
					`https://api.dexscreener.com/latest/dex/tokens/${mint.toBase58()}`, {
          method: 'GET',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'accept-encoding': 'gzip, deflate'
          },
          dispatcher: agent
        })
    
        let responseBody = '';
        const encoding = headers['content-encoding'];
    
        if (encoding === 'gzip' || encoding === 'deflate') {
          const decompressStream = encoding === 'gzip' ? createGunzip() : createInflate();
          await pipelineAsync(body, decompressStream, async function* (source) {
            for await (const chunk of source) {
              responseBody += chunk;
            }
          });
        } else {
          for await (const chunk of body) {
            responseBody += chunk;
          }
        }
    
        return JSON.parse(responseBody)
      }

    static async getLpTokenCount(mint: PublicKey) : Promise<TokenLpDetail | undefined> {
			let pairResponse = await this.fetchGetRequest(mint) as DexscreenerResponse
			
			if(!pairResponse.pairs) {
				return undefined
			}

			let raydiumPair = pairResponse.pairs.filter(e => e.dexId === 'raydium')
			let jupiterPair = pairResponse.pairs.filter(e => e.dexId === 'jupiter')
			let meteoraPair = pairResponse.pairs.filter(e => e.dexId === 'meteora')
			let orcaPair = pairResponse.pairs.filter(e => e.dexId === 'orca')
			return {
				totalLpCount: pairResponse.pairs.length,
				raydiumLpCount: raydiumPair.length,
				jupiterLpCount: jupiterPair.length,
				meteoraLpCount: meteoraPair.length,
				orcaLpCount: orcaPair.length
			}
    }
}
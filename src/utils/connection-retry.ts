import { AddressLookupTableAccount, Commitment, Connection, ConnectionConfig, GetAccountInfoConfig, GetLatestBlockhashConfig, PublicKey, RpcResponseAndContext } from "@solana/web3.js";

export class RetryConnection extends Connection {

    maxRetries: number

    constructor(endpoint: string, commitment?: Commitment | ConnectionConfig | undefined, maxRetries: number = 3) {
      super(endpoint, commitment);
      this.maxRetries = maxRetries
    }
    
    async getAddressLookupTable(accountKey: PublicKey, config?: GetAccountInfoConfig | undefined): Promise<RpcResponseAndContext<AddressLookupTableAccount | null>> {
			let retries = 0
			while (retries < this.maxRetries) {
				try {
						return super.getAddressLookupTable(accountKey, config)
				} catch (error) {
					if (this.isRetryableError(error)) {
						retries++;
						console.warn(`Retrying getAddressLookupTable ... Attempt ${retries}`);
					} else {
						throw error;
					}
				}
			}
		
			throw new Error(`Exhausted all retries for getAddressLookupTable`);
    }

		async getLatestBlockhash(commitmentOrConfig?: Commitment | GetLatestBlockhashConfig | undefined): Promise<Readonly<{ blockhash: string; lastValidBlockHeight: number; }>> {
			let retries = 0
			while (retries < this.maxRetries) {
				try {
						return super.getLatestBlockhash(commitmentOrConfig)
				} catch (error) {
					if (this.isRetryableError(error)) {
						retries++;
						console.warn(`Retrying getLatestBlockhash ... Attempt ${retries}`);
					} else {
						throw error;
					}
				}
			}
		
			throw new Error(`Exhausted all retries for getLatestBlockhash`);
		}
  
    private isRetryableError(error: any): boolean {
      return error && error.code === 502 && error.message === 'Bad Gateway';
    }
}
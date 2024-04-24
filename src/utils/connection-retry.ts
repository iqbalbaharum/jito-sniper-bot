import { AccountInfo, AddressLookupTableAccount, Commitment, Connection, ConnectionConfig, GetAccountInfoConfig, GetLatestBlockhashConfig, PublicKey, RpcResponseAndContext } from "@solana/web3.js";

export class RetryConnection extends Connection {

    maxRetries: number

    constructor(endpoint: string, commitment?: Commitment | ConnectionConfig | undefined, maxRetries: number = 3) {
      super(endpoint, commitment);
      this.maxRetries = maxRetries
    }
    
    public async fetchAddressLookupTable(accountKey: PublicKey, config?: GetAccountInfoConfig | undefined): Promise<RpcResponseAndContext<AddressLookupTableAccount | null>> {
			let retries = 0
			while (retries < this.maxRetries) {
				try {
					return await super.getAddressLookupTable(accountKey, config)
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

		async fetchLatestBlockhash(commitmentOrConfig?: Commitment | GetLatestBlockhashConfig | undefined): Promise<Readonly<{ blockhash: string; lastValidBlockHeight: number; }>> {
			let retries = 0
			while (retries < this.maxRetries) {
				try {
					return await super.getLatestBlockhash(commitmentOrConfig)
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
		
		async fetchAccountInfo(publicKey: PublicKey, commitmentOrConfig?: Commitment | GetAccountInfoConfig | undefined): Promise<AccountInfo<Buffer> | null> {
			let retries = 0
			while (retries < this.maxRetries) {
				try {
					return await super.getAccountInfo(publicKey, commitmentOrConfig)
				} catch (error) {
					if (this.isRetryableError(error)) {
						retries++;
						console.warn(`Retrying getAccountInfo ... Attempt ${retries}`);
					} else {
						throw error;
					}
				}
			}
		
			throw new Error(`Exhausted all retries for getAccountInfo`);
		}
  
    private isRetryableError(error: any): boolean {
      return error && error.code === 502 && error.message === 'Bad Gateway';
    }
}
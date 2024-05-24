import { PublicKey } from "@solana/web3.js"
import { CopyTradeAmount, TokenTick } from "../types"
import { StorageKeys } from "../types/storage-keys"
import { BaseStorage } from "./base-storage"

export class TickStorage extends BaseStorage {
    client: any

	constructor(client: any) {
        super(StorageKeys.KEY_TOKENTICK)
        this.client = client
    }

	set(ammId: PublicKey, tick: TokenTick) {
		this.client.set(ammId.toBase58(), this.serialize(tick))
	}

	get(ammId: PublicKey) : TokenTick | undefined {
		let json = this.client.get(ammId.toBase58())
		return this.deserialize(json)
	}

	private serialize(tick: TokenTick) : string {
		return JSON.stringify(tick)
	}

	private deserialize(tickString: string) : TokenTick | undefined {
		return JSON.parse(tickString)
	}
}
import { TxPool } from "../types";

export abstract class BaseGenerator {
    
    private _streamName: string

    get streamName(): string {
        return this._streamName
    }

    constructor(sourceName: string) {
        this._streamName = sourceName
    }

    protected abstract listen(): AsyncGenerator<TxPool>
}
import { TxPool } from "../types";
import { BaseGenerator } from "./base-generator";

export class JitoMempoolPool extends BaseGenerator {
  protected async* listen(): AsyncGenerator<TxPool> {}  
}
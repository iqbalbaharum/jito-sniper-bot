import { config } from "../utils";
import ammProxyIdl from "../idl/amm_proxy.json";
import { AmmProxy } from "../idl/types/amm_proxy";
import { connection } from "./rpc";
import { Idl, Program } from "@coral-xyz/anchor";

const AMM_SWAP_PROGRAM_ID = config.get('swap_program_id')

let ammProxyProgram

if(AMM_SWAP_PROGRAM_ID) {
    ammProxyProgram = new Program(ammProxyIdl as Idl, AMM_SWAP_PROGRAM_ID)
}


export { ammProxyProgram }
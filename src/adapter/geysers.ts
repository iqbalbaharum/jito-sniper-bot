import { GrpcGenerator } from "../generators/grpc";
import { TxPool } from "../types";
import { config } from "../utils";

export type GrpcEnv = {
    url: string,
    token: string
}

const geysers: GrpcEnv[] = [];

let grpc_urls = config.get('grpc_urls')
let grpc_tokens = config.get('grpc_tokens')

for(let x = 0; x < grpc_urls.length; x++) {
    
    let url = grpc_urls[x]
    let token = grpc_tokens[x]

    if(url) {
        geysers.push({
            url,
            token
        })
    }
}


export { geysers }
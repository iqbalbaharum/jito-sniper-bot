import convict from 'convict'
import * as dotenv from 'dotenv'
dotenv.config();

const config = convict({
    http_rpc_url: {
        format: String,
        default: 'https://api.mainnet-beta.solana.com',
        env: 'HTTP_RPC_URL'
    },
    websocket_rpc_url: {
        format: String,
        default: '',
        env: 'WEBSOCKET_RPC_URL'
    },
    block_engine_urls: {
        format: Array,
        default: ['tokyo.mainnet.block-engine.jito.wtf'],
        doc: 'block engine urls. bot will mempool subscribe to all and send bundles to first one',
        env: 'BLOCK_ENGINE_URLS'
    },
    auth_keypair_secret: {
        format: String,
        default: '',
        env: 'AUTH_KEYPAIR_SECRET'
    },
    payer_keypair_secret: {
        format: String,
        default: '',
        env: 'PAYER_KEYPAIR_SECRET'
    },
    default_commitment: {
        format: String,
        default: 'processed',
        env: 'DEFAULT_COMMITMENT'
    }
})

config.validate({ allowed: 'strict' })

export {config}
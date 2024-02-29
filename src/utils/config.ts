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
    },
    helius_api_key: {
        format: String,
        default: '',
        env: 'HELIUS_API_KEY'
    },
    token_purchase_in_sol: {
        format: Number,
        default: 0.0001,
        env: 'TOKEN_PURCHASE_IN_SOL'
    },
    min_sol_trigger: {
        format: Number,
        default: 0.01,
        env: 'MIN_SOL_TRIGGER'
    },
    tip_percent: {
        format: Number,
        default: 10,
        env: 'TIP_PERCENT'
    },
    default_tip_in_sol: {
        format: Number,
        default: 0.001,
        env: 'DEFAULT_TIP_IN_SOL'
    },
    log_level: {
        format: String,
        default: 'info',
        env: 'LOG_LEVEL'
    },
    bot_name: {
        format: String,
        default: '',
        env: 'BOT_NAME'
    },
    triton_one_url: {
        format: String,
        default: '',
        env: 'TRITON_ONE_URL'
    },
    triton_one_api_key: {
        format: String,
        default: '',
        env: 'TRITON_ONE_API_KEY'
    },
})

config.validate({ allowed: 'strict' })

export {config}
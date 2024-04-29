module.exports = {
  apps : [
    {
      name: 'v2',
      script: './build/src/strategy/v2.js',
      args: '--max-old-space-size=6144',
      instances: 1,
      autorestart: true,
      watch: false,

    },
    {
      name: 'amm',
      script: './build/src/tools/amm-listener.js',
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: 'market',
      script: './build/src/tools/market-listener.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
    },
    // {
    //   name: 'blockhasher',
    //   script: './build/src/tools/blockhasher.js',
    //   instances: 1,
    //   autorestart: true,
    //   watch: false,
    // },
    {
      name: 'payer',
      script: './build/src/tools/payer-listener.js',
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: 'delayed-buy',
      script: './build/src/tools/delayed-buy.js',
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ]
}
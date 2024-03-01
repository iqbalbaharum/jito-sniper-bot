export enum BotError {
    // System Error
    INTERNAL_ERROR,
    // Fetch error
    INVALID_AMM_ID = "Invalid AMM ID",
    MARKET_FETCH_ERROR = "Market Fetch Error",
    // GRPC
    GRPC_STREAM_NOT_INITIALISED = 'gRPC stream not initialised'
}
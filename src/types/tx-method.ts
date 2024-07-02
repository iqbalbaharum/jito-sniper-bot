export type TxMethod = 'jito_send_tx' | 'jito_send_bundle' | 'base64' | 'rpc' | 'bloxroute'

const validTxMethods: TxMethod[] = ['jito_send_tx', 'jito_send_bundle', 'base64', 'rpc', 'bloxroute'];

export function convertToTxMethodArray(methods: string): TxMethod[] {
    if(methods.length < 0) {
        return ['rpc'] // default
    }

    return methods.split(',').map(method => {
        if (validTxMethods.includes(method as TxMethod)) {
            return method as TxMethod;
        } else {
            throw new Error(`Invalid TxMethod: ${method}`);
        }
    });
}
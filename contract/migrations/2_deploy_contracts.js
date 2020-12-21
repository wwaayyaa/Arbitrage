let Arbitrage = artifacts.require("Arbitrage")
let fs = require('fs');
let cc = require('../../ChainConfig');

module.exports = async function (deployer, network) {
    try {
        let lendingPoolAddressesProviderAddress;
        let uniswapV2RouterAddress;
        let sushiswapV2RouterAddress;

        let uniswapV2DAIETHAddress = '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11'

        switch(network) {
            case "mainnet":
            case "mainnet-fork":
            case "development": // For Ganache mainnet forks
                lendingPoolAddressesProviderAddress = cc.loan.aave.address;
                uniswapV2RouterAddress = cc.exchange.uniswap.router02.address;
                sushiswapV2RouterAddress = cc.exchange.sushiswap.router02.address;

                //weth 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
                //eth-dai 0xa478c2975ab1ea89e8196811f51a7b7ade33eb11
                break
            case "ropsten":
            case "ropsten-fork":
                // lendingPoolAddressesProviderAddress = "0x1c8756FD2B28e9426CDBDcC7E3c4d64fa9A54728";
                // uniswapV2RouterAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
                // sushiswapV2RouterAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
                break
            case "kovan":
            case "kovan-fork":
                // lendingPoolAddressesProviderAddress = "0x506B0B2CF20FAA8f38a4E2B524EE43e1f4458Cc5"; break
            default:
                throw Error(`Are you deploying to the correct network? (network selected: ${network})`)
        }

        await deployer.deploy(Arbitrage);

        let contractAddresses = {
            Arbitrage: { address : Arbitrage.address, abi: Arbitrage.abi },
        };
        fs.writeFileSync('../ContractAddresses.json', JSON.stringify(contractAddresses));

    } catch (e) {
        console.log(`Error in migration: ${e.message}`)
    }

}

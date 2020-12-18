// import { ChainId, Token } from '@uniswap/sdk'

let cc = require("../../ChainConfig");
let ca = require("../ContractAddresses");

(async () => {

    const c = console.log
    const Web3 = require('web3');
    let web3 = new Web3('http://0.0.0.0:8545');

    let utils = web3.utils

    let timestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp
    c(timestamp);

    const acc = web3.eth.accounts.privateKeyToAccount('0x9679727a20329d53f114382ea91b6f9e1e3e0b622f79a44bd53a5b2fb794171d')

    //TOKEN
    let weth = new web3.eth.Contract(cc.token.weth.abi, cc.token.weth.address);
    let dai = new web3.eth.Contract(cc.token.dai.abi, cc.token.dai.address);
    let uniRoute2 = new web3.eth.Contract(cc.exchange.uniswap.router02.abi, cc.exchange.uniswap.router02.address)
    let sushiRoute2 = new web3.eth.Contract(cc.exchange.sushiswap.router02.abi, cc.exchange.sushiswap.router02.address)
    let uniPairETHDAI = new web3.eth.Contract(cc.exchange.uniswap.pair.abi, cc.exchange.uniswap.pair['dai-eth'].address);
    let sushiPairETHDAI = new web3.eth.Contract(cc.exchange.sushiswap.pair.abi, cc.exchange.sushiswap.pair['dai-eth'].address);
    let arbitrage = new web3.eth.Contract(ca.Arbitrage.abi, ca.Arbitrage.address)

    let tradeETH = web3.utils.toWei("100000", 'ether');
    c('tradeETH', tradeETH);

    c("--- 计算产出 ---");
    try {
        c("uniswap: weth -> dai")
        await uniRoute2.methods.gerReserves()
        let daiOut = await uniRoute2.methods.
            getAmountOut(tradeETH, cc.token.weth.address, cc.token.dai.address)
            .call();
        c(daiOut);

        // ("balancer: dai -> weth")
        // let bb = new web3.eth.Contract(cc.exchange.balancer.abi, '0x7afe74ae3c19f070c109a38c286684256adc656c');
        // await bb.methods
        //     .calcOutGivenIn('balancer', cc.exchange.balancer['0x7afe74ae3c19f070c109a38c286684256adc656c'].address, cc.token.weth.address, cc.token.dai.address, web3.utils.toWei("2", 'ether'),
        //         'uniswap', cc.exchange.uniswap.router02.address, cc.token.dai.address, cc.token.weth.address, "0"
        //     )
        //     .send({from: acc.address, gas: 5000000});

    } catch (e) {
        c("arbitrage error: ", e);
        // process.exit();
    }

})();

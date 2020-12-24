const init = require('../../common/init').init();
const {web3, acc} = init.initWeb3AndAccount();

let cc = require("../../ChainConfig");
let ca = require("../../ContractAddresses");

(async () => {

    const c = console.log;

    let utils = web3.utils;

    let timestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp
    c(timestamp);

    //TOKEN
    let weth = new web3.eth.Contract(cc.token.weth.abi, cc.token.weth.address);
    let dai = new web3.eth.Contract(cc.token.dai.abi, cc.token.dai.address);
    let uniRoute2 = new web3.eth.Contract(cc.exchange.uniswap.router02.abi, cc.exchange.uniswap.router02.address)
    let sushiRoute2 = new web3.eth.Contract(cc.exchange.sushiswap.router02.abi, cc.exchange.sushiswap.router02.address)
    let uniPairETHDAI = new web3.eth.Contract(cc.exchange.uniswap.pair.abi, cc.exchange.uniswap.pair['dai-eth'].address);
    let sushiPairETHDAI = new web3.eth.Contract(cc.exchange.sushiswap.pair.abi, cc.exchange.sushiswap.pair['dai-eth'].address);
    let arbitrage = new web3.eth.Contract(ca.Arbitrage.abi, ca.Arbitrage.address)

    // c('搞10个weth');
    // let warpETHContract = new web3.eth.Contract(cc.wrapETH.abi, cc.wrapETH.address);
    // await warpETHContract.methods.deposit().send({from: acc.address, value: tradeETH, gas: 5000000});
    // c('weth转给套利合约');
    // await weth.methods.transfer(ca.Arbitrage.address, tradeETH).send({from: acc.address});

    c("账户初始余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(acc.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(acc.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(acc.address).call(), 'ether'));
    c("合约初始余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(ca.Arbitrage.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));

    c("--- arbitrage 测试 ---");
    try {
        let x = await arbitrage.methods
            .aN(
                //ok move bricks
                // '21515416', '3333333333',
                // [
                //     ['2', "0x8b6e6e7b5b3801fed2cafd4b22b8a16c2f2db21a", cc.token.weth.address, cc.token.dai.address, web3.utils.toWei("10", 'ether'), "0"],
                //     ['1', cc.exchange.uniswap.router02.address, cc.token.dai.address, cc.token.weth.address, "0", "0"]
                // ]

                //ok triangular
        //[{"quoteA":"aave","quoteB":"weth","price":"0.1262542020","master":true,"weightA":"25","weightB":"25","balanceA":"32147.089000441118603154","balanceB":"4052.617010073162911470","fee":"0.0015000000","protocol":"balancer","exchange":"0x7c90a3cd7ec80dd2f633ed562480abbeed3be546","minute":"202012240024","height":11510753,"type":"buy"},
        //{"quoteA":"aave","quoteB":"wbtc","price":"0.0033122973","master":true,"weightA":"6.25","weightB":"12.5","balanceA":"2579.498239395053586449","balanceB":"17.03686565","fee":"0.0030000000","protocol":"balancer","exchange":"0x49ff149d649769033d43783e7456f626862cd160","minute":"202012240024","height":11510753,"type":"sell"},
        //{"quoteA":"wbtc","quoteB":"weth","price":"38.8855554861","master":true,"weightA":"25","weightB":"25","balanceA":"114.73085271","balanceB":"4457.357703374399022472","fee":"0.0009000000","protocol":"balancer","exchange":"0xee9a6009b926645d33e10ee5577e9c8d3c95c165","minute":"202012240024","height":11510753,"type":"sell"}]
                '21515416', '3333333333',
                [
                    ['2', "0x7c90a3cd7ec80dd2f633ed562480abbeed3be546", cc.token.weth.address, cc.token.aave.address, web3.utils.toWei("2", 'ether'), "0"],
                    ['2', '0x49ff149d649769033d43783e7456f626862cd160', cc.token.aave.address, cc.token.wbtc.address, "0", "0"],
                    ['2', '0xee9a6009b926645d33e10ee5577e9c8d3c95c165', cc.token.wbtc.address, cc.token.weth.address, "0", "0"]
                ]
            )
            .send({from: acc.address, gas: 5000000});
        c('tx', x);
    } catch (e) {
        c("arbitrage error: ", e);
        // process.exit();
    }
    c("账户余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(acc.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(acc.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(acc.address).call(), 'ether'));
    c("合约余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(ca.Arbitrage.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));


})();

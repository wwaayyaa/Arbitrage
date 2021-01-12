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
            .doubleTeam(
                //buy
                // '31515416', '3333333333',
                // '1000000000000000000', cc.exchange.uniswap.router02.address, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '0x6b175474e89094c44da98b954eedeac495271d0f'

                //sell
                '31515416', '3333333333',
                '0', cc.exchange.uniswap.router02.address, '0x6b175474e89094c44da98b954eedeac495271d0f', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
            )
            .send({from: acc.address, gas: 500000, gasPrice: '000000000'});
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

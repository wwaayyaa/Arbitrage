// import { ChainId, Token } from '@uniswap/sdk'

let cc = require("../../ChainConfig");
let ca = require("../../ContractAddresses");

(async () => {

    const c = console.log;
    const Web3 = require('web3');
    let web3 = new Web3('http://0.0.0.0:8545');

    let utils = web3.utils;

    let timestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp
    c(timestamp);

    const acc = web3.eth.accounts.privateKeyToAccount('0x9679727a20329d53f114382ea91b6f9e1e3e0b622f79a44bd53a5b2fb794171d')

    //TOKEN
    let weth = new web3.eth.Contract(cc.token.weth.abi, cc.token.weth.address);
    let dai = new web3.eth.Contract(cc.token.dai.abi, cc.token.dai.address);
    let wbtc = new web3.eth.Contract(cc.token.wbtc.abi, cc.token.wbtc.address);
    let yfi = new web3.eth.Contract(cc.token.yfi.abi, cc.token.yfi.address);
    let uniRoute2 = new web3.eth.Contract(cc.exchange.uniswap.router02.abi, cc.exchange.uniswap.router02.address)
    let sushiRoute2 = new web3.eth.Contract(cc.exchange.sushiswap.router02.abi, cc.exchange.sushiswap.router02.address)
    let uniPairETHDAI = new web3.eth.Contract(cc.exchange.uniswap.pair.abi, cc.exchange.uniswap.pair['dai-eth'].address);
    let sushiPairETHDAI = new web3.eth.Contract(cc.exchange.sushiswap.pair.abi, cc.exchange.sushiswap.pair['dai-eth'].address);
    let arbitrage = new web3.eth.Contract(ca.Arbitrage.abi, ca.Arbitrage.address)

    let tradeETH = web3.utils.toWei(process.argv[2] || 100, 'ether');
    let tradeDAI = web3.utils.toWei((process.argv[2] * 300).toString() || '30000', 'ether');
    c('tradeETH', tradeETH);
    //价格
    let reserves = await uniPairETHDAI.methods.getReserves().call({from: acc.address});
    let uniPrice = reserves[0] / reserves[1];
    c("uniswap eth-dai:", uniPrice);

    c('搞10个weth');
    let warpETHContract = new web3.eth.Contract(cc.wrapETH.abi,cc.wrapETH.address);
    await warpETHContract.methods.deposit().send({from: acc.address, value: tradeETH, gas: 5000000});

    c("账户初始余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(acc.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(acc.address).call(), 'ether'));
    c("wbtc: " + utils.fromWei(await wbtc.methods.balanceOf(acc.address).call(), 'gwei'));
    c("yfi: " + utils.fromWei(await yfi.methods.balanceOf(acc.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(acc.address).call(), 'ether'));
    c("合约初始余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(ca.Arbitrage.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));

    c("--- 测试 ---");
    try {
        c('approve');
        await weth.methods.approve(cc.exchange.uniswap.router02.address, tradeETH).send({from:acc.address});
        c('swap weth to dai');
        await uniRoute2.methods
            .swapExactTokensForTokens(tradeETH, 0, [cc.token.weth.address, cc.token.yfi.address], acc.address, timestamp + 300)
            .send({from: acc.address, gas: 5000000});

        let n = await yfi.methods.balanceOf(acc.address).call();
        c(`approve n: ${n}`);
        await yfi.methods.approve(cc.exchange.uniswap.router02.address, n).send({from:acc.address});
        c('swap dai to wbtc');
        await uniRoute2.methods
            .swapExactTokensForTokens(n, 0, [cc.token.yfi.address, cc.token.wbtc.address], acc.address, timestamp + 300)
            .send({from: acc.address, gas: 5000000})
    } catch (e) {
        c("arbitrage error: ", e);
        // process.exit();
    }
    c("账户余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(acc.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(acc.address).call(), 'ether'));
    c("wbtc: " + utils.fromWei(await wbtc.methods.balanceOf(acc.address).call(), 'gwei'));
    c("yfi: " + utils.fromWei(await yfi.methods.balanceOf(acc.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(acc.address).call(), 'ether'));
    c("合约余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(ca.Arbitrage.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));



})();

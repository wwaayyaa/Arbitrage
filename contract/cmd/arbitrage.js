// import { ChainId, Token } from '@uniswap/sdk'

let CC = require("../../ChainConfig");
let CA = require("../ContractAddresses");

(async () => {

    const c = console.log
    const Web3 = require('web3');
    let web3 = new Web3('http://0.0.0.0:9545');

    let utils = web3.utils

    let timestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp
    c(timestamp);

    const acc = web3.eth.accounts.privateKeyToAccount('0x9679727a20329d53f114382ea91b6f9e1e3e0b622f79a44bd53a5b2fb794171d')

    //TOKEN
    // let weth = new web3.eth.Contract(CC.token.weth.abi, CC.token.weth.address);
    let dai = new web3.eth.Contract(CC.token.dai.abi, CC.token.dai.address);
    let uniRoute2 = new web3.eth.Contract(CC.univ2.router02.abi, CC.univ2.router02.address)
    let sushiRoute2 = new web3.eth.Contract(CC.sushi.router02.abi, CC.sushi.router02.address)
    let uniPairETHDAI = new web3.eth.Contract(CC.univ2.pair.eth_dai.abi, CC.univ2.pair.eth_dai.address);
    let sushiPairETHDAI = new web3.eth.Contract(CC.sushi.pair.eth_dai.abi, CC.sushi.pair.eth_dai.address);
    let arbitrage = new web3.eth.Contract(CA.Arbitrage.abi, CA.Arbitrage.address)

    let tradeETH = web3.utils.toWei("20000000000", 'ether');
    //价格
    let reserves = await uniPairETHDAI.methods.getReserves().call({from: acc.address});
    let uniPrice = reserves[0] / reserves[1];
    c("uniswap eth-dai:", uniPrice);

    reserves = await sushiPairETHDAI.methods.getReserves().call({from: acc.address});
    let sushiPrice = reserves[0] / reserves[1];
    c("sushi eth-dai:", sushiPrice);

    let which = 0;
    if(uniPrice / sushiPrice >= 1.005){
        which = 1;
        c("uni价格大于sushi，先去uni买token，再回sushi卖出。")
    }else if (sushiPrice / uniPrice >= 1.005){
        which = 2;
        c("uni价格小于sushi，先去sushi买token，再回uni卖出。")
    }else{
        c("无利可图");
        process.exit();
        // c("无利可图，假如此时运行套利合约。");
        // which = 2;
    }
    c("账户初始余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(acc.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(acc.address).call(), 'ether'));
    c("合约初始余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(CA.Arbitrage.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(CA.Arbitrage.address).call(), 'ether'));

    c("--- arbitrage 借200个ETH套利 ---");
    try {
        // await arbitrage.methods.test().call();
        await arbitrage.methods
            .flashloan('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', tradeETH, CC.token.dai.address, which, timestamp + 300)
            .send({from: acc.address, gas: 5000000});
    } catch (e) {
        c("arbitrage error: ", e);
        // process.exit();
    }

    c("账户余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(acc.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(acc.address).call(), 'ether'));
    c("套利合约余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(CA.Arbitrage.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(CA.Arbitrage.address).call(), 'ether'));

    reserves = await uniPairETHDAI.methods.getReserves().call({from: acc.address});
    uniPrice = reserves[0] / reserves[1];
    c("uniswap eth-dai:", uniPrice);

    reserves = await sushiPairETHDAI.methods.getReserves().call({from: acc.address});
    sushiPrice = reserves[0] / reserves[1];
    c("sushi eth-dai:", sushiPrice);



})();

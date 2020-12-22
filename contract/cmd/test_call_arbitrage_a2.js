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
        // await arbitrage.methods
        //     .a2('uniswap', cc.exchange.uniswap.router02.address, cc.token.weth.address, cc.token.dai.address, web3.utils.toWei("2", 'ether'),
        //         'uniswap', cc.exchange.uniswap.router02.address, cc.token.dai.address, cc.token.weth.address, "0"
        //     )
        //     .send({from: acc.address, gas: 5000000});

        // await arbitrage.methods
        //     .a2('balancer', cc.exchange.balancer['0x7afe74ae3c19f070c109a38c286684256adc656c'].address, cc.token.weth.address, cc.token.dai.address, web3.utils.toWei("2", 'ether'),
        //         'uniswap', cc.exchange.uniswap.router02.address, cc.token.dai.address, cc.token.weth.address, "0"
        //     )
        //     .send({from: acc.address, gas: 5000000});

        //[{"quoteA":"dai","quoteB":"weth","price":"0.0015585810","master":true,"weightA":"10","weightB":"40","balanceA":"10721232.761901784193160021","balanceB":"66672.541118559201851292","fee":"0.0025000000","protocol":"balancer","exchange":"0x8b6e6e7b5b3801fed2cafd4b22b8a16c2f2db21a","minute":"202012211055","height":11494063,"timestamp":1608519337,"type":"buy"},
        //{"quoteA":"dai","quoteB":"weth","price":"0.0015898818","master":true,"balanceA":"62335163.232303627953199648","balanceB":"99105.542949569093454561","fee":0.003,"protocol":"uniswap","exchange":"uniswapv2","minute":"202012211055","height":11494063,"timestamp":1608519336,"type":"sell"}]
        let x = await arbitrage.methods
            .a2(
                //ok
                'balancer', "0x8b6e6e7b5b3801fed2cafd4b22b8a16c2f2db21a", cc.token.weth.address, cc.token.dai.address, web3.utils.toWei("10", 'ether'),
                'uniswap', cc.exchange.uniswap.router02.address, cc.token.dai.address, cc.token.weth.address, "0"
            )
            // .a2(
            //     //error execution reverted: ERC20: transfer amount exceeds balance
            //     'balancer',
            //     '0x41284a88d970d3552a26fae680692ed40b34010c',
            //     '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e',
            //     '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            //     '2000000000000000000',
            //     'uniswap',
            //     '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            //     '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e',
            //     '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            //     '0'
            // )
            .a2(
                //error execution reverted: TransferHelper: TRANSFER_FROM_FAILED
                'uniswap',
                '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
                '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e',
                '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                '5000000000000000000',
                'balancer',
                '0x41284a88d970d3552a26fae680692ed40b34010c',
                '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e',
                '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                '5000000000000000000'
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

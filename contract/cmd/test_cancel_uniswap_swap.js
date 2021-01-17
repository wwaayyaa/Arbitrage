/**
 * 该脚本用于测试这个合约（https://cn.etherscan.com/address/0xecada5efb9ab8b520efa8f00bbf3d42f49be6cec）的套利策略。
 *   这个套利合约会在大单买入之前，抢先买入，拉升价格。然后在大户成交之后，再把买到的token卖出，实现套利。
 *   虽然有先后，但是他的交易是在同一个块里面的。通过gasPrice到达先后顺序的目的。
 *   https://cn.etherscan.com/tx/0x1cd898975a4288e99e8ef66e9ac9b36f015f5b5a7acadb392379b81d3dabb4d6
 *   https://cn.etherscan.com/tx/0xba060b491bda7688eeb356ce83d0b684e9611f93fcccdfc7672a3d944333b06f
 * 测试方法：
 *   1. 发出一个大额买单，但是gas不太高的交易。
 *   2. 延迟一定时间之后，就迅速发出nonce相同、更高gasPrice的交易，覆盖相同的交易。
 *   3. 观察对方是否被误导，发出了套利交易。
 */
const init = require('../../common/init').init();
const common = require('../../common/common');
const {web3, acc} = init.initWeb3AndAccount();

let cc = require("../../ChainConfig");
let ca = require("../../ContractAddresses");

(async () => {

    const c = console.log;
    c(`当前是${process.env.APP_ENV}环境`);

    let utils = web3.utils;

    let timestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp
    c(timestamp);

    //TOKEN
    let weth = new web3.eth.Contract(cc.token.weth.abi, cc.token.weth.address);
    let dai = new web3.eth.Contract(cc.token.dai.abi, cc.token.dai.address);
    let usdc = new web3.eth.Contract(cc.token.usdc.abi, cc.token.usdc.address);
    let uniRoute2 = new web3.eth.Contract(cc.exchange.uniswap.router02.abi, cc.exchange.uniswap.router02.address)
    let sushiRoute2 = new web3.eth.Contract(cc.exchange.sushiswap.router02.abi, cc.exchange.sushiswap.router02.address)
    let uniPairETHDAI = new web3.eth.Contract(cc.exchange.uniswap.pair.abi, cc.exchange.uniswap.pair['dai-eth'].address);
    let sushiPairETHDAI = new web3.eth.Contract(cc.exchange.sushiswap.pair.abi, cc.exchange.sushiswap.pair['dai-eth'].address);
    let arbitrage = new web3.eth.Contract(ca.Arbitrage.abi, ca.Arbitrage.address)

    c("账户初始余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(acc.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(acc.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(acc.address).call(), 'ether'));
    c("合约初始余额: ");
    c("eth: " + utils.fromWei(await web3.eth.getBalance(ca.Arbitrage.address), 'ether'));
    c("dai: " + utils.fromWei(await dai.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));
    c("weth: " + utils.fromWei(await weth.methods.balanceOf(ca.Arbitrage.address).call(), 'ether'));

    const tradeAmount = utils.toWei('0.1', 'ether');
    const tradeToken = weth;

    // c("--- 1 approve --- ");
    // try {
    //     await tradeToken.methods.approve(cc.exchange.uniswap.router02.address, tradeAmount).send({
    //         from: acc.address,
    //         gas: 50000
    //     });
    // } catch (e) {
    //     console.error('approve error:', e);
    //     process.exit(1);
    // }

    c("--- 2 发出买币诱导交易 ---");
    // let nonce = await web3.eth.getTransactionCount(acc.address);
    // c(`nonce ${nonce}`);
    //
    // async function two() {
    //     try {
    //         await uniRoute2.methods
    //             .swapExactTokensForTokens(tradeAmount, 0, [cc.token.weth.address, cc.token.dai.address], acc.address, timestamp + 300)
    //             .send({from: acc.address, gas: 150000, nonce: nonce, gasPrice: web3.utils.toWei('50', 'gwei')})
    //     } catch (e) {
    //         c("发出买币诱导交易 error: ", e);
    //         // process.exit();
    //     }
    // }
    // two();

    await common.sleep(3000);

    c("--- 3 撤销交易 ---");
    try {
        await web3.eth.sendTransaction({
            from: acc.address,
            to: acc.address,
            value: '0',
            nonce: 137,
            gasPrice: web3.utils.toWei('80', 'gwei'),
            gas: 40000,
        })
    } catch (e) {
        c('撤销交易', e);
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

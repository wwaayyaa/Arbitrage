const init = require('../../common/init').init();
const {web3, acc} = init.initWeb3AndAccount();
const arbitrageInfo = init.getArbitrage();


let cc = require("../../ChainConfig");
// let ca = require("../../ContractAddresses");
const {program} = require('commander');
const c = console.log;
let utils = web3.utils;
const GAS = process.env.APP_ENV == 'production' ? 300000 : 5000000;

(async () => {
    let gGasPrice = await web3.eth.getGasPrice();
    c(`gasPrice: ${gGasPrice}`);
    let timestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
    c(timestamp);

    //TOKEN
    let weth = new web3.eth.Contract(cc.token.weth.abi, cc.token.weth.address);
    let dai = new web3.eth.Contract(cc.token.dai.abi, cc.token.dai.address);
    let wbtc = new web3.eth.Contract(cc.token.wbtc.abi, cc.token.wbtc.address);
    let uniRoute2 = new web3.eth.Contract(cc.exchange.uniswap.router02.abi, cc.exchange.uniswap.router02.address)
    let sushiRoute2 = new web3.eth.Contract(cc.exchange.sushiswap.router02.abi, cc.exchange.sushiswap.router02.address)
    let uniPairETHDAI = new web3.eth.Contract(cc.exchange.uniswap.pair.abi, cc.exchange.uniswap.pair['dai-eth'].address);
    let sushiPairETHDAI = new web3.eth.Contract(cc.exchange.sushiswap.pair.abi, cc.exchange.sushiswap.pair['dai-eth'].address);
    let arbitrage = new web3.eth.Contract(arbitrageInfo.abi, arbitrageInfo.address)
    let warpETHContract = new web3.eth.Contract(cc.wrapETH.abi, cc.wrapETH.address);

    program.version('0.0.1')
        .command('transform <token> <amount>')
        .description("transfer to weth/eth")
        .action(async function (token, amount) {
            if (token == 'weth') {
                await warpETHContract.methods.deposit().send({
                    from: acc.address,
                    value: web3.utils.toWei(amount, 'ether'),
                    gas: GAS,
                    gasPrice: gGasPrice
                });
            } else if (token = 'eth') {
                await warpETHContract.methods.withdraw(web3.utils.toWei(amount, 'ether')).send({
                    from: acc.address,
                    gas: GAS,
                    gasPrice: gGasPrice
                });
            } else {
                console.error('unknown token:' + token);
            }
        });

    async function deposit(amount) {
        await depositOrWithdraw('deposit', amount);
    }

    async function withdraw(amount) {
        await depositOrWithdraw('withdraw', amount);
    }

    async function depositOrWithdraw(depoistOrWithdraw, amount) {
        if (depoistOrWithdraw == 'deposit') {
            await weth.methods.transfer(arbitrageInfo.address, web3.utils.toWei(amount, 'ether')).send({
                from: acc.address,
                gas: GAS,
                gasPrice: gGasPrice
            });
        } else if (depoistOrWithdraw = 'withdraw') {
            await arbitrage.methods
                .withdrawN(cc.token.weth.address, web3.utils.toWei(amount, 'ether'))
                .send({
                    from: acc.address, gas: GAS,
                    gasPrice: gGasPrice
                });
        } else {
            console.error('unknown depoistOrWithdraw:' + depoistOrWithdraw);
        }
    }

    program.version('0.0.1')
        .command('deposit <amount>')
        .description("deposit/withdraw to/from arbitrage contract")
        .action(deposit);
    program.version('0.0.1')
        .command('withdraw <amount>')
        .description("deposit/withdraw to/from arbitrage contract")
        .action(withdraw);
    program.version('0.0.1')
        .command('balance')
        .description("balance")
        .action(async function () {
            c("账户余额: ");
            c("eth: " + utils.fromWei(await web3.eth.getBalance(acc.address), 'ether'));
            c("dai: " + utils.fromWei(await dai.methods.balanceOf(acc.address).call(), 'ether'));
            c("wbtc: " + utils.fromWei(await wbtc.methods.balanceOf(acc.address).call(), 'gwei'));
            c("weth: " + utils.fromWei(await weth.methods.balanceOf(acc.address).call(), 'ether'));
            c("合约初始余额: ");
            c("eth: " + utils.fromWei(await web3.eth.getBalance(arbitrageInfo.address), 'ether'));
            c("dai: " + utils.fromWei(await dai.methods.balanceOf(arbitrageInfo.address).call(), 'ether'));
            c("weth: " + utils.fromWei(await weth.methods.balanceOf(arbitrageInfo.address).call(), 'ether'));
        });
    program.parse(process.argv);

})();

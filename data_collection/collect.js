// require('dotenv').config();
const init = require('../common/init').init();
const db = init.initDB();
const {acc} = init.initWeb3AndAccount();
const web3 = init.initLocalWeb3();

let common = require('../common/common');
let fs = require('fs');
let BN = require('bignumber.js');
let dayjs = require('dayjs');
/* 这个库和合约不同，使用币的个数计算，例如 3eth,10btc,0.003fee 这种 */
const calcHelper = require('./calc_comparisons.js');

let cc = require('../ChainConfig');

const axios = require('axios')

let ioc = require('socket.io-client');
let c = console.log;

let gTokens = [];

async function gasPriceMonitor(socket) {
    while (true) {
        try {
            let gasPrice = await web3.eth.getGasPrice();
            socket.emit('gasPrice', gasPrice);
            // console.log('gasPrice', gasPrice);
        } catch (e) {
            console.error(`gasPrice error:`, e);
        }
        await common.sleep(5000);
    }
}

async function defiCrawler(quote, socket) {
    let blockHeight = 0;
    let blockHash = "";

    let doIt = async function (q, blockHeight, socket) {
        let [err, priceList] = await getDeFiPrice(q.protocol, q.exchange, q.name, q.contract_address, q.args, q.fee);
        if (err) {
            console.error(`defiCrawler error: ${q.protocol} ${q.exchange} ${q.name} ${err.message || ""}`);
            return;
        }
        let now = new dayjs();
        let minute = now.format("YYYYMMDDHHmm");
        priceList = priceList.map(p => {
            p.protocol = q.protocol;
            p.exchange = q.exchange;
            p.minute = minute;
            p.height = blockHeight;
            return p;
        });

        socket.emit('collected_v3', priceList);

        [err, ok] = await db.updatePriceNowBatch(priceList);
        if (err) {
            console.error(`updatePriceNowBatch error: ${q.exchange} ${q.name} ${err.message || ""}`)
        }
        [err, ok] = await db.updatePriceHistoryBatch(priceList);
        if (err) {
            console.error(`updatePriceHistory error: ${q.exchange} ${q.name} ${err.message || ""}`)
        }
    };

    while (true) {
        let block = await web3.eth.getBlock("latest");
        if (block.number == blockHeight && block.hash == blockHash) {
            await common.sleep(1000);
            continue;
        }
        let now = new dayjs();
        blockHeight = block.number;
        blockHash = block.hash;
        console.log(`new block: ${blockHeight} ${blockHash} ${now.unix()}`);
        socket.emit('new_block', {height: blockHeight, hash: blockHash});

        //just fuck it
        for (let i = 0; i < quote.length; i++) {
            let q = quote[i];
            //并发提高速度
            doIt(q, blockHeight, socket)
        }

        await common.sleep(1000);
    }
}

async function cefiCrawler(quote, socket) {
    for (let i = 0; i < quote.length; i++) {
        let q = quote[i];
        collectCeFi(q.exchange, q.name, async function (e, priceList) {
            // socket
            if (e) {
                console.error(`collectCeFi callback error: ${e.message || ""}`);
                return;
            }
            let now = new dayjs();
            let minute = now.format("YYYYMMDDHHmm");
            priceList = priceList.map(p => {
                p.protocol = q.protocol;
                p.exchange = q.exchange;
                p.minute = minute;
                p.height = 0;
                return p;
            });
            let [err, ok] = await db.updatePriceNowBatch(priceList);
            if (err) {
                console.error(`updatePriceNowBatch error: ${q.exchange} ${q.name} ${err.message || ""}`)
                return;
            }
            [err, ok] = await db.updatePriceHistoryBatch(priceList);
            if (err) {
                console.error(`updatePriceHistory error: ${q.exchange} ${q.name} ${err.message || ""}`)
                return;
            }
            socket.emit('collected_v3', priceList);

        });
        await common.sleep(100);
    }
}



async function main() {
    common.memoryInfoForever(60000);
    let tokens = await db.getTokensKeyByToken();
    gTokens = tokens;

    //init socket
    let socket = ioc('http://localhost:2077');
    // let socket = ioc('http://localhost:8084', {
    //     path: '/s'
    // });
    // let block = await web3.eth.getBlock("latest");
    // c(block.number, block.hash);
    // return;
    // collect('0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852', {name:"eth/usdt"}, tokens);
    // return;

    const quote = await db.getQuotes();
    let cefiQuote = quote.filter(v => v.protocol == 'cefi');
    let defiQuote = quote.filter(v => v.protocol != 'cefi');
    //cefi 轮询或socket，defi监控出块
    cefiCrawler(cefiQuote, socket);
    defiCrawler(defiQuote, socket);
    gasPriceMonitor(socket);
}

async function getCefiPrice(exchangeName, quoteA, quoteB) {
    let price = -1;
    if (exchangeName == 'huobi') {
        try {
            let response = await axios.get('https://api.huobipro.com/market/trade?symbol=' + quoteA + quoteB)
            price = response.data.tick.data[0].price;
            return [null, price];
        } catch (e) {
            e.message = `get ${exchangeName} ${quoteA} ${quoteB}'s price error: ${e.message} `;
            return [e];
        }
    } else if (exchangeName == 'bian') {
        try {
            let symbolA = quoteA.toUpperCase();
            let symbolB = quoteB.toUpperCase();
            let response = await axios.get(`https://api.binance.com/api/v3/trades?symbol=${symbolA}${symbolB}&limit=1`);
            price = response.data[0].price;
            return [null, price];
        } catch (e) {
            e.message = `get ${exchangeName} ${quoteA} ${quoteB}'s price error: ${e.message} `;
            return [e];
        }
    } else if (exchangeName == 'ok') {
        try {
            let symbolA = quoteA.toUpperCase();
            let symbolB = quoteB.toUpperCase();
            let response = await axios.get(`https://www.okex.com/api/spot/v3/instruments/${symbolA}-${symbolB}/ticker`);
            price = response.data.last;
            return [null, price];
        } catch (e) {
            e.message = `get ${exchangeName} ${quoteA} ${quoteB}'s price error: ${e.message} `;
            return [e];
        }
    }
}

async function getDeFiPrice(protocol, exchange, quote, address, args, fee) {
    let err = null;
    let ret = [];
    if (protocol == 'uniswap') {
        [err, ret] = await getUniswapPrice(address, cc.exchange.uniswap.pair.abi, ...quote.split('/'), gTokens)
    } else if (protocol == 'balancer') {
        [err, ret] = await getBalancerPrice(address, cc.exchange.balancer.abi, quote.split('/'), args.split('/'), fee, gTokens);
    } else {
        return [new Error(`unsupported protocol: ${protocol}`)]
    }
    if (err) {
        return [err];
    }
    return [null, ret];
}

//需要知道quoteA、B，原因是减少合约的调用。否则就需要再调用两次token0、token1方法获取token的地址。节省时间。
async function getUniswapPrice(address, abi, quoteA, quoteB, tokens) {
    // 根据合约的
    let ctt = new web3.eth.Contract(abi, address);
    let reserves = [];
    try {
        reserves = await ctt.methods.getReserves().call({from: acc.address});
    } catch (e) {
        e.message = `getUniswapPrice getReserves error: ${e.message}`;
        return [e];
    }

    let reserve0 = reserves._reserve0;
    let reserve1 = reserves._reserve1;

    let amount0 = new BN(reserve0).div(new BN(10).pow(tokens[quoteA].decimal));
    let amount1 = new BN(reserve1).div(new BN(10).pow(tokens[quoteB].decimal));
    let price01 = amount1.div(amount0).toFixed(10);
    let price10 = amount0.div(amount1).toFixed(10);
    return [null, [
        {
            "quoteA": quoteA,
            "quoteB": quoteB,
            "price": price01,
            "master": quoteA < quoteB,
            "balanceA": amount0.toFixed(tokens[quoteA].decimal),
            "balanceB": amount1.toFixed(tokens[quoteB].decimal),
            "fee": 0.003,
        },
        {
            "quoteA": quoteB,
            "quoteB": quoteA,
            "price": price10,
            "master": quoteB < quoteA,
            "balanceA": amount1.toFixed(tokens[quoteB].decimal),
            "balanceB": amount0.toFixed(tokens[quoteA].decimal),
            "fee": 0.003,
        }
    ]];
}

//balancer 可能是N个token，需要动态计算
async function getBalancerPrice(address,
                                abi,
                                /*[] 该合约对应的token顺序, [usdt, usdc, ...]*/ quotes,
                                /*[integer] 币种对应了的宽度 */ weights,
                                fee,
                                tokens,
) {
    //方案一 1获取a的balance
    //方案一 2获取b的balance，然后根据公式计算出spotPrice
    //方案二，直接调用 getSpotPrice 获取两两交易对的价格 （采用方案二把，io少一次（虽然合约内也会耗时），暂时也不需要balance数据。）
    //2020-12-18 现在需要更多的数据来计算出滑点
    let ctt = new web3.eth.Contract(abi, address);
    //先获取所有的余额
    let balances = [];
    try {
        for (let i = 0; i < quotes.length; i++) {
            let balance = await ctt.methods.getBalance(tokens[quotes[i]].address).call();
            balances.push(new BN(balance).div(new BN(10).pow(tokens[quotes[i]].decimal)).toFixed(tokens[quotes[i]].decimal));
        }
    } catch (e) {
        e.message = `get balancer error: ${e.message}`;
        return [e]
    }

    let priceList = [];
    for (let i = 0; i < quotes.length - 1; i++) {
        for (let j = i + 1; j < quotes.length; j++) {
            let spotPrice = new calcHelper.BalancerUtils().calcSpotPrice(balances[i], weights[i], balances[j], weights[j], fee);
            priceList.push({
                "quoteA": quotes[j],
                "quoteB": quotes[i],
                "price": new BN(spotPrice).toFixed(10),
                "master": quotes[j] < quotes[i],
                "weightA": weights[j],
                "weightB": weights[i],
                "balanceA": balances[j],
                "balanceB": balances[i],
                "fee": fee,
            });
            spotPrice = new calcHelper.BalancerUtils().calcSpotPrice(balances[j], weights[j], balances[i], weights[i], fee);
            // c('~~~', spotPrice);
            priceList.push({
                "quoteA": quotes[i],
                "quoteB": quotes[j],
                "price": new BN(spotPrice).toFixed(10),
                "master": quotes[i] < quotes[j],
                "weightA": weights[i],
                "weightB": weights[j],
                "balanceA": balances[i],
                "balanceB": balances[j],
                "fee": fee,
            });

            // let spotPrice = 0;
            // try {
            //     //getSpotPrice 得到的和我们的系统规范是反的。他们的算法 in USDC/out ETH = 546.554581 。所以放到quoteA、B的时候反过来放。
            //     // decimal  usdc|6 - eth|18 = -12, 所以divisor是10^-12。返回的price是eth/usdc的546554581,先缩小18位（BONE），再放大12位。
            //     spotPrice = await ctt.methods.getSpotPrice(tokens[quotes[i]].address, tokens[quotes[j]].address).call({from: acc.address});
            //     //需要考虑两个token的decimal的差，同时还要考虑BONE（10**18）单位是wei
            //     let divisor = new BN(Math.pow(10, tokens[quotes[i]].decimal - tokens[quotes[j]].decimal));
            //     let balancerBONE = new BN(10).pow(18);
            //     priceList.push({
            //         "quoteA": quotes[j],
            //         "quoteB": quotes[i],
            //         "price": new BN(spotPrice).div(divisor).div(balancerBONE).toFixed(8),
            //         "master": quotes[i] > quotes[j], //必须这样写
            //     });
            //     spotPrice = await ctt.methods.getSpotPrice(tokens[quotes[j]].address, tokens[quotes[i]].address).call({from: acc.address});
            //     priceList.push({
            //         "quoteA": quotes[i],
            //         "quoteB": quotes[j],
            //         "price": new BN(spotPrice).times(divisor).div(balancerBONE).toFixed(8),
            //         "master": quotes[i] < quotes[j],
            //     });
            // } catch (e) {
            //     return [e];
            // }
        }
    }
    return [null, priceList];
}

//异步并发执行，多个交易所、多个币种独立抓取。同步返回会影响后去请求。 callback用于在获取到数据后到行为
async function collectCeFi(exchangeName, quoteName, callback) {
    while (true) {
        let [quoteA, quoteB] = quoteName.split('/');
        let [error, price] = await getCefiPrice(exchangeName, quoteA, quoteB);
        if (error) {
            if (callback) {
                await callback(error);
            }
            await common.sleep(15000);
            continue;
        }

        if (callback) {
            await callback(null, [
                {"quoteA": quoteA, "quoteB": quoteB, "price": price, "master": quoteA < quoteB, "fee": 0.002},
                {"quoteA": quoteB, "quoteB": quoteA, "price": (1 / price).toFixed(10), "master": quoteB < quoteA, "fee": 0.002}
            ]);
        }

        await common.sleep(15000);
    }
}

main();

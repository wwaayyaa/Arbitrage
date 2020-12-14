require('dotenv').config();
let common = require('../common/common');
let struct = require('../common/struct');
let fs = require('fs');
let BN = require('bignumber.js');
let dayjs = require('dayjs');

let Web3 = require('web3');
let web3;
if (process.env.APP_ENV == 'production') {
    web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/9cc52b7d92aa4107addd8dcf83a8b008"));
} else {
    web3 = new Web3('http://0.0.0.0:8545');
}

// let web3 = new Web3('http://8.210.15.226:8545');
let cc = require('../ChainConfig');

let Exchange = require('./exchange/exchange');
let Pair = require('./exchange/pair');
const axios = require('axios')

let ioc = require('socket.io-client');
let c = console.log;
const {Sequelize} = require('sequelize');
const sql = new Sequelize(process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql'
});
const dingKey = process.env.DING_KEY;
const acc = web3.eth.accounts.privateKeyToAccount('0x9679727a20329d53f114382ea91b6f9e1e3e0b622f79a44bd53a5b2fb794171d');
let gTokens = [];

async function loadTokens(sql) {
    let tokens = await sql.query("SELECT * FROM `token` ;", {type: 'SELECT'});
    let ret = {};
    tokens.forEach(i => {
        ret[i.name] = i;
    });
    return ret;
}

async function defiCrawler(quote, socket) {
    let blockHeight = 0;
    let blockHash = "";

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
        //块变化，需要更新所有价格
        //just fuck it
        for (let i = 0; i < quote.length; i++) {
            let q = quote[i];
            let [err, priceList] = await getDeFiPrice(q.protocol, q.exchange, q.name, q.contract_address);
            if (err) {
                console.error(`defiCrawler error: ${q.protocol} ${q.exchange} ${q.name} ${err.message || ""}`);
                continue;
            }
            let now = new dayjs();
            let minute = now.format("YYYYMMDDHHmm");
            priceList = priceList.map(p => {
                p.protocol = q.protocol;
                p.exchange = q.exchange;
                p.quote = `${p.quoteA}/${p.quoteB}`;
                p.minute = minute;
                p.height = blockHeight;
                return p;
            });
            [err, ok] = await updatePriceNowBatch(priceList);
            if (err) {
                console.error(`updatePriceNowBatch error: ${q.exchange} ${q.name} ${err.message || ""}`)
                continue;
            }
            [err, ok] = await updatePriceHistoryBatch(priceList);
            if (err) {
                console.error(`updatePriceHistory error: ${q.exchange} ${q.name} ${err.message || ""}`)
                continue;
            }
            let SocketCollectedPriceInfoList = priceList.map(p => {
                return new struct.SocketCollectedPriceInfo(p.protocol, p.exchange, p.quoteA, p.quoteB, p.price, blockHeight);
            });
            socket.emit('collected_v3', SocketCollectedPriceInfoList);
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
                p.quote = `${p.quoteA}/${p.quoteB}`;
                p.minute = minute;
                p.height = 0;
                return p;
            });
            let [err, ok] = await updatePriceNowBatch(priceList);
            if (err) {
                console.error(`updatePriceNowBatch error: ${q.exchange} ${q.name} ${err.message || ""}`)
                return;
            }
            [err, ok] = await updatePriceHistoryBatch(priceList);
            if (err) {
                console.error(`updatePriceHistory error: ${q.exchange} ${q.name} ${err.message || ""}`)
                return;
            }
            let SocketCollectedPriceInfoList = priceList.map(p => {
                return new struct.SocketCollectedPriceInfo(p.protocol, p.exchange, p.quoteA, p.quoteB, p.price);
            });
            socket.emit('collected_v3', SocketCollectedPriceInfoList);

            // for (let i = 0; i < priceList.length; i++) {
            //     let price = priceList[i];
            //     let priceInfo = new struct.SocketCollectedPriceInfo(q.protocol, q.exchange, price.quoteA, price.quoteB, price.price);
            //     socket.emit('collected_v3', priceInfo);
            //     let [err, ok] = await updatePriceNow(q.protocol, q.exchange, price.quoteA + '/' + price.quoteB, price.price, 0);
            //     if (err) {
            //         console.error(`collectCeFi updatePriceNow error: ${err.message || ""}`);
            //     }
            //     let now = new dayjs();
            //     [err, ok] = await updatePriceHistory(q.protocol, q.exchange, now.format("YYYYMMDDHHmm"), price.quoteA + '/' + price.quoteB, price.price, 0);
            //     if (err) {
            //         console.error(`collectCeFi updatePriceHistory error: ${err.message || ""}`);
            //     }
            // }
        });
        await common.sleep(100);
    }
}

async function updatePriceNow(protocol, exchange, quote, price, height) {
    let now = new dayjs();
    try {
        await sql.query("insert into price_now (protocol, exchange, quote, price, updated_height, updated_at) " +
            "values (?, ?, ?, ?, ?, ?) " +
            "on duplicate key update " +
            "price = values(price),updated_height = values(updated_height),updated_at = values(updated_at) ",
            {
                replacements: [protocol, exchange, quote, price, height || 0, now.format("YYYY-MM-DD HH:mm:ss")],
                type: 'INSERT'
            })
    } catch (e) {
        return [e, false];
    }
    return [null, true];
}

async function updatePriceNowBatch(priceList) {
    let now = new dayjs();
    now = now.format("YYYY-MM-DD HH:mm:ss");
    let args = [];
    let values = [];
    for (let i = 0; i < priceList.length; i++) {
        let p = priceList[i];
        args.push(p.protocol, p.exchange, p.quote, p.price, p.height, now);
        values.push('(?, ?, ?, ?, ?, ?)');
    }
    values = values.join(',');
    try {
        await sql.query("insert into price_now (protocol, exchange, quote, price, updated_height, updated_at) " +
            `values ${values} ` +
            "on duplicate key update " +
            "price = values(price),updated_height = values(updated_height),updated_at = values(updated_at) ",
            {
                replacements: args,
                type: 'INSERT'
            })
    } catch (e) {
        return [e, false];
    }
    return [null, true];
}

async function updatePriceHistory(protocol, exchange, minute, quote, price, height) {
    let now = new dayjs();
    try {
        await sql.query("insert into price_history (protocol, exchange, minute, quote, price, updated_height, updated_at) " +
            "values (?, ?, ?, ?, ?, ?, ?) " +
            "on duplicate key update " +
            "price = values(price),updated_height = values(updated_height),updated_at = values(updated_at) ",
            {
                replacements: [protocol, exchange, minute, quote, price, height || 0, now.format("YYYY-MM-DD HH:mm:ss")],
                type: 'INSERT'
            })
    } catch (e) {
        return [e, false];
    }
    return [null, true];
}

async function updatePriceHistoryBatch(priceList) {
    let now = new dayjs();
    now = now.format("YYYY-MM-DD HH:mm:ss");
    let args = [];
    let values = [];
    for (let i = 0; i < priceList.length; i++) {
        let p = priceList[i];
        args.push(p.protocol, p.exchange, p.minute, p.quote, p.price, p.height, now);
        values.push('(?, ?, ?, ?, ?, ?, ?)');
    }
    values = values.join(',');
    try {
        await sql.query("insert into price_history (protocol, exchange, minute, quote, price, updated_height, updated_at) " +
            `values ${values} ` +
            "on duplicate key update " +
            "price = values(price),updated_height = values(updated_height),updated_at = values(updated_at) ",
            {
                replacements: args,
                type: 'INSERT'
            })
    } catch (e) {
        return [e, false];
    }
    return [null, true];
}

async function main() {
    let tokens = await loadTokens(sql);
    gTokens = tokens

    //init socket
    let socket = ioc('http://localhost:8084', {
        path: '/s'
    });
    // let block = await web3.eth.getBlock("latest");
    // c(block.number, block.hash);
    // return;
    // collect('0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852', {name:"eth/usdt"}, tokens);
    // return;

    const quote = await sql.query("SELECT * FROM `quote` where enabled = 1;", {type: 'SELECT'});
    let cefiQuote = quote.filter(v => v.protocol == 'cefi');
    let defiQuote = quote.filter(v => v.protocol != 'cefi');
    //cefi 轮询或socket，defi监控出块
    cefiCrawler(cefiQuote, socket);
    defiCrawler(defiQuote, socket);

}

async function collect(contractAddress, q, tokens, socket, tableName, quoteName, reverse) {
    //需要知道合约地址、abi
    // let exchangeName = q.exchange;
    let [token0, token1] = q.name.split('/');
    if (!tokens.hasOwnProperty(token0) || !tokens.hasOwnProperty(token1)) {
        console.error(`${token0}-${token1} missing config information `)
        return;
    }

    let pairContract = new web3.eth.Contract(cc.exchange.uniswap.pair.abi, contractAddress);
    let reserves = await pairContract.methods.getReserves().call({from: acc.address});

    let reserve0 = reserves._reserve0;
    let reserve1 = reserves._reserve1;

    let amount0 = new BN(reserve0).div(new BN(10).pow(tokens[token0].decimal));
    let amount1 = new BN(reserve1).div(new BN(10).pow(tokens[token1].decimal));
    let price01 = amount0.div(amount1).toFixed(8);
    let price10 = amount1.div(amount0).toFixed(8);
    console.log(price01, price10);
    return;
    socket.emit('collected', {
        exchangeName,
        quoteName,
        price: (reverse ? (1 / info['price']).toFixed(8) : info['price'])
    });

    let now = new dayjs();
    sql.query("insert into " + tableName + " (minute, price) values (?, ?) on duplicate key update price = values(price);",
        {
            replacements: [now.format("YYYYMMDDHHmm"), (reverse ? (1 / info['price']).toFixed(8) : info['price'])],
            type: 'INSERT'
        })

    await common.sleep(30000);
}

async function collectOld(exchangeName, pairName, socket, tableName, quoteName, reverse) {
    let ex = new Exchange(exchangeName, cc.exchange[exchangeName].router02.address, cc.exchange[exchangeName].router02.abi, web3, acc);
    ex.setPair(new Pair(pairName, cc.exchange[exchangeName].pair[pairName].address, cc.exchange[exchangeName].pair[pairName].abi));
    let [name0, name1] = pairName.split('-');
    while (true) {
        //不同的swap指标不一样，现在先监控 流动性和价格
        let info;
        try {
            info = await ex.getPriceInfo();
        } catch (e) {
            console.log('get price info error.', e.message || "");
            await common.sleep(4000);
            continue;
        }
        info['name0'] = name0;
        info['name1'] = name1;
        info['decimal0'] = cc.token[name0].decimals;
        info['decimal1'] = cc.token[name1].decimals;
        let reserve0 = new BN(info['reserve0']);
        let reserve1 = new BN(info['reserve1']);
        info['amount0'] = reserve0.div(new BN(10).pow(info['decimal0'])).toFixed(8);
        info['amount1'] = reserve1.div(new BN(10).pow(info['decimal1'])).toFixed(8);
        info['price'] = (new BN(info['amount0'])).div(info['amount1']).toFixed(8);
        // console.log(exchangeName, pairName, info);

        //socketio
        socket.emit('collected', {
            exchangeName,
            quoteName,
            price: (reverse ? (1 / info['price']).toFixed(8) : info['price'])
        });

        let now = new dayjs();
        sql.query("insert into " + tableName + " (minute, price) values (?, ?) on duplicate key update price = values(price);",
            {
                replacements: [now.format("YYYYMMDDHHmm"), (reverse ? (1 / info['price']).toFixed(8) : info['price'])],
                type: 'INSERT'
            })

        await common.sleep(30000);
    }
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

async function getDeFiPrice(protocol, exchange, quote, address) {
    let err = null;
    let ret = [];
    if (protocol == 'uniswap') {
        [err, ret] = await getUniswapPrice(address, cc.exchange.uniswap.pair.abi, ...quote.split('/'), gTokens)
    } else if (protocol == 'balancer') {
        [err, ret] = await getBalancerPrice(address, cc.exchange.balancer.abi, quote.split('/'), gTokens);
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
    let price01 = amount1.div(amount0).toFixed(8);
    let price10 = amount0.div(amount1).toFixed(8);

    return [null, [
        {"quoteA": quoteA, "quoteB": quoteB, "price": price01},
        {"quoteA": quoteB, "quoteB": quoteA, "price": price10}
    ]];
}

//balancer 可能是N个token，需要动态计算
async function getBalancerPrice(address,
                                abi,
                                /*该合约对应的token顺序,[usdt, usdc, ...]*/ quotes,
                                // /*和quotes相对应*/ weights,
                                tokens) {
    let ctt = new web3.eth.Contract(abi, address);
    let priceList = [];
    for (let i = 0; i < quotes.length - 1; i++) {
        //方案一 1获取a的balance
        for (let j = i + 1; j < quotes.length; j++) {
            //方案一 2获取b的balance，然后工具公式计算出spotPrice
            //方案二，直接调用 getSpotPrice 获取两两交易对的价格 （采用方案二把，io少一次（虽然合约内也会耗时），暂时也不需要balance数据。）
            let spotPrice = 0;
            try {
                //getSpotPrice 得到的和我们的系统规范是反的。他们的算法 in USDC/out ETH = 546.554581 。所以放到quoteA、B的时候反过来放。
                // decimal  usdc|6 - eth|18 = -12, 所以divisor是10^-12。返回的price是eth/usdc的546554581,先缩小18位（BONE），再放大12位。
                spotPrice = await ctt.methods.getSpotPrice(tokens[quotes[i]].address, tokens[quotes[j]].address).call({from: acc.address});
                //需要考虑两个token的decimal的差，同时还要考虑BONE（10**18）单位是wei
                let divisor = new BN(Math.pow(10, tokens[quotes[i]].decimal - tokens[quotes[j]].decimal));
                let balancerBONE = new BN(10).pow(18);
                priceList.push({
                    "quoteA": quotes[j],
                    "quoteB": quotes[i],
                    "price": new BN(spotPrice).div(divisor).div(balancerBONE).toFixed(8)
                });
                spotPrice = await ctt.methods.getSpotPrice(tokens[quotes[j]].address, tokens[quotes[i]].address).call({from: acc.address});
                priceList.push({
                    "quoteA": quotes[i],
                    "quoteB": quotes[j],
                    "price": new BN(spotPrice).times(divisor).div(balancerBONE).toFixed(8)
                });
            } catch (e) {
                return [e];
            }
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
                {"quoteA": quoteA, "quoteB": quoteB, "price": price},
                {"quoteA": quoteB, "quoteB": quoteA, "price": (1 / price).toFixed(8)}
            ]);
        }

        await common.sleep(15000);
    }
}


function createTable(sql, tableName) {
    try {
        sql.query("create table " + tableName + " like single_price_minute_tpl");
    } catch (e) {

    }
}

main();

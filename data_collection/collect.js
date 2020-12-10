require('dotenv').config();
let common = require('../common/common');
let fs = require('fs');
let BN = require('bignumber.js');
let dayjs = require('dayjs');

let Web3 = require('web3');
let web3 = new Web3('http://8.210.15.226:8545');
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

async function loadTokens(sql) {
    let tokens = await sql.query("SELECT * FROM `token` ;", {type: 'SELECT'});
    let ret = {};
    tokens.forEach(i => {
        ret[i.name] = i;
    });
    return ret;
}

async function defiCrawler(quote) {
    let blockHeight = 0;
    let blockHash = "";

    while (true) {
        let block = await web3.eth.getBlock("latest");
        if (block.number == blockHeight && block.hash == blockHash) {
            await common.sleep(1000);
            continue;
        }
        //块变化，需要更新所有价格
        //just fuck it


        await common.sleep(1000);
    }
}

async function cefiCrawler(quote) {
    for (let i = 0; i < quote.length; i++) {
        let q = quote[i];
        let [n0, n1] = q.name.split('/');
        let tableName = 'single_price_minute_' + q.exchange + '_' + n0 + '_' + n1;

        // createTable(sql, tableName);

        collectCeFi(q.exchange, q.name, async function (e, price) {
            // socket
            c('callback', e, price);
        });
        await common.sleep(100);
    }
}

async function main() {
    let tokens = await loadTokens(sql);

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
    cefiCrawler(cefiQuote);
    defiCrawler(defiQuote);

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

async function collectCeFi(exchangeName, quoteName, callback) {
    let price = -1;
    let err = null;
    while (true) {
        if (exchangeName == 'huobi') {
            try {
                let response = await axios.get('https://api.huobipro.com/market/trade?symbol=' + quoteName.replace('\/', ''))
                price = response.data.tick.data[0].price;
            } catch (e) {
                err = e;
                console.error(`huobi error: ${exchangeName}, ${quoteName}, ${e}`);
            }
        } else if (exchangeName == 'bian') {
            try {
                let symbol = quoteName.replace('\/', '').toUpperCase();
                let response = await axios.get(`https://api.binance.com/api/v3/trades?symbol=${symbol}&limit=1`);
                price = response.data[0].price;
            } catch (e) {
                err = e;
                console.error(`bian error: ${exchangeName}, ${quoteName}, ${e}`);
            }
        } else if (exchangeName == 'ok') {
            try {
                let symbol = quoteName.replace('\/', '-').toUpperCase();
                let response = await axios.get(`https://www.okex.com/api/spot/v3/instruments/${symbol}/ticker`);
                price = response.data.last;
            } catch (e) {
                err = e;
                console.error(`ok error: ${exchangeName}, ${quoteName}, ${e}`);
            }
        }

        price = price - 0;
        if (price == -1) {
            if (callback) {
                await callback(err, null);
            }
            await common.sleep(15000);
            continue;
        }
        if (callback) {
            await callback(null, price);
        }
        // socket.emit('collected', {exchangeName, quoteName, price});
        // let now = new dayjs();
        // try {
        //     sql.query("insert into " + tableName + " (minute, price) values (?, ?) on duplicate key update price = values(price);",
        //         {
        //             replacements: [now.format("YYYYMMDDHHmm"), price],
        //             type: 'INSERT'
        //         });
        // } catch (e) {
        //     console.error(`insert error: ${exchangeName}, ${quoteName}, ${e}`)
        // }

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

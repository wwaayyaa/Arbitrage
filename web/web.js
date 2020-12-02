require('dotenv').config();
const koa = require('koa');
const path = require('path');
const koaStatic = require('koa-static');
const render = require('koa-art-template')
const template = require('art-template')
template.defaults.rules.pop()
// var rule = template.defaults.rules[0];
// rule.test = new RegExp(rule.test.source.replace('<%', '<\\\?').replace('%>', '\\\?>'));
const basicAuth = require('koa-basic-auth');
const app = new koa()
const dayjs = require('dayjs');
let cc = require('../ChainConfig');
const axios = require('axios')

const Web3 = require('web3');
const web3 = new Web3('http://0.0.0.0:9545');
// const web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/9cc52b7d92aa4107addd8dcf83a8b008"));

const Binance = require('node-binance-api');
const binance = new Binance().options({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET
});
const acc = web3.eth.accounts.privateKeyToAccount(process.env.ETH_PRIVATE_KEY)
let msgTPL = {
    "msgtype": "markdown",
    "markdown": {
        "title": "",
        "text": "",
    },
};

(async function () {
    async function uniTrade() {
        //test ETH -> TOKEN
        let timestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp
        let ethBalance = await web3.eth.getBalance(acc.address)
        console.log(ethBalance);

        await uniRoute2.methods
            .swapExactETHForTokens(0, [cc.token.weth.address, cc.token.usdt.address], acc.address, timestamp + 300)
            .send({from: acc.address, value: web3.utils.toWei(tradeETH), gas: 5000000})

        ethBalance = await web3.eth.getBalance(acc.address)
        console.log(ethBalance);
        let usdt = new web3.eth.Contract(cc.token.usdt.abi, cc.token.usdt.address)
        let usdtBalance =await usdt.methods.balanceOf(acc.address).call();
        console.log(usdtBalance)
        console.log(1);
        await usdt.methods.approve(cc.exchange.uniswap.router02.address, usdtBalance).send({from: acc.address, gas: 5000000})
        console.log(2);
        await uniRoute2.methods
            .swapExactTokensForETH(usdtBalance, 0, [cc.token.usdt.address, cc.token.weth.address], acc.address, timestamp + 300)
            .send({from: acc.address, gas: 5000000})
        console.log(3);
        ethBalance = await web3.eth.getBalance(acc.address)
        console.log(ethBalance);
        usdt = new web3.eth.Contract(cc.token.usdt.abi, cc.token.usdt.address)
        console.log(await usdt.methods.balanceOf(acc.address).call())

    }
    try {
        await uniTrade()

        /* {
          symbol: 'ETHUSDT',
          orderId: 2064332688,
          orderListId: -1,
          clientOrderId: 'JBosMtrqYhMiH1eYaGgCKh',
          transactTime: 1605862412092,
          price: '0.00000000',
          origQty: '0.10000000',
          executedQty: '0.10000000',
          cummulativeQuoteQty: '49.86200000',
          status: 'FILLED',
          timeInForce: 'GTC',
          type: 'MARKET',
          side: 'BUY',
          fills: [
            {
              price: '498.62000000',
              qty: '0.10000000',
              commission: '0.00010000',
              commissionAsset: 'ETH',
              tradeId: 208970173
            }
          ]
        }
        */
        // let ret = await binance.marketBuy('ETHUSDT', 0.1)
        // let ret = await binance.marketSell('ETHUSDT', 0.1998)
        // console.log('ret', ret);
    } catch (e) {
        console.log('ee', e)
    }

})()
const {Sequelize} = require('sequelize');
const sql = new Sequelize(process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql'
});

//内存的table
let priceData = {};

let uniRoute2 = new web3.eth.Contract(cc.exchange.uniswap.router02.abi, cc.exchange.uniswap.router02.address)
let tradeETH = "0.1";

render(app, {
    root: path.join(__dirname, 'views'),
    extname: '.html',
    debug: process.env.NODE_ENV !== 'production',
});
const server = require('http').createServer(app.callback())
const io = require('socket.io')(server, {path: '/s'})
//监听connect事件
io.on('connection', socket => {
    // console.log('connected');
    socket.on('collected', async (data) => {
        // console.log('~', data);
        pushData(data.exchangeName, data.quoteName, data.price);
        // console.log('~~', priceData);

        socket.broadcast.emit('price', data);

        //监控币安和uni的eth/usdt价格。
        if (data.quoteName == 'eth/usdt' && (data.exchangeName == 'bian' || data.exchangeName == 'uniswap')) {
            let key = `${data.exchangeName}-${data.quoteName}`;
            let uniKey = `uniswap-eth/usdt`;
            let bianKey = `bian-eth/usdt`;
            let uniPrice = priceData[uniKey];
            let bianPrice = priceData[bianKey];

            if (Math.abs(bianPrice / uniPrice - 1) >= 0.01) {
                job = true;
            }
        }
    });

    socket.on('init', data => {
        socket.emit('init_price', priceData);
    });

    // socket.emit('init_price', priceData);

    // socket.on('history', (pairName) => {
    //     console.log('pairName', pairName);
    //     let history = db.get('history.' + pairName).value()
    //         .filter(n => {
    //             return n.timestamp > (Math.round(new Date().getTime() / 1000) - 3600 * 24 * 7)
    //         });
    //     socket.emit('historyList', {pairName, history});
    // });

    //如果未来关注的数据多了，使用room特性  join/to/leave

    //监听disconnect事件
    socket.on('disconnect', () => {
        // console.log('disconnect')
    });
});

app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        if (401 == err.status) {
            ctx.status = 401;
            ctx.set('WWW-Authenticate', 'Basic');
            ctx.body = 'cant haz that';
        } else {
            throw err;
        }
    }
    // ctx.body = 'Hello World';
});
app.use(koaStatic(path.join(__dirname, './static')));
app.use(basicAuth({name: 'poolin', pass: ''}));
app.use(async (ctx) => {
    if (ctx.request.path == '/api/quote') {
        const quote = await sql.query("SELECT * FROM `quote` where enabled = 1;", {type: 'SELECT'});
        ctx.response.body = quote;
    } else if (ctx.request.path == '/api/minute_history') {
        let exchangeName = ctx.request.query.exchange_name || '';
        let limit = ctx.request.query.limit || 1440;
        let [n0, n1] = ctx.request.query.symbol.split('-') || '';
        let tableName = `single_price_minute_${exchangeName}_${n0}_${n1}`;
        const history = await sql.query(`select * from (SELECT * FROM ${tableName} order by minute desc limit ${limit} ) aa order by minute asc;`, {type: 'SELECT'});
        let now = new dayjs();
        let begin = now.subtract(limit, 'm');
        let data = [];
        while (begin.unix() < now.unix()) {
            let m = begin.format('YYYYMMDDHHmm');
            let find = history.find(h => h.minute == m);
            let price = find ? find.price : null
            data.push({
                minute: m,
                price,
            })
            begin = begin.add(1, 'm');
        }
        ctx.response.body = data;
    } else {
        await ctx.render('new', {cc: JSON.stringify(cc)});
    }
});
server.listen(8084);

//交易对数据
let pushData = function (exchangeName, quoteName, price) {
    let key = `${exchangeName}-${quoteName}`;
    priceData[key] = price;
};

let job = false;

//串行执行任务
(async () => {
    while (true) {
        if (job) {
            job = false;

            console.log('do job');
            let uniKey = `uniswap-eth/usdt`;
            let bianKey = `bian-eth/usdt`;
            let uniPrice = priceData[uniKey];
            let bianPrice = priceData[bianKey];
            // uniPrice = 30;
            // bianPrice = 10;

            //先发个通知
            let msg = msgTPL;
            msg.markdown = {
                "title": "[DeFi] 发现搬砖机会，准备干他。",
                "text": `[DeFi] 币安：${bianPrice}， uniswap：${uniPrice}`
            };
            //兑币价差，如果达到1%，就进行买卖。
            if (Math.abs(bianPrice / uniPrice - 1) >= 0.01) {
                ding(msg);
                //谁的价格高，就在这个交易所卖出eth，在另外一边买入eth
                if (bianPrice > uniPrice) {
                    //e.g.  eth/usdt: 380 > 370
                    //交易前还要判断余额是否足够，够的情况下才能交易。
                    let usdt = new web3.eth.Contract(cc.token.usdt.abi, cc.token.usdt.address);
                    let usdtBalance = await usdt.methods.balanceOf(acc.address).call();
                    console.log(usdtBalance);
                    let ethBalance = (await binance.balance())['ETH']['available'];
                    console.log(ethBalance);
                    if (ethBalance < tradeETH || usdtBalance / uniPrice < tradeETH) {
                        let msg = msgTPL;
                        msg.markdown = {
                            "title": "[DeFi] 余额不足，无法执行。",
                            "text": `余额不足，无法执行`
                        };
                        ding(msg);
                        await sleep(1000);
                        continue;
                    }
                    let msg = msgTPL;
                    msg.markdown = {
                        "title": "[DeFi] 币安卖出eth，uniswap买入eth。",
                        "text": "[DeFi] 币安卖出eth，uniswap买入eth。"
                    };
                    ding(msg);
                    try {
                        //TODO 交易单位是 bigint
                        // await usdt.methods.approve(cc.exchange.uniswap.router02.address, tradeETH * uniPrice).send({from: acc.address, gas: 5000000})
                        // await uniRoute2.methods
                        //     .swapExactTokensForETH(utils.toWei(tradeETH * uniPrice, 'ether'), 0, [cc.token.usdt.address, cc.token.weth.address], acc.address, timestamp + 300)
                        //     .send({from: acc.address, gas: 5000000})
                        //
                        // let ret = await binance.marketSell('ETHUSDT', tradeETH)
                        // if(ret.status != 'FILLED'){
                        //     return;
                        // }
                        let msg = msgTPL;
                        msg.markdown = {
                            "title": "[DeFi] 执行完成。",
                            "text": `执行完成。`
                        };
                        ding(msg);
                    } catch (e) {
                        //todo
                    }

                } else {
                    //e.g.  eth/usdt: 370 < 380  ｜ bianPrice < uniPrice
                    let ethBalance = await web3.eth.getBalance(acc.address)
                    console.log(ethBalance);
                    let usdtBalance = (await binance.balance())['USDT']['available'];
                    console.log(usdtBalance);
                    if (ethBalance < tradeETH || usdtBalance / uniPrice < tradeETH) {
                        let msg = msgTPL;
                        msg.markdown = {
                            "title": "[DeFi] 余额不足，无法执行。",
                            "text": `余额不足，无法执行`
                        }
                        ding(msg);
                        await sleep(1000);
                        continue;
                    }
                    let msg = msgTPL;
                    msg.markdown = {
                        "title": "[DeFi] 币安买入eth，uniswap卖出eth。",
                        "text": "[DeFi] 币安买入eth，uniswap卖出eth。",
                    };
                    ding(msg);
                    try {
                        // await uniRoute2.methods
                        //     .swapExactETHForTokens(0, [cc.token.weth.address, cc.token.usdt.address], acc.address, timestamp + 300)
                        //     .send({from: acc.address, value: tradeETH, gas: 5000000})
                        //
                        // let ret = await binance.marketBuy('ETHUSDT', tradeETH)
                        // if(ret.status != 'FILLED'){
                        //     return;
                        // }
                        let msg = msgTPL;
                        msg.markdown = {
                            "title": "[DeFi] 执行完成。",
                            "text": `执行完成。`
                        };
                        ding(msg);
                    } catch (e) {
                        //todo
                    }

                }
            }

        }
        await sleep(100)
    }
})();

function sleep(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}


async function ding(msg) {
    // let msg = {
    //     "msgtype": "markdown",
    //     "markdown": {
    //         "title":"杭州天气",
    //         "text": "#### 杭州天气 @150XXXXXXXX \n> 9度，西北风1级，空气良89，相对温度73%\n> ![screenshot](https://img.alicdn.com/tfs/TB1NwmBEL9TBuNjy1zbXXXpepXa-2400-1218.png)\n> ###### 10点20分发布 [天气](https://www.dingtalk.com) \n"
    //     },
    //     "at": {
    //         "atMobiles": [
    //             "150XXXXXXXX"
    //         ],
    //         "isAtAll": false
    //     }
    // };
    try {
        let response = await axios.post('https://oapi.dingtalk.com/robot/send?access_token=612342ba40defdd26f3228f35bbd0aeddcf9de619d9d4f9f80c2b47d39e4d0d0', msg)
    } catch (e) {
        console.error(`huobi error: ${exchangeName}, ${quoteName}, ${e}`);
    }
}

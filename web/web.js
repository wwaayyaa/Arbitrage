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
let web3 = new Web3('http://0.0.0.0:9545');

const Binance = require('node-binance-api');
const binance = new Binance().options({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET
});

(async function () {
    ding()
    return;
    try {
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
let tradeETH = 0.1;

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
            job = true;

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
    if (job) {
        console.log('do job');
        let uniKey = `uniswap-eth/usdt`;
        let bianKey = `bian-eth/usdt`;
        let uniPrice = priceData[uniKey];
        let bianPrice = priceData[bianKey];
        //兑币价差，如果达到1%，就进行买卖。
        if (Math.abs(bianPrice / uniPrice - 1) >= 0.01) {
            //谁的价格高，就在这个交易所卖出eth，在另外一边买入eth
            if (bianPrice > uniPrice) {
                //e.g.  eth/usdt: 380 > 370
                //交易前还要判断余额是否足够，够的情况下才能交易。
                let usdt = new web3.eth.Contract(CC.token.usdt.abi, CC.token.usdt.address);
                let usdtBalance = await usdt.methods.balanceOf(acc.address).call();
                let ethBalance = (await binance.balance())['ETH']['available'];
                if (ethBalance < tradeETH || usdtBalance / uniPrice < tradeETH) {
                    return;
                }
                //交易前抢锁，有锁才能交易并记录数据。
                try {
                    await uniRoute2.methods
                        .swapExactTokensForETH(utils.toWei(tradeETH * uniPrice, 'ether'), 0, [CC.token.usdt.address, CC.token.weth.address], acc.address, timestamp + 300)
                        .send({from: acc.address, gas: 5000000})

                    let ret = await binance.marketSell('ETHUSDT', tradeETH)
                    if(ret.status != 'FILLED'){
                        return;
                    }
                }catch (e) {
                    //todo
                }

                //TODO bianTrade(eth, usdt), uniTrade(usdt, eth)
            } else {
                //TODO bianTrade(usdt, eth), uniTrade(eth, usdt)
            }
        }


        job = false;
    }
})();

async function ding(msg){
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

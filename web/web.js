const koa = require('koa')
const render = require('koa-art-template')
const template = require('art-template')
template.defaults.rules.pop()
// var rule = template.defaults.rules[0];
// rule.test = new RegExp(rule.test.source.replace('<%', '<\\\?').replace('%>', '\\\?>'));
const basicAuth = require('koa-basic-auth');
const app = new koa()
const path = require('path');
let cc = require('../ChainConfig');

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('database.json');
const db = low(adapter);
db.defaults({
    history: {
        'usdc-eth': [],
        'wbtc-eth': [],
        'eth-usdt': [],
        'dai-eth': [],
        'uni-eth': [],
        'comp-eth': [],
        'lend-eth': [],
        'yfi-eth': [],
    }
}).write();

//内存的table
let tableData = [];
let exchanges = Object.keys(cc.exchange);

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
    socket.emit('init_table', tableData);

    socket.on('collected', data => {
        pushData(data.exchangeName, data.pairName, data.info);

        socket.broadcast.emit('price', data);
    });

    socket.on('history', (pairName) => {
        console.log('pairName', pairName);
        let history = db.get('history.' + pairName).value()
            .filter(n => {
                return n.timestamp > (Math.round(new Date().getTime() / 1000) - 3600 * 24 * 7)
            });
        socket.emit('historyList', {pairName, history});
    });

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
app.use(basicAuth({ name: 'poolin', pass: '' }));
app.use(async (ctx) => {
    await ctx.render('dashboard', {cc: JSON.stringify(cc)});
});
server.listen(8084);

//交易对数据
let pushData = function (exchangeName, pairName, info) {
    //判断是否有交易对
    let existPair = false;
    let row;
    for (let i = 0; i < tableData.length; i++) {
        if (tableData[i].pair == pairName) {
            existPair = true;
            row = tableData[i];
            let max = 0, min = 0;
            for (let e in exchanges) {
                if (exchanges[e] == exchangeName) {
                    //匹配到cell
                    info.amount0Change = "";
                    info.amount1Change = "";
                    info.color = "";
                    if (info.amount0 > row[exchangeName].amount0) {
                        info.amount0Change = "↑";
                    } else if (info.amount0 < row[exchangeName].amount0) {
                        info.amount0Change = "↓";
                    }
                    if (info.amount1 > row[exchangeName].amount1) {
                        info.amount1Change = "↑";
                    } else if (info.amount1 < row[exchangeName].amount1) {
                        info.amount1Change = "↓";
                    }
                    if (info.price > row[exchangeName].price) {
                        info.color = "success-cell";
                        info.priceChange = "↑"
                    } else if (info.price < row[exchangeName].price) {
                        info.color = "danger-cell";
                        info.priceChange = "↓"
                    }
                    row[exchangeName] = info;

                    // $set(tableData, i, row);
                    // break;
                }
                let _tmp = 0;
                if (row[exchanges[e]].price != '') {
                    _tmp = row[exchanges[e]].price;
                } else {
                    continue;
                }
                if (min == 0) {
                    min = _tmp;
                } else if (min > _tmp) {
                    min = _tmp;
                }
                if (max == 0) {
                    max = _tmp;
                } else if (max < _tmp) {
                    max = _tmp;
                }

                // console.log(max, min);
                row.arbitrageRate = min == 0 ? 0 : ((max / min - 1) * 100).toFixed(6);

            }
            tableData[i] = row;
            break;
        }
    }
    if (!existPair) {
        row = {pair: pairName};
        //添加数据
        for (let e in exchanges) {
            if (exchanges[e] == exchangeName) {
                row[exchangeName] = info;
            } else {
                row[exchanges[e]] = {
                    reserve0: '-',
                    reserve1: '-',
                    price: ''
                }
            }
        }
        tableData.push(row);
    }
};


setInterval(() => {
    //每次把内存数据放到db中
    for (let i = 0; i < tableData.length; i++) {
        let pair = tableData[i].pair;

        let univ2Price = tableData[i].univ2.price;
        let sushiPrice = tableData[i].sushi.price;
        let arbitrageRate = tableData[i].arbitrageRate;

        let gt = Math.round(new Date().getTime() / 1000);
        let timestamp = gt - gt % 60;
        let key = 'history.' + pair;

        // db.set(key, 'sdfsdf').write();
        let data = {timestamp, univ2Price, sushiPrice, arbitrageRate};
        // console.log(key, data);

        if (db.get(key).find({timestamp}).value() == null) {
            db.get(key).push(data).write();
        } else {
            db.get(key).find({timestamp}).assign(data).write();
        }
    }
}, 6 * 1000);


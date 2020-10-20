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

const {Sequelize} = require('sequelize');
const sql = new Sequelize('price_monitor', 'root', 'root', {
    host: 'localhost',
    dialect: 'mysql'
});

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
let priceData = [];
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
    socket.on('collected', data => {
        console.log('~', data);
        pushData(data.exchangeName, data.quoteName, data.price);
        console.log('~~', priceData);

        socket.broadcast.emit('price', data);
    });

    socket.emit('init_price', priceData);

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
app.use(basicAuth({ name: 'poolin', pass: '' }));
app.use(async (ctx) => {
    if (ctx.request.path == '/api/quote'){
        const quote = await sql.query("SELECT * FROM `quote` where enabled = 1;", {type: 'SELECT'});
        ctx.response.body = quote;
    }else if (ctx.request.path == '/api/minute_history'){
        let exchangeName = ctx.request.query.exchange_name || '';
        let [n0, n1] = ctx.request.query.symbol.split('-') || '';
        let tableName = `single_price_minute_${exchangeName}_${n0}_${n1}`;
        const history = await sql.query("SELECT * FROM "+tableName+" order by minute asc limit 10080;", {type: 'SELECT'});
        ctx.response.body = history;
    }else{
        await ctx.render('new', {cc: JSON.stringify(cc)});
    }
});
server.listen(8084);

//交易对数据
let pushData = function (exchangeName, quoteName, price) {
    let key = `${exchangeName}-${quoteName}`;
    priceData[key] = price;
};


setInterval(() => {
    //每次把内存数据放到db中

}, 6 * 1000);


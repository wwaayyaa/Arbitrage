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

const {Sequelize} = require('sequelize');
const sql = new Sequelize(process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql'
});

//内存的table
let priceData = {};

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
        // console.log('~', data);
        pushData(data.exchangeName, data.quoteName, data.price);
        // console.log('~~', priceData);

        socket.broadcast.emit('price', data);
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
app.use(basicAuth({ name: 'poolin', pass: '' }));
app.use(async (ctx) => {
    if (ctx.request.path == '/api/quote'){
        const quote = await sql.query("SELECT * FROM `quote` where enabled = 1;", {type: 'SELECT'});
        ctx.response.body = quote;
    }else if (ctx.request.path == '/api/minute_history'){
        let exchangeName = ctx.request.query.exchange_name || '';
        let limit = ctx.request.query.limit || 1440;
        let [n0, n1] = ctx.request.query.symbol.split('-') || '';
        let tableName = `single_price_minute_${exchangeName}_${n0}_${n1}`;
        const history = await sql.query(`select * from (SELECT * FROM ${tableName} order by minute desc limit ${limit} ) aa order by minute asc;`, {type: 'SELECT'});
        let now = new dayjs();
        let begin = now.subtract(limit, 'm');
        let data = [];
        while(begin.unix() < now.unix()){
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


// setInterval(() => {
    //每次把内存数据放到db中
    // console.log('pp', priceData);
// }, 1 * 1000);


const koa = require('koa')
const render = require('koa-art-template')
const template = require('art-template')
template.defaults.rules.pop()
// var rule = template.defaults.rules[0];
// rule.test = new RegExp(rule.test.source.replace('<%', '<\\\?').replace('%>', '\\\?>'));

const app = new koa()
const path = require('path');
let cc = require('../ChainConfig');

render(app, {
    root: path.join(__dirname, 'views'),
    extname: '.html',
    debug: process.env.NODE_ENV !== 'production',
});
const server = require('http').createServer(app.callback())
const io = require('socket.io')(server, {path: '/s'})

//监听connect事件
io.on('connection', socket => {
    socket.emit('open');//通知客户端已连接
    console.log('connected');

    socket.on('collected', data => {
        //TODO 缓存？重启后为空
        // console.log(data);
        socket.broadcast.emit('price', data);
    });

    //如果未来关注的数据多了，使用room特性  join/to/leave

    //监听disconnect事件
    socket.on('disconnect', () => {
        console.log('disconnect')
    });
});

app.use(async ctx => {
    // ctx.body = 'Hello World';
    await ctx.render('dashboard', {cc: JSON.stringify(cc)});
});
server.listen(4000);


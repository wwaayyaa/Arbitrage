/*
* 实时数据中心
*   接收collect上报的行情数据
*   对外提供实时数据查询
*   主动发现可套利交易对，并生成db任务。
* */

const io = require('socket.io')(2077);
const dayjs = require('dayjs');
const struct = require('../common/struct');
const cmm = require('../common/common');
(async ()=>{
    await cmm.ding("612342ba40defdd26f3228f35bbd0aeddcf9de619d9d4f9f80c2b47d39e4d0d0", "defi", "defi");
})()
return;

let gBlock = {'height': 0, 'hash': ""};

io.on('connection', socket => {
    console.log('connected');

    socket.on('new_block', async (data) => {
        gBlock.height = data.height;
        gBlock.hash = data.hash;
        socket.broadcase.emit('new_block', gBlock);
    });
    socket.on('get_latest_block', async () => {
        socket.emit('new_block', gBlock);
    });

    socket.on('collected_v3', async (data) => {
        // console.log('~', data, typeof data);
        for (let i = 0; i < data.length; i++) {
            let d = data[i];
            d.__proto__ = struct.SocketCollectedPriceInfo.prototype;
            console.log('~', d, typeof d);
        }
        //TODO
        // pushData(data.protocol, data.exchangeName, data.quoteA, data.quoteB, data.price);
        // console.log('~~', priceData);

        // socket.broadcast.emit('price', data);
        //
        // //监控币安和uni的eth/usdt价格。
        // if (data.quoteName == 'eth/usdt' && (data.exchangeName == 'bian' || data.exchangeName == 'uniswap')) {
        //     let key = `${data.exchangeName}-${data.quoteName}`;
        //     let uniKey = `uniswap-eth/usdt`;
        //     let bianKey = `bian-eth/usdt`;
        //     let uniPrice = priceData[uniKey];
        //     let bianPrice = priceData[bianKey];
        //
        //     if (Math.abs(bianPrice / uniPrice - 1) >= 0.01) {
        //         job = true;
        //     }
        // }
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

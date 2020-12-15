/*
* 实时数据中心
*   接收collect上报的行情数据
*   对外提供实时数据查询
*   主动发现可套利交易对，并生成db任务。
* */

const io = require('socket.io')(2077);
const dayjs = require('dayjs');
const struct = require('../common/struct');

let gBlock = {'height': 0, 'hash': ""};

/* 纯数组，会有性能问题，先暂时不考虑。后期应该引入新的结构（引用，内存数据库）提高查询效率 */
class Prices {
    constructor(prices) {
        this.prices = prices || {};
    }

    getKey(p) {
        return `${p.protocol}/${p.exchange}/${p.quoteA}/${p.quoteB}`;
    };

    add(prices) {
        for (let i = 0; i < prices.length; i++) {
            let p = prices[i];
            let k = this.getKey(prices[i]);
            //引用，不做覆盖
            // this.prices[this.getKey(prices[i])] = prices[i];
            if (!this.prices.hasOwnProperty(k)) {
                this.prices[k] = {};
            }
            this.prices[k].protocol = p.protocol;
            this.prices[k].exchange = p.exchange;
            this.prices[k].quoteA = p.quoteA;
            this.prices[k].quoteB = p.quoteB;
            this.prices[k].price = p.price;
            this.prices[k].height = p.height;
            this.prices[k].timestamp = p.timestamp;
        }
    };

    findByQuoteAB(quoteA, quoteB) {
        let ret = [];
        for (let key in this.prices) {
            if (this.prices[key].quoteA == quoteA && this.prices[key].quoteB == quoteB) {
                ret.push(this.prices[key]);
            }
        }
        return ret;
    };

    prices() {
        return this.prices;
    }
}

let gPrices = new Prices();

io.on('connection', socket => {
    console.log('connected');

    /* Block Height & Hash*/
    socket.on('new_block', async (data) => {
        gBlock.height = data.height;
        gBlock.hash = data.hash;
        socket.broadcase.emit('new_block', gBlock);
    });
    socket.on('get_latest_block', async () => {
        socket.emit('new_block', gBlock);
    });

    /* 获取上报的 */
    socket.on('collected_v3', async (data) => {
        console.log('~', data, typeof data);
        let timestamp = new dayjs().unix();
        for (let i = 0; i < data.length; i++) {
            let d = data[i];
            // d.__proto__ = struct.SocketCollectedPriceInfo.prototype;
            // console.log('~', d, typeof d);

            //额外
            // if (d.protocol == 'cefi') {
            d.timestamp = timestamp;
            // }
            // d.nowHeight = gBlock.height;
            // d.expired = false;
        }
        gPrices.add(data);

        socket.broadcast.emit('new_prices', data);

        //根据变动的数据，和已更新的数据做对比。避免全量筛选，减少循环次数。
        for (let i = 0; i < data.length; i++) {
            let p = data[i];
            let pairs = gPrices.findByQuoteAB(p.quoteA, p.quoteB);
            for (let j = 0; j < pairs.length; j++) {
                let pair = pairs[j];
                if (p.protocol == pair.protocol && p.exchange == pair.exchange) {
                    continue;
                }
                //对比差价
                let n = 0.01;
                if (Math.abs(p.price / pair.price - 1) < n) {
                    continue;
                }
                //大于套利阈值
                console.log(`出现机会: `, p, pair);
                //TODO
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

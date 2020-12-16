/*
* 实时数据中心
*   接收collect上报的行情数据
*   对外提供实时数据查询
*   主动发现可套利交易对，并生成db任务。
* */
require('dotenv').config();

const io = require('socket.io')(2077);
const dayjs = require('dayjs');
const struct = require('../common/struct');
const common = require('../common/common');
const {v4: uuidv4} = require('uuid');
const {Sequelize} = require('sequelize');
const sql = new Sequelize(process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql'
});

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
let gJobs = [];

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
        // console.log('~', data, typeof data);
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

        /* 此处是各种套利模型判断价格是否达到触发值的地方，未来可能要剥离 */
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
                // console.log(`出现机会: `, p, pair);
                //TODO 生成uuidV4 记录到数据库、发送全局通知、生成任务（避免同币种任务生成）

                /*
                    step 生成分三种情况。
                    eth在前
                    eth在后
                    无eth    我们需要知道这种的数量和价差比例，但是先不做，因为套利链条太长了，手续费太高。
                 */
                let step = [];
                let status = 0;
                let jobType = 'move_bricks';
                if (p.quoteA == 'weth') {
                    let s1, s2;
                    if (p.price > pair.price) {
                        s1 = p;
                        s2 = pair;
                    } else {
                        s1 = pair;
                        s2 = p;
                    }
                    s1.type = 'sell';
                    s2.type = 'buy';
                    step.push(s1, s2);
                } else if (p.quoteB == 'weth') {
                    let s1, s2;
                    if (p.price > pair.price) {
                        s1 = pair;
                        s2 = p;
                    } else {
                        s1 = p;
                        s2 = pair;
                    }
                    s1.type = 'buy';
                    s2.type = 'sell';
                    step.push(s1, s2);
                } else {
                    jobType = 'triple_move_bricks';
                    //TODO 暂时忽略 三方搬砖套利
                }

                let job = {
                    uuid: uuidv4(),
                    type: jobType,
                    step: step,
                    quote: `${p.quoteA}/${p.quoteB}`,
                    status: status,
                    principal: 1,
                    txFee: 0,
                    profit: 0,
                    txHash: "",
                };

                //push & save & execute
                socket.broadcast.emit('new_arbitrage', job);
                let [err, ok] = await newArbitrageJob(job.uuid, job.type, JSON.stringify(job.step), job.quote, job.status, job.principal, job.txFee)
                if (err) {
                    console.error(`newArbitrageJob error: `, err);
                }

                gJobs.push(job);
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

async function newArbitrageJob(uuid, type, step, quote, status, principal, txFee) {
    let now = new dayjs();
    try {
        await sql.query("insert into arbitrage_job (uuid, type, step, quote, status, principal, tx_fee, created_at, updated_at) " +
            "values (?, ?, ?, ?, ?, ?, ?, ?, ?) ",
            {
                replacements: [uuid, type, step, quote, status, principal, txFee, now.format("YYYY-MM-DD HH:mm:ss"), now.format("YYYY-MM-DD HH:mm:ss")],
                type: 'INSERT'
            })
    } catch (e) {
        return [e, false];
    }
    return [null, true];
}

async function updateArbitrageJob(uuid, status, txFee, profit, txHash) {
    let now = new dayjs();
    try {
        await sql.query("update arbitrage_job set status = ?, tx_fee = ?, profit = ?, tx_hash = ?, updated_at = ?" +
            " where uuid = ?",
            {
                replacements: [status, txFee, profit, txHash, now.format("YYYY-MM-DD HH:mm:ss"), uuid],
                type: 'UPDATE'
            })
    } catch (e) {
        return [e, false];
    }
    return [null, true];
}

async function main() {
    jobConsumer();
}

async function jobConsumer() {
    while (true) {
        let job = gJobs.shift();
        if (typeof job == "undefined") {
            await common.sleep(10);
            continue;
        }

        //TODO 当前仅支持 move_bricks
        if (job.type == "move_bricks") {
            //trigger arbitrage
            await updateArbitrageJob(job.uuid, 1, 0, 0, "");
            //TODO 生成交易计算是手续费

            //TODO 成功之后回写利润和状态
            await updateArbitrageJob(job.uuid, 2, 123321, 666, "xxxx");
            console.log(`consumer move_bricks`);
        } else if (job.type == 'triple_move_bricks') {
            console.log(`consumer triple_move_bricks`);
            await updateArbitrageJob(job.uuid, 3, 0, 0, "");
        } else if (job.type == 'triangular_arbitrage') {
            console.log(`consumer triangular_arbitrage`);
        } else {
            console.warn(`unknown job ${job.uuid} ${job.type}`);
        }

        await common.sleep(10);
    }
}

main();

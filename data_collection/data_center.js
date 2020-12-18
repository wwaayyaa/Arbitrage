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
/* 这个库和合约不同，使用币的个数计算，例如 3eth,10btc,0.003fee 这种 */
const calcHelper = require('./calc_comparisons.js');

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
            this.prices[this.getKey(prices[i])] = prices[i];
            // if (!this.prices.hasOwnProperty(k)) {
            //     this.prices[k] = {};
            // }
            // this.prices[k].protocol = p.protocol;
            // this.prices[k].exchange = p.exchange;
            // this.prices[k].quoteA = p.quoteA;
            // this.prices[k].quoteB = p.quoteB;
            // this.prices[k].price = p.price;
            // this.prices[k].height = p.height;
            // this.prices[k].timestamp = p.timestamp;
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

let gBlock = {'height': 0, 'hash': ""};
let gPrices = new Prices();
let gJobs = [];
let gGasPrice = 0;
let gTokens = [];
let gQuotes = [];


io.on('connection', socket => {
    console.log('connected');

    /* Block Height & Hash*/
    socket.on('new_block', async (data) => {
        gBlock.height = data.height;
        gBlock.hash = data.hash;
        socket.broadcast.emit('new_block', gBlock);
    });
    socket.on('get_latest_block', async () => {
        socket.emit('new_block', gBlock);
    });
    socket.on('gasPrice', async (gasPrice) => {
        gGasPrice = gasPrice;
    });

    /* 获取上报的价格数据 */
    socket.on('collected_v3', async (
        /* [{protocol, exchange, quoteA, quoteB, price, height,
         master, balanceA, balanceB, weightA, weightB}] */data
    ) => {
        // console.log('~', data, typeof data);
        let timestamp = new dayjs().unix();
        for (let i = 0; i < data.length; i++) {
            let d = data[i];
            // console.log('~', d);
            d.timestamp = timestamp;
        }
        gPrices.add(data);

        socket.broadcast.emit('new_prices', data);

        /* 此处是各种套利模型判断价格是否达到触发值的地方，未来可能要剥离 */
        //根据变动的数据，和已更新的数据做对比。避免全量筛选，减少循环次数。
        for (let i = 0; i < data.length; i++) {
            let p = data[i];
            if (!p.master) { //反向交易对不参与计算
                continue;
            }
            let pairs = gPrices.findByQuoteAB(p.quoteA, p.quoteB);
            for (let j = 0; j < pairs.length; j++) {
                let pair = pairs[j];
                if ((p.protocol == pair.protocol && p.exchange == pair.exchange) || p.height != pair.height) {
                    continue;
                }
                //对比差价
                let rate = 0.015;
                if (Math.abs(p.price / pair.price - 1) < rate) {
                    continue;
                }
                //大于套利阈值
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

                //TODO step的解析，考虑滑点，计算最终产出 A。 计算交易手续费B = gas * gasPrice。要求A > B
                let principals = [1, 2, 3, 5, 8, 10];
                let principal = 0;
                let isErr = false;
                let back = 0;
                for (let _i = 0; _i < principals.length; i++) {
                    [err, back] = calcProfit(principals[_i], step);
                    if (err) {
                        console.error(`calcProfit error: `, err);
                        isErr = true;
                        break;
                    }
                    if (back > principals[_i]) {
                        principal = principals[_i];
                    } else {
                        break;
                    }
                }
                if (isErr) {
                    continue;
                }

                //TODO 如果有principal，那么再通过gasPrice计算一下手续费，就能初步估计成本了。
                // if(principal > 0){
                //     let fee = new BN(gGasPrice).times(223266).div(new BN(10).pow(18));
                // }

                let job = {
                    uuid: uuidv4(),
                    type: jobType,
                    height: p.height,
                    step: step,
                    quote: `${p.quoteA}/${p.quoteB}`,
                    status: status,
                    principal: principal,
                    txFee: 0,
                    profit: back - principal,
                    txHash: "",
                    // timestamp: p.timestamp > pair.timestamp ? p.timestamp : pair.timestamp
                };

                //push & save & execute
                socket.broadcast.emit('new_arbitrage', job);
                let [err, ok] = await newArbitrageJob(job.uuid, job.type, job.height, JSON.stringify(job.step), job.quote, job.status, job.principal, job.txFee)
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

    //如果未来关注的数据多了，使用room特性  join/to/leave

    //监听disconnect事件
    socket.on('disconnect', () => {
        // console.log('disconnect')
    });
});

function calcProfit(/* int 本金 */principal, /*[]*/steps) {
    let amountOut = 0;
    let amountIn = principal;
    for (let i = 0; i < steps.length; i++) {
        amountIn = i == 0 ? principal : amountOut;
        let step = steps[i];

        let tokenIn = step.quoteA;
        let balanceIn = step.balanceA;
        let tokenOut = step.quoteB;
        let balanceOut = step.balanceB;
        if (step.type == 'buy') {
            tokenIn = step.quoteB;
            balanceIn = step.balanceB;
            tokenOut = step.quoteA;
            balanceOut = step.balanceA;
        }
        if (step.protocol == 'uniswap') {
            // let amountIn = new BN(principal).times(new BN(10).pow(gTokens[tokenIn].decimal));
            // balanceIn = new BN(balanceIn).times(new BN(10).pow(gTokens[tokenIn].decimal));
            // balanceOut = new BN(balanceOut).times(new BN(10).pow(gTokens[tokenOut].decimal));
            amountOut = new calcHelper.UniswapHelper().getAmountOutDecimal(amountIn, balanceIn, balanceOut);
        } else if (step.protocol == 'balancer') {
            let weightIn = step.weightA;
            let weightOut = step.weightB;
            if (step.type == 'buy') {
                weightIn = step.weightB;
                weightOut = step.weightA;
            }
            amountOut = new calcHelper.BalancerUtils().calcOutGivenIn(balanceIn, weightIn, balanceOut, weightOut, amountIn, step.fee);
        } else {
            return [new Error("calcProfit unknown protocol: " + step.protocol)];
        }
    }
    return [null, amountOut];
}

async function newArbitrageJob(uuid, type, height, step, quote, status, principal, txFee) {
    let now = new dayjs();
    try {
        await sql.query("insert into arbitrage_job (uuid, type, height, step, quote, status, principal, tx_fee, created_at, updated_at) " +
            "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ",
            {
                replacements: [uuid, type, height, step, quote, status, principal, txFee, now.format("YYYY-MM-DD HH:mm:ss"), now.format("YYYY-MM-DD HH:mm:ss")],
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
    let historyJob = function () {
        this.jobs = [];
    };
    historyJob.prototype.add = function (job) {
        if (this.jobs.length == 10) {
            this.jobs.shift()
        }
        this.jobs.push(job);
    };
    historyJob.prototype.values = function () {
        return this.jobs;
    };
    let hj = new historyJob;

    while (true) {
        let job = gJobs.shift();
        if (typeof job == "undefined") {
            await common.sleep(10);
            continue;
        }
        if (job.height != gBlock.height) {
            console.log(`${job.height} ${gBlock.height}`);
            await updateArbitrageJob(job.uuid, 31, 0, 0, "");
            continue;
        }
        let found = hj.values().find(j => {
            if (j.height < job.height) {
                //过期的，无视
                return false;
            }
            // 方案1 过滤相反的quote
            if (job.step[0].protocol == j.step[0].protocol
                && job.step[0].exchange == j.step[0].exchange
                && job.step[0].quoteA == j.step[0].quoteB
                && job.step[0].quoteB == j.step[0].quoteA) {
                return true;
            }
            //方案2
            // let nowTokens = job.quote.split('/');
            // let hisTokens = j.quote.split('/');
            // console.log(`nowTokens,hisTokens`, nowTokens, hisTokens);
            // for (let i = 0; i < nowTokens.length; i++) {
            //     //这种方法太粗暴，weth只会执行一次，会过滤太多机会
            //     let found_ = hisTokens.find(hisToken => hisToken == nowTokens[i])
            //     if (found_) {
            //         console.log(`found_`);
            //         return true;
            //     }
            // }

            //方案3 todo 每次执行一个记录一个执行中的token（非eth），通过对比历史token，如果有则逃过。
            return false;
        });
        if (found) {
            //短期执行过
            await updateArbitrageJob(job.uuid, 32, 0, 0, "");
            continue;
        }
        hj.add(job);
        if (job.principal == 0) {
            //没有执行价值
            await updateArbitrageJob(job.uuid, 33, 0, 0, "");
            continue;
        }

        if (job.type == "move_bricks") {
            //trigger arbitrage
            // await updateArbitrageJob(job.uuid, 1, 0, job.profit, "");
            //TODO 生成交易计算手续费

            //TODO 成功之后回写利润和状态
            await updateArbitrageJob(job.uuid, 2, 0, job.profit, "xxxx");
            console.log(`consumer move_bricks`);
        } else if (job.type == 'triple_move_bricks') {
            console.log(`consumer triple_move_bricks`);
            await updateArbitrageJob(job.uuid, 35, 0, 0, "");
        } else if (job.type == 'triangular_arbitrage') {
            console.log(`consumer triangular_arbitrage`);
        } else {
            console.warn(`unknown job ${job.uuid} ${job.type}`);
        }

        await common.sleep(10);
    }
}

main();

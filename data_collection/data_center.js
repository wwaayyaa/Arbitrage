/*
* 实时数据中心
*   接收collect上报的行情数据
*   对外提供实时数据查询
*   主动发现可套利交易对，并生成db任务。
* */
const init = require('../common/init').init();
const db = init.initDB();
const {web3, acc, Web3} = init.initWeb3AndAccount();
const web3Local = init.initLocalWeb3()
const arbitrageInfo = init.getArbitrage();

const c = console.log;
const _ = require('lodash');
const cc = require('../ChainConfig');
// const ca = require("../ContractAddresses");
const io = require('socket.io')(2077);
const dayjs = require('dayjs');
let BN = require('bignumber.js');
const common = require('../common/common');
const ding = new common.Ding(process.env.DING_KEY);
const {v4: uuidv4} = require('uuid');
/* 这个库和合约不同，使用币的个数计算，例如 3eth,10btc,0.003fee 这种 */
const calcHelper = require('./calc_comparisons.js');

const JOB_STATUS_DOING = 1;
const JOB_STATUS_DONE = 2;
const JOB_STATUS_HEIGHT_FALL_BEHIND = 31;
const JOB_STATUS_UNWORTHY = 32;
const JOB_STATUS_REPEATED = 33;
const JOB_STATUS_FAILED = -1;
const JOB_STATUS_FAILED_NO_EVENTS = -2;

/*优化后的合约更便宜*/
// const GAS = 180000;
const GAS = 150000;

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
            //引用
            this.prices[this.getKey(prices[i])] = prices[i];
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

    getMaster() {
        let ret = [];
        for (let key in this.prices) {
            if (this.prices[key].master) {
                ret.push(this.prices[key]);
            }
        }
        return ret;
    }

    prices() {
        return this.prices;
    }
}

let gPrices = new Prices();

let gBlock = {'height': 0, 'hash': ""};
let gJobs = [];
let gGasPrice = 0;
let gTokens = [];
let gQuotes = [];
let gUnderwayTokens = {};

io.on('connection', socket => {
    console.log('connected');

    /* Block Height & Hash*/
    socket.on('new_block', async (data) => {
        gBlock.height = data.height;
        gBlock.hash = data.hash;
        gBlock.timestamp = data.timestamp;
        socket.broadcast.emit('new_block', gBlock);
    });
    socket.on('get_latest_block', async () => {
        socket.emit('new_block', gBlock);
    });
    socket.on('gasPrice', async (gasPrice) => {
        //20000000000 -> 20GWei
        gGasPrice = gasPrice;
    });

    /* 获取上报的价格数据 */
    socket.on('collected_v3', async (
        /* [{protocol, exchange, quoteA, quoteB, price, height,
         master, balanceA, balanceB, weightA, weightB}] */
        data
    ) => {
        gPrices.add(data);
        // socket.broadcast.emit('new_prices', data);

        /* 此处是各种套利模型判断价格是否达到触发值的地方，未来可能要剥离 */
        lookupMoveBricks(socket, data);
        lookupTriangular(socket, data);
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

/*通过价格发现套利机会*/
async function lookupMoveBricks(
    socket,
    /* [{protocol, exchange, quoteA, quoteB, price, height,
         master, balanceA, balanceB, weightA, weightB}] */
    data) {
    //根据变动的数据，和已更新的数据做对比。避免全量筛选，减少循环次数。
    for (let i = 0; i < data.length; i++) {
        let p = data[i];
        if (!p.master || p.height != gBlock.height) { //反向交易对不参与计算
            continue;
        }
        let pairs = gPrices.findByQuoteAB(p.quoteA, p.quoteB);
        for (let j = 0; j < pairs.length; j++) {
            let pair = pairs[j];
            if ((p.protocol == pair.protocol && p.exchange == pair.exchange) || p.height != pair.height) {
                continue;
            }
            //对比差价
            let rateT = 0.01;
            let rate = Math.abs(p.price / pair.price - 1);
            if (rate < rateT) {
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
            let jobType = 'move_bricks';
            if (p.quoteA == 'weth') {
                let s1, s2;
                if (p.price > pair.price) {
                    s1 = _.cloneDeep(p);
                    s2 = _.cloneDeep(pair);
                } else {
                    s1 = _.cloneDeep(pair);
                    s2 = _.cloneDeep(p);
                }
                s1.type = 'sell';
                s2.type = 'buy';
                step.push(s1, s2);
            } else if (p.quoteB == 'weth') {
                let s1, s2;
                if (p.price > pair.price) {
                    s1 = _.cloneDeep(pair);
                    s2 = _.cloneDeep(p);
                } else {
                    s1 = _.cloneDeep(p);
                    s2 = _.cloneDeep(pair);
                }
                s1.type = 'buy';
                s2.type = 'sell';
                step.push(s1, s2);
            } else {
                jobType = 'triple_move_bricks';
                //TODO 暂时忽略 三方搬砖套利
                continue;
            }

            //step的解析，考虑滑点，计算最终产出 A。 计算交易手续费B = gas * gasPrice。要求A > B
            let [calcMaxErr, maxPrincipal, maxProfit] = calcMaxProfit(step);
            if (calcMaxErr || maxPrincipal <= 1) {
                continue;
            }
            let principal = maxPrincipal / 2;
            let [calcErr, profit] = calcProfit(principal, step);
            profit = profit - principal;
            if (calcErr) {
                continue;
            }

            //如果有principal，那么再通过gasPrice计算一下手续费，就能初步估计成本了。
            let fee = 0;
            if (principal > 0) {
                fee = new BN(gGasPrice).times("1.2").times(GAS).times(2).div(new BN(10).pow(18)).toFixed(18);
                profit = profit - fee;
            } else {
                //不保存完全无法盈利的数据
                continue;
            }


            let job = {
                uuid: uuidv4(),
                type: jobType,
                height: p.height,
                step: step,
                quote: `${p.quoteA}/${p.quoteB}`,
                status: 0,
                principal: principal,
                txFee: fee,
                profit: principal > 0 ? profit : failProfit,
                txHash: "",
            };

            //push & save & execute
            socket.broadcast.emit('new_arbitrage', job);
            let [err, ok] = await db.newArbitrageJob(job.uuid, job.type, job.height, JSON.stringify(job.step), job.quote, rate, job.status, job.principal, job.txFee, job.profit);
            if (err) {
                console.error(`newArbitrageJob error: `, err);
            }

            gJobs.push(job);
        }
    }
}

/**
 * 三角套利
 * 只能在master之间寻找（不然就可能存在AB（master），BC（slave），AC（master）｜AB（master），CB（master），AC（master）的情况，很不好判断。
 *   如果p 不含weth，则去找匹配的eth交易对，如 yfi/dai，去找weth/dai + weth/yfi
 *   如果p 含有weth，则匹配任意token（这个匹配量很大，不做开发。被动的通过上面的交易对发现套利）
 * */
async function lookupTriangular(
    socket,
    /* [{protocol, exchange, quoteA, quoteB, price, height,
         master, balanceA, balanceB, weightA, weightB}] */
    data) {
    //根据变动的数据，和已更新的数据做对比。避免全量筛选，减少循环次数。
    for (let i = 0; i < data.length; i++) {
        let p = data[i];
        if (!p.master || p.height != gBlock.height || common.hasToken('weth', [p.quoteA, p.quoteB])) {
            continue;
        }
        //确保master
        let pair1 = common.sortTokensAsc(['weth', p.quoteA]);
        let pair3 = common.sortTokensAsc(['weth', p.quoteB]);
        let prices1 = gPrices.findByQuoteAB(...pair1).filter(n => n.height == gBlock.height);
        let prices3 = gPrices.findByQuoteAB(...pair3).filter(n => n.height == gBlock.height);
        if (prices1.length == 0 || prices3.length == 0) {
            continue;
        }

        let rateT = 0.01;
        for (let price1 of prices1) {
            for (let price3 of prices3) {
                let rate;
                if (price1.quoteA == 'weth') {
                    rate = new BN("1").times(new BN(price1.price));
                } else {
                    rate = new BN("1").div(new BN(price1.price));
                }

                rate = rate.times(new BN(p.price));

                if (price3.quoteA == 'weth') {
                    rate = rate.div(new BN(price3.price));
                } else {
                    rate = rate.times(new BN(price3.price));
                }
                rate = rate.minus("1").abs().toFixed(8);
                // c(`triangular rate: ${rate}`);
                if (rate < rateT) {
                    continue;
                }
                // c(price1, p, price3);

                let step = [];
                let jobType = 'triangular_arbitrage';
                let s1, s2, s3;
                s1 = _.cloneDeep(price1);
                s2 = _.cloneDeep(p);
                s3 = _.cloneDeep(price3);

                if (price1.quoteA == 'weth') {
                    s1.type = 'sell';
                } else {
                    s1.type = 'buy';
                }
                step.push(s1);
                s2.type = 'sell';
                step.push(s2);
                if (price3.quoteA == 'weth') {
                    s3.type = 'buy';
                } else {
                    s3.type = 'sell';
                }
                step.push(s3);

                //step的解析，考虑滑点，计算最终产出 A。 计算交易手续费B = gas * gasPrice。要求A > B
                let [calcMaxErr, maxPrincipal, maxProfit] = calcMaxProfit(step);
                if (calcMaxErr || maxPrincipal <= 1) {
                    continue;
                }
                let principal = maxPrincipal / 2;
                let [calcErr, profit] = calcProfit(principal, step);
                profit = profit - principal;
                if (calcErr) {
                    continue;
                }

                //如果有principal，那么再通过gasPrice计算一下手续费，就能初步估计成本了。
                let fee = 0;
                if (principal > 0) {
                    fee = new BN(gGasPrice).times("1.2").times(GAS).times(3).div(new BN(10).pow(18)).toFixed(18);
                    profit = profit - fee;
                } else {
                    //不保存完全无法盈利的数据
                    continue;
                }

                let job = {
                    uuid: uuidv4(),
                    type: jobType,
                    height: p.height,
                    step: step,
                    quote: `weth/${p.quoteA}/${p.quoteB}`,
                    status: 0,
                    principal: principal,
                    txFee: fee,
                    profit: profit,
                    txHash: "",
                };

                //push & save & execute
                // socket.broadcast.emit('new_arbitrage', job);
                let [err, ok] = await db.newArbitrageJob(job.uuid, job.type, job.height, JSON.stringify(job.step), job.quote, rate, job.status, job.principal, job.txFee, job.profit);
                if (err) {
                    console.error(`newArbitrageJob error: `, err);
                }

                gJobs.push(job);
            }
        }

    }
}

/**
 *
 * @param principal
 * @param steps
 * @returns {Error[]|number[本金+利润]}
 */
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

function calcMaxProfit(/* [] */steps) {
    let principal = 0, lastProfit = 0;
    for (let _p of [1, 2, 4, 6, 8, 10, 12, 15, 20]) {
        let [err, _back] = calcProfit(_p, steps);
        if (err) {
            console.error(`calcMaxProfit error: `, err);
            return [err];
        }
        if (_back <= _p) {
            break;
        }
        principal = _p;
        lastProfit = _back - _p;
    }
    return [null, principal, lastProfit];
}


async function main() {
    gTokens = await db.getTokensKeyByToken();
    common.memoryInfoForever(60000);
    jobConsumer();
}

async function jobConsumer() {
    const sleepMs = 500;
    while (true) {
        // let job = gJobs.shift();
        let jobs = gJobs.splice(0, 100);
        let job = jobs.reduce((max, p) => (p.height > max.height || (p.height == max.height && p.profit > max.profit)) ? p : max, jobs[0]);
        if (!job) {
            await common.sleep(sleepMs);
            continue;
        }
        if (job.height != gBlock.height) {
            // console.log(`job height:${job.height} != now height: ${gBlock.height}`);
            db.updateArbitrageJob(job.uuid, JOB_STATUS_HEIGHT_FALL_BEHIND, job.txFee, job.profit, "");
            continue;
        }

        if (job.principal == 0
            || (job.type == 'move_bricks' && job.profit < 0.005)
            || (job.type == 'triangular_arbitrage' && job.profit < 0.005)) {
            //没有执行价值
            db.updateArbitrageJob(job.uuid, JOB_STATUS_UNWORTHY, job.txFee, job.profit, "");
            continue;
        }
        let quotes = job.quote.split('/');
        for (const quote of quotes) {
            if (quote == 'eth' || quote == 'weth') {
                continue;
            }
            if (gUnderwayTokens.hasOwnProperty(quote)) {
                //TODO 这种情况（并发）本身还要考虑余额和nonce的问题
                db.updateArbitrageJob(job.uuid, JOB_STATUS_REPEATED, job.txFee, job.profit, "");
                continue;
            }
        }

        await db.updateArbitrageJob(job.uuid, JOB_STATUS_DOING, job.txFee, job.profit, "");
        //trigger arbitrage
        //解析step，调用web3，回调结果
        await callArbitrageByJob(job, async function (err, tx) {
            for (const q of job.quote.split('/')) {
                delete gUnderwayTokens[q];
            }
            if (err) {
                console.error("callArbitrageByJob error", err);
                await db.updateArbitrageJob(job.uuid, JOB_STATUS_FAILED, job.txFee, job.profit, "");
                await ding.ding('defi-arbitrage', `callArbitrageByJob error`);
                process.exit(1);
                return;
            }
            let hash = tx.transactionHash || "unknown";
            let gasUsed = tx.gasUsed;
            let fee = tx.hash || 0; //TODO
            if (Object.keys(tx.events).length == 0) {
                console.error("callArbitrageByJob error , no events : ", err);
                await db.updateArbitrageJob(job.uuid, JOB_STATUS_FAILED_NO_EVENTS, job.txFee, job.profit, hash);
                await ding.ding('defi-arbitrage', `callArbitrageByJob error , no events: ${hash}`);
                process.exit(1);
                return;
            }
            ding.ding('defi-arbitrage', `
**type:** ${job.type}

**uuid:** ${job.uuid}

**tokens:** ${job.quote}
 
**hash:** ${hash}

**profit:** ${job.profit}

[前去围观](https://etherscan.io/tx/${hash})`);
            await db.updateArbitrageJob(job.uuid, JOB_STATUS_DONE, job.txFee, job.profit, hash);
        });


        await common.sleep(sleepMs);
    }
}

async function callArbitrageByJob(job, callback) {
    let args = [job.height + 1, gBlock.timestamp + 300, []];
    // let args = [job.height + 10, 3333333333, []];
    for (let i = 0; i < job.step.length; i++) {
        let step = job.step[i];
        let exchangeAddress, fromToken, toToken;

        if (step.protocol == 'uniswap') {
            if (step.exchange == 'uniswapv2') {
                exchangeAddress = cc.exchange.uniswap.router02.address;
            } else if (step.exchange == 'sushiswap') {
                exchangeAddress = cc.exchange.sushiswap.router02.address;
            }
        } else if (step.protocol == 'balancer') {
            exchangeAddress = step.exchange;
        }
        fromToken = step.type == 'buy' ? step.quoteB : step.quoteA;
        toToken = step.type == 'buy' ? step.quoteA : step.quoteB;

        args[2].push([
            step.protocol == 'uniswap' ? '1' : '2', //TODO
            exchangeAddress,
            gTokens[fromToken].address,
            gTokens[toToken].address,
            i == 0 ? new BN(job.principal).times(new BN(10).pow(gTokens[fromToken].decimal)).toFixed(0) : '0',
            '0' //TODO 预估收益需要增加上
        ]);
    }

    // if (job.type == 'move_bricks' && (args[2] != '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    //     || args[8] != '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    //     || args[9] != '0')) {
    //     console.warn(`warn 顺序问题: ${job}, ${args}, ${gTokens}`);
    //     await callback(new Error('args 顺序问题'));
    //     return;
    // }

    let arbitrage = new web3.eth.Contract(arbitrageInfo.abi, arbitrageInfo.address);
    let tx = null;
    try {
        let executeGasPrice = Web3.utils.toWei(new BN(gGasPrice).times("1.2").div(Web3.utils.toWei('1', 'gwei')).toFixed(0), 'gwei');
        c(`now gasPrice: ${gGasPrice}, executeGasPrice: ${executeGasPrice}`);

        // let arbitrageLocal = new web3Local.eth.Contract(arbitrageInfo.abi, arbitrageInfo.address);
        // let estimateGas = await arbitrageLocal.methods
        //     .a2(...args)
        //     .estimateGas({gas: GAS});
        // c(`estimateGas : ${estimateGas}`);
        // if (estimateGas == GAS) {
        //     throw new Error(`gas exceed ${GAS}`);
        // }

        c(`[aN] type: ${job.type}, args:`, args);
        tx = await arbitrage.methods
            .aN(...args)
            .send({from: acc.address, gas: GAS * args[2].length, gasPrice: executeGasPrice});

        console.log(`txinfo`, tx);
    } catch (e) {
        console.log(`type: ${job.type}, send a2:`, args);
        e.message = `send to a2 error: ` + (e.reason || "");
        if (callback) {
            await callback(e);
        }
        return;
    }
    if (callback) {
        await callback(null, tx);
    }
}

main();

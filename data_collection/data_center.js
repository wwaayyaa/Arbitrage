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

const GAS = 400000;

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
        await lookupMoveBricks(data);

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
            let isErr = false;
            let principal = 0, profit = 0, failProfit = 0;
            for (let _p of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
                let [err, _back] = calcProfit(_p, step);
                if (err) {
                    console.error(`calcProfit error: `, err);
                    isErr = true;
                    break;
                }
                let _profit = _back - _p;
                if (_profit > profit) {
                    //如果有利润
                    principal = _p;
                    profit = _profit;
                } else {
                    failProfit = _profit;
                    break;
                }
            }
            if (isErr) {
                continue;
            }

            //如果有principal，那么再通过gasPrice计算一下手续费，就能初步估计成本了。
            let fee = 0;
            if (principal > 0) {
                fee = new BN(gGasPrice).times("1.2").times(300000).div(new BN(10).pow(18)).toFixed(18);
                profit = profit - fee;
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


async function main() {
    gTokens = await db.getTokensKeyByToken();
    common.memoryInfoForever(60000);
    jobConsumer();
}

async function jobConsumer() {
    while (true) {
        let job = gJobs.shift();
        if (typeof job == "undefined") {
            await common.sleep(10);
            continue;
        }
        if (job.height != gBlock.height) {
            console.log(`${job.height} ${gBlock.height}`);
            await db.updateArbitrageJob(job.uuid, JOB_STATUS_HEIGHT_FALL_BEHIND, job.txFee, job.profit, "");
            continue;
        }

        if (job.principal == 0 || job.profit <= 0.005) {
            //没有执行价值
            await db.updateArbitrageJob(job.uuid, JOB_STATUS_UNWORTHY, job.txFee, job.profit, "");
            continue;
        }
        let quotes = job.quote.split('/');
        for (const quote of quotes) {
            if (quote == 'eth' || quote == 'weth') {
                continue;
            }
            if (gUnderwayTokens.hasOwnProperty(quote)) {
                await db.updateArbitrageJob(job.uuid, JOB_STATUS_REPEATED, job.txFee, job.profit, "");
                continue;
            }
        }

        if (job.type == "move_bricks") {
            //trigger arbitrage
            await db.updateArbitrageJob(job.uuid, JOB_STATUS_DOING, job.txFee, job.profit, "");
            //TODO 解析step，调用web3，回调结果
            await stepExecutor(job, async function (err, tx) {
                for (const q of job.quote.split('/')) {
                    delete gUnderwayTokens[q];
                }
                if (err) {
                    console.error("stepExecutor error", err);
                    await db.updateArbitrageJob(job.uuid, JOB_STATUS_FAILED, job.txFee, job.profit, "");
                    await ding.ding('defi-arbitrage', `stepExecutor error`);
                    process.exit(1);
                    return;
                }
                let hash = tx.transactionHash || "unknown";
                let gasUsed = tx.gasUsed;
                let fee = tx.hash || 0; //TODO
                if (Object.keys(tx.events).length == 0) {
                    console.error("stepExecutor error , no events : ", err);
                    await db.updateArbitrageJob(job.uuid, JOB_STATUS_FAILED_NO_EVENTS, job.txFee, job.profit, hash);
                    await ding.ding('defi-arbitrage', `stepExecutor error , no events: ${hash}`);
                    process.exit(1);
                    return;
                }
                ding.ding('defi-arbitrage',
                    `
**uuid:** ${job.uuid}
 
**hash:** ${hash}

**profit:** ${job.profit}

[前去围观](https://etherscan.io/tx/${hash})
                    `);
                await db.updateArbitrageJob(job.uuid, JOB_STATUS_DONE, job.txFee, job.profit, hash);
            });

        } else if (job.type == 'triple_move_bricks') {
            console.log(`consumer triple_move_bricks`);
            await db.updateArbitrageJob(job.uuid, 35, 0, 0, "");
        } else if (job.type == 'triangular_arbitrage') {
            console.log(`consumer triangular_arbitrage`);
        } else {
            console.warn(`unknown job ${job.uuid} ${job.type}`);
        }

        await common.sleep(10);
    }
}

async function stepExecutor(job, callback) {
    let args = [];
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

        args.push(step.protocol, exchangeAddress, gTokens[fromToken].address, gTokens[toToken].address, i == 0 ? new BN(job.principal).times(new BN(10).pow(gTokens[fromToken].decimal)).toFixed(0) : '0');
    }
    if (args[2] != '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
        || args[8] != '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
        || args[9] != '0') {
        console.warn(`warn 顺序问题: ${job}, ${args}, ${gTokens}`);
        await callback(new Error('args 顺序问题'));
        return;
    }

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

        tx = await arbitrage.methods
            .a2(...args)
            .send({from: acc.address, gas: GAS, gasPrice: executeGasPrice});
        console.log(`txinfo`, tx);
    } catch (e) {
        console.log(`send a2:`, args);
        e.message = `send to a2 error: ` + (e.message || "");
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

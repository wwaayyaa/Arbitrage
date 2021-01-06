/**
 * 该脚本通过 ws+http 监控内存池
 * 1. 通过 ws:pendingTransactions 接收新的交易
 * 2. 通过 ws:logs 能获得出块高度和入块的交易
 * 3. 通过 web3.eth.getBlock('pending', true) 获取即将入块的交易信息（含有交易的to、data） // 实测下来，发现这个里面含有的transactions非常不准
 * 4. 通过 web3.eth.getTransaction('xx') 获取每个交易的信息
 *
 *
 * 2020-12-30
 * 准备先监控weth兑某些token的
 */
const init = require('../common/init').init();
const db = init.initDB();
const {web3, acc} = init.initWeb3AndAccount();
const web3WS = init.initWSWeb3();
const arbitrageInfo = init.getArbitrage();
const arbitrage = new web3.eth.Contract(arbitrageInfo.abi, arbitrageInfo.address)
const _ = require('lodash');

const InputDataDecoder = require('ethereum-input-data-decoder');

let common = require('../common/common');
let fs = require('fs');
let BN = require('bignumber.js');
let dayjs = require('dayjs');
/* 这个库和合约不同，使用币的个数计算，例如 3eth,10btc,0.003fee 这种 */
const calcHelper = require('./calc_comparisons.js');

let cc = require('../ChainConfig');

const axios = require('axios')

let ioc = require('socket.io-client');
let c = console.log;

let gTokens = [];
let gJob = null;

class Mempool {
    txs = {}; //根据hash索引
    accTxs = {}; //{"fromA": [txHash1, txHash2, txHash3], "fromB": [txHash1]} 只存hash作为索引，再去txs找。

    constructor() {

    }

    add = function (tx) {
        this.txs[tx.hash] = tx;
        //循环，如果发现同人的低gasPrice，覆盖
        if (!tx.gasPrice || !tx.from) return;
        let from = tx.from;
        if (this.accTxs.hasOwnProperty(from)) {
            this.accTxs[from].push(tx.hash);
        } else {
            this.accTxs[from] = [tx.hash];
        }
    };

    get = function (hash) {
        return this.txs[hash];
    };

    //此处的del是指交易被确认了。
    del = function (hash) {
        let tx = this.txs[hash];
        if (!tx) return;
        // if (!tx.from) {
        //     delete this.txs[tx.hash];
        //     return;
        // }

        this.delByDetail(tx);
    };

    delByDetail = function (tx) {
        let from = tx.from;
        let nonce = tx.nonce;
        //循环所有tx，找到同一个from的小nonce，然后也删除掉。
        if (this.accTxs[from]) {
            for (let i = this.accTxs[from].length - 1; i >= 0; i--) {
                let _hash = this.accTxs[from][i];

                if (!this.txs[_hash]) {
                    this.accTxs[from].splice(i, 1);
                } else if (this.txs[_hash].nonce <= nonce) {
                    this.accTxs[from].splice(i, 1);
                    if (_hash != tx.hash) c('delete replaced tx: ', _hash);
                    delete this.txs[_hash];
                }
            }
            if (this.accTxs[from].length == 0) {
                delete this.accTxs[from];
            }
        }

        delete this.txs[tx.hash];
    }

    length = function () {
        return Object.keys(this.txs).length;
    }

}
;

const gMempool = new Mempool();

async function main() {
    common.memoryInfoForever(30000);
    subscribe();
    printTxInfo();
    // snapshot();

    // await common.sleep(30 * 1000);
    doubleTeam();
}

async function printTxInfo() {
    while (true) {
        console.log(`[TXs] txs-count: ${gMempool.length()}, from-count: ${Object.keys(gMempool.accTxs).length}`);
        await common.sleep(60000);
    }
}

async function snapshot() {
    while (true) {
        let a = {};
        a['txs'] = gMempool.txs;
        a['accTxs'] = gMempool.accTxs;
        fs.writeFileSync('./mempool.json', JSON.stringify(a));
        c('-----------snapshot done----------');
        await common.sleep(30 * 1000);
    }
}

async function subscribe() {
    web3WS.eth.subscribe('pendingTransactions', async (e, hash) => {
        // 未确认交易
        if (e) {
            console.error('pendingTransactions error:', e);
            return;
        }
        let tx = {
            hash: hash,
            gasPrice: 0,
            timestamp: dayjs().unix(),
        };
        // gMempool.add(tx);
        //获取详细信息
        web3WS.eth.getTransaction(hash, async (err, _tx) => {
            if (err) {
                console.log('getTransaction error: ', err);
                return;
            }
            if (!_tx) {
                // gMempool.del(hash);
                // c(`tx: ${hash} not exists`);
                return;
            }
            // let tx = gMempool.get(_tx.hash);
            // if (!tx) {
            //     return;
            // }
            // tx.from = _tx.from;
            // tx.to = _tx.to;
            // tx.nonce = _tx.nonce;
            // tx.value = _tx.value;
            // tx.gasPrice = _tx.gasPrice;
            // tx.input = _tx.input;
            // gMempool.add(tx);
            gMempool.add(_tx);

            if ((await checkDoubleTeam(_tx)) && !gJob) {
                gJob = _.cloneDeep(_tx);
            }

        });
    });


    // web3.eth.subscribe('logs', {}, (e, d) => {
    //     //每次出块后的变动log
    //     if (e) {
    //         console.error('logs error:', e);
    //     }
    //     gMempool.del(d.transactionHash);
    // });


    web3WS.eth.subscribe('newBlockHeaders', async (e, d) => {
        //新块的头信息
        if (e) {
            console.error('newBlockHeaders error:', e);
        }
        // c(d);
        let block = await web3WS.eth.getBlock(d.number, true);
        for (let tx of block.transactions) {
            gMempool.delByDetail(tx);
        }
        //放在这儿太慢了，应该获取的一个就干。 寻找大户交易
        // doubleTeam(block);
    })
}

async function checkDoubleTeam(tx) {
    /**
     * swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to,uint deadline)
     * swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to,uint deadline)
     *
     * swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
     * swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
     *
     * swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline)
     * swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
     */
    if (tx.to != cc.exchange.uniswap.router02.address) {
        return false;
    }
    const decode = new InputDataDecoder(cc.exchange.uniswap.router02.abi);

    // c('uniswap tx', tx);
    /**
     * {
              method: 'swapTokensForExactETH',
              types: [ 'uint256', 'uint256', 'address[]', 'address', 'uint256' ],
              inputs: [
                BN { negative: 0, words: [Array], length: 3, red: null },
                BN { negative: 0, words: [Array], length: 3, red: null },
                [
                  '514910771af9ca656af840dff83e8264ecf986ca',
                  'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
                ],
                '92f29100cc4dca707359d8eb78402eb3acfd87d3',
                BN { negative: 0, words: [Array], length: 2, red: null }
              ],
              names: [ 'amountOut', 'amountInMax', 'path', 'to', 'deadline' ]
           }
     */
    const result = decode.decodeData(tx.input);
    let path0, path1;
    // if (_.includes(['swapTokensForExactTokens', 'swapExactTokensForTokens'], result.method)) {
    //     [path0, path1] = result.inputs[2];
    // } else
    if (_.includes(['swapETHForExactTokens', 'swapExactETHForTokens'], result.method)) {
        [path0, path1] = result.inputs[1];
    } else {
        return false;
    }

    if (common.addressEqual(path1, '0xdac17f958d2ee523a2206206994597c13d831ec7')) { // usdt有些问题
        return false;
    }

    // c(`path0, path1`, path0, path1)
    if (!path0 || !path1) {
        return false;
    }
    if (!common.addressEqual(path0, cc.token.weth.address) /* || !common.addressEqual(path1, cc.token.dai.address) */) {
        return false;
    }
    if (web3.utils.fromWei(tx.value, 'ether') < 50) {
        return false;
    }
    tx.decodeData = result;
    return true;
}

async function doubleTeam() {
    let mock = {
        blockHash: null,
        blockNumber: null,
        from: '0x125BF69C61AF3c60ca1c0dF5bBbCe503CfF7B1ae',
        gas: 500000,
        gasPrice: '115039062500',
        hash: '0x38c6168a12820d8f452f8234f505ed206d2cd6f841d6676a29f41aa29cfacdcf',
        input: '0xfb3bdb41000000000000000000000000000000000000000000000984680fcc378b8000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000125bf69c61af3c60ca1c0df5bbbce503cff7b1ae000000000000000000000000000000000000000000000000000000005ff4411f0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000006b175474e89094c44da98b954eedeac495271d0f',
        nonce: 3696,
        to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        transactionIndex: null,
        value: '43598293808028680192',
        v: '0x26',
        r: '0x6d535f48f7b29097cb8fe93c24484357b2bb20f8da2ba3044cc4a75f1cfd6183',
        s: '0xb111d7494cf0c521072543f34256abf31481116a8068c061723056e5bcefde0',
        decodeData: {
            method: 'swapETHForExactTokens',
            types: ['uint256', 'address[]', 'address', 'uint256'],
            inputs: [[BN], ['c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '6b175474e89094c44da98b954eedeac495271d0f'], '125bf69c61af3c60ca1c0df5bbbce503cff7b1ae', [BN]],
            names: ['amountOut', 'path', 'to', 'deadline']
        }
    };

    while (true) {
        if (!gJob) {
            await common.sleep(50);
            continue;
        }
        c('doubleTeam begin', gJob);

        if (web3.utils.fromWei(gJob.gasPrice, 'gwei') > 150) {
            c('gasPrice too large, skip');
            gJob = null;
            await common.sleep(50);
            continue;
        }

        let nonce = await web3WS.eth.getTransactionCount(acc.address);
        let [from, to] = gJob.decodeData.inputs[1];
            // c(from, to);

            //发出两个交易
            //1 调用合约，买币  [amountIn, routerAddress, [from, to]]
            async function one() {
                try {
                    let args = ['31515416', '3333333333', web3.utils.toWei('5', 'ether'), cc.exchange.uniswap.router02.address, '0x' + from, '0x' + to];
                    c('args1', args, new BN(gJob.gasPrice).plus('10000000000').toFixed(0), nonce);
                    let x = await arbitrage.methods
                        .doubleTeam(...args)
                        .send({
                            from: acc.address,
                            gas: 300000,
                            gasPrice: new BN(gJob.gasPrice).plus('10000000000').toFixed(0),
                            nonce: nonce
                        });
                    c('tx', x);
                } catch (e) {
                    c("doubleTeam1 error: ", e);
                    process.exit();
                }
            }

        one()
        await common.sleep(100);
        //2 卖币 [amountIn, routerAddress, [from, to]]
        try {
            let args = ['31515416', '3333333333', '0', cc.exchange.uniswap.router02.address, '0x' + to, '0x' + from];
            c('args2', args, new BN(gJob.gasPrice).minus('1000000000').toFixed(0), nonce + 1);
            let x = await arbitrage.methods
                .doubleTeam(...args)
                .send({
                    from: acc.address,
                    gas: 300000,
                    gasPrice: new BN(gJob.gasPrice).minus('1000000000').toFixed(0),
                    nonce: nonce + 1
                });
            c('tx', x);
        } catch (e) {
            c("doubleTeam2 error: ", e);
            process.exit();
        }

        gJob = null;
    }

}

main();

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
const {acc} = init.initWeb3AndAccount();
const web3 = init.initWSWeb3();
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
        if (!tx || !tx.from) return;
        let from = tx.from;
        let nonce = tx.nonce;
        //循环所有tx，找到同一个from的小nonce，然后也删除掉。
        if (this.accTxs[from]) {
            for (let i = this.accTxs[from].length - 1; i >= 0; i--) {
                let _hash = this.accTxs[from][i];

                if (this.txs[_hash].nonce <= nonce) {
                    this.accTxs[from].splice(i, 1);
                    if (_hash != hash) c('delete replaced txhash: ', _hash);
                    delete this.txs[_hash];
                }
            }
            if (this.accTxs[from].length == 0) {
                delete this.accTxs[from];
            }
        }

        delete this.txs[hash];
    };

    length = function () {
        return Object.keys(this.txs).length;
    }

}
;

const gMempool = new Mempool();

async function main() {
    common.memoryInfoForever(30000);
    gMempool.add({
        "hash": "0x73252518a38f50443e6c95d7170a433ad7ea0e6a0a2f161c54b054874a44cf9d",
        "timestamp": 1609408585,
        "from": "0x9A55Dc9CcDD9a049FD53494dC2C4Ee868b3DBfC1",
        "to": "0x00000000DC0E59517a8114348d9130e7d3835832",
        "nonce": 6665,
        "value": "0",
        "gasPrice": "4985259463724",
        "input": "0x7b0b426616e96514f30067f4019e93837e81484162a4199f80ca31d4dbbaed40d7a1ee304ac439fb9c51a49899781de537fd766718f0954bc470963add309d21b7faa1f95298c13e3c99530e3e476af4653ed353b215ea98183502b4ca58dcf62911b09b"
    });
    gMempool.add({
        "hash": "0x2e4bda018bcfb572c73192526820fa4463afe1fc1bab507a7587fdca450d3abf",
        "timestamp": 1609408577,
        "from": "0x9A55Dc9CcDD9a049FD53494dC2C4Ee868b3DBfC1",
        "to": "0x00000000DC0E59517a8114348d9130e7d3835832",
        "nonce": 6665,
        "value": "0",
        "gasPrice": "1315883089952",
        "input": "0x7b0b426616e96514f30067f4019e93837e81484162a4199f80ca31d4dbbaed40d7a1ee304ac439fb9c51a49899781de537fd766718f0954bc470963add309d21b7faa1f95298c13e3c99530e3e476af4653ed353b215ea98183502b4ca58dcf62911b09b"
    });
    gMempool.add({
        "hash": "0x52f9c7bd74de51a57c80097ec944ca3b936a67d329e631c5f43b2e3f8a069dd3",
        "timestamp": 1609408576,
        "from": "0x9A55Dc9CcDD9a049FD53494dC2C4Ee868b3DBfC1",
        "to": "0x00000000DC0E59517a8114348d9130e7d3835832",
        "nonce": 6666,
        "value": "0",
        "gasPrice": "750740471840",
        "input": "0x7b0b426616e96514f30067f4019e93837e81484162a4199f80ca31d4dbbaed40d7a1ee304ac439fb9c51a49899781de537fd766718f0954bc470963add309d21b7faa1f95298c13e3c99530e3e476af4653ed353b215ea98183502b4ca58dcf62911b09b"
    });
    gMempool.del('0x2e4bda018bcfb572c73192526820fa4463afe1fc1bab507a7587fdca450d3abf');
    console.log(gMempool);
    // subscribe();
    // printTxInfo();

    (async function () {
        await common.sleep(10 * 60 * 1000);
        let a = {};
        a['txs'] = gMempool.txs;
        a['accTxs'] = gMempool.accTxs;
        fs.writeFileSync('./txs.json', JSON.stringify(a));
        c('-----------done----------!!');
    })()
}

async function printTxInfo() {
    while (true) {
        console.log(`[TXs] txs-count: ${gMempool.length()}, from-count: ${Object.keys(gMempool.accTxs).length}`);
        await common.sleep(1500);
    }
}

async function subscribe() {
    web3.eth.subscribe('pendingTransactions', (e, hash) => {
        // 未确认交易
        if (e) {
            console.error('pendingTransactions error:', e);
            return;
        }
        let tx = {
            hash: hash,
            timestamp: dayjs().unix(),
        };
        gMempool.add(tx);
        //获取详细信息
        web3.eth.getTransaction(hash, (err, _tx) => {
            if (err) {
                console.log('getTransaction error: ', err);
                return;
            }
            if (!_tx) {
                // c(`tx: ${hash} not exists`);
                return;
            }
            let tx = gMempool.get(_tx.hash);
            tx.from = _tx.from;
            tx.to = _tx.to;
            tx.nonce = _tx.nonce;
            tx.value = _tx.value;
            tx.gasPrice = _tx.gasPrice;
            tx.input = _tx.input;
            gMempool.add(tx);
            // if (tx.to == cc.exchange.uniswap.router02.address) {
            //     c('uniswap call');
            //     const decode = new InputDataDecoder(cc.exchange.uniswap.router02.abi);
            //     const result = decode.decodeData(tx.input);
            //     c('uniswap input data:', result);
            // }
        });
    });

    // web3.eth.subscribe('newBlockHeaders', (e, d) => {
    //     //新块的头信息
    //     if (e) {
    //         console.error('newBlockHeaders error:', e);
    //     }
    //     c(d);
    // })

    web3.eth.subscribe('logs', {}, (e, d) => {
        //每次出块后的变动log
        if (e) {
            console.error('logs error:', e);
        }
        gMempool.del(d.transactionHash);
    });
}

main();

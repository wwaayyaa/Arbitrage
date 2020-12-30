/**
 * 该脚本通过 ws+http 监控内存池
 * 1. 通过 ws:pendingTransactions 接收新的交易
 * 2. 通过 ws:logs 能获得出块高度和入块的交易
 * 3. 通过 web3.eth.getBlock('pending', true) 获取即将入块的交易信息（含有交易的to、data）
 * 4. 通过 web3.eth.getTransaction('xx') 获取每个交易的信息
 */
const init = require('../common/init').init();
const db = init.initDB();
const {acc} = init.initWeb3AndAccount();
const web3 = init.initWSWeb3();

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
let gTxs = {};


async function main() {
    common.memoryInfoForever(30000);

    subscribe();

}

async function printTxInfo(){
    while (true){
        console.log(`[TXs] count: ${gTxs.length}`);
        await common.sleep(15000);
    }
}

async function subscribe() {
    web3.eth.subscribe('pendingTransactions', (e, hash) => {
        // 未确认交易
        if (e) {
            console.error('pendingTransactions error:', e);
            return;
        }
        gTxs[hash] = {
            hash: hash,
            timestamp: dayjs().unix(),
        };
        //获取详细信息
        web3.eth.getTransaction(hash, (err, tx) => {
            if (err) {
                console.log('getTransaction error: ', err);
                return;
            }
            if (!tx) {
                // c(`tx: ${hash} not exists`);
                return;
            }
            gTxs[hash].from = tx.from;
            gTxs[hash].to = tx.to;
            gTxs[hash].nonce = tx.nonce;
            gTxs[hash].value = tx.value;
            gTxs[hash].gasPrice = tx.gasPrice;
            gTxs[hash].input = tx.input;

            if (tx.to == cc.exchange.uniswap.router02.address) {
                c('uniswap call');
                const decode = new InputDataDecoder(cc.exchange.uniswap.router02.abi);
                const result = decode.decodeData(tx.input);
                c('uniswap input data:', result);
            }
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
        if (gTxs.hasOwnProperty(d.transactionHash)) {
            delete gTxs[d.transactionHash];
        }
    })
}

main();

let fs = require('fs');
let BN = require('bignumber.js');

let Web3 = require('web3');
let web3 = new Web3('http://8.210.15.226:8545');
let cc = require('../ChainConfig');

let Exchange = require('./exchange/exchange');
let Pair = require('./exchange/pair');

let ioc = require('socket.io-client');

const acc = web3.eth.accounts.privateKeyToAccount('0x9679727a20329d53f114382ea91b6f9e1e3e0b622f79a44bd53a5b2fb794171d');

async function main() {
    //init socket
    let socket = ioc('http://localhost:4000', {
        path: '/s'
    });
    // let exchanges = Object.keys(cc.exchange);
    for (let e in cc.exchange) {
        if (!cc.exchange[e].collect) continue;
        for (let p in cc.exchange[e].pair) {
            try{
                collect(e, p, socket);
            }catch (e) {
                console.log('collect error', e);
            }
        }
    }
}

async function collect(exchangeName, pairName, socket) {
    while (true) {
        //不同的swap指标不一样，现在先监控 流动性和价格
        let ex = new Exchange(exchangeName, cc.exchange[exchangeName].router02.address, cc.exchange[exchangeName].router02.abi, web3, acc);
        ex.setPair(new Pair(pairName, cc.exchange[exchangeName].pair[pairName].address, cc.exchange[exchangeName].pair[pairName].abi));
        let info = await ex.getPriceInfo();
        [name0, name1] = pairName.split('-');
        info['name0'] = name0;
        info['name1'] = name1;
        info['decimal0'] = cc.token[name0].decimals;
        info['decimal1'] = cc.token[name1].decimals;
        let reserve0 = new BN(info['reserve0']);
        let reserve1 = new BN(info['reserve1']);
        info['amount0'] = reserve0.div(new BN(10).pow(info['decimal0'])).toFixed(8);
        info['amount1'] = reserve1.div(new BN(10).pow(info['decimal1'])).toFixed(8);
        info['price'] = (new BN(info['amount0'])).div(info['amount1']).toFixed(8);
        console.log(exchangeName, pairName, info);

        //socketio
        socket.emit('collected', {exchangeName, pairName, info});

        await sleep(4000);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}


main();

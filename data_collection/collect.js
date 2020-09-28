let fs = require('fs');

let Web3 = require('web3');
let web3 = new Web3('http://8.210.15.226:8545');
let cc = require('../ChainConfig');

let Exchange = require('./exchange/exchange');
let Pair = require('./exchange/pair');
const acc = web3.eth.accounts.privateKeyToAccount('0x9679727a20329d53f114382ea91b6f9e1e3e0b622f79a44bd53a5b2fb794171d');

async function main() {
    // let exchanges = Object.keys(cc.exchange);
    for(let e in cc.exchange){
        if(!cc.exchange[e].collect) continue;
        for (let p in cc.exchange[e].pair){
            collect(e, p);
        }
    }
}

async function collect(exchangeName, pairName){
    while (true){
        //不同的swap指标不一样，现在先监控 流动性和价格
        let ex = new Exchange(exchangeName, cc.exchange[exchangeName].router02.address, cc.exchange[exchangeName].router02.abi, web3, acc);
        ex.setPair(new Pair(pairName, cc.exchange[exchangeName].pair[pairName].address, cc.exchange[exchangeName].pair[pairName].abi));
        let info = await ex.getPriceInfo();
        console.log(exchangeName, pairName, info);
        //TODO 送到socketio

        await sleep(1000);
    }
}

function sleep(ms){
    return new Promise(resolve => setTimeout(()=>resolve(), ms));
}


main();

require('dotenv').config();
let common = require('../common/common');
let struct = require('../common/struct');
let fs = require('fs');
let BN = require('bignumber.js');
let dayjs = require('dayjs');

let Web3 = require('web3');
let web3;
if (process.env.APP_ENV == 'production') {
    web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/9cc52b7d92aa4107addd8dcf83a8b008"));
} else {
    web3 = new Web3('http://0.0.0.0:8545');
}

// let web3 = new Web3('http://8.210.15.226:8545');
let cc = require('../ChainConfig');

let Exchange = require('./exchange/exchange');
let Pair = require('./exchange/pair');
const axios = require('axios')

let ioc = require('socket.io-client');
let c = console.log;
const {Sequelize} = require('sequelize');
const sql = new Sequelize(process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql'
});
const dingKey = process.env.DING_KEY;
const acc = web3.eth.accounts.privateKeyToAccount('0x9679727a20329d53f114382ea91b6f9e1e3e0b622f79a44bd53a5b2fb794171d');
let gTokens = [];

async function main(){
    let socket = ioc('http://localhost:2077');
    priceList = [{
        protocol: 'balancer',
        exchange: '0x7afe74ae3c19f070c109a38c286684256adc656c',
        quoteA: 'weth',
        quoteB: 'dai',
        price: '500',
    }];
    let SocketCollectedPriceInfoList = priceList.map(p => {
        return new struct.SocketCollectedPriceInfo(p.protocol, p.exchange, p.quoteA, p.quoteB, p.price, 123);
    });
    socket.emit('collected_v3', SocketCollectedPriceInfoList);
    console.log(1);
}

main();

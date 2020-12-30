const path = require('path');
const db = require('./db').DB;
const Web3 = require('web3');
const cc = require(path.join(__dirname + '/../ChainConfig'));
const ca = require(path.join(__dirname + '/../ContractAddresses'));

class init {
    constructor() {
        process.on('unhandledRejection', (reason, promise) => {
            console.log('未处理的拒绝：', promise, '原因：', reason);
            // 记录日志、抛出错误、或其他逻辑。
        });
        require('dotenv').config({path: path.join(__dirname + '/../.env')});
    }

    initDB() {
        return new db(process.env.DB_HOST, process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASS, {});
    }

    initWeb3AndAccount() {
        let web3;
        if (process.env.APP_ENV == 'production') {
            web3 = new Web3(new Web3.providers.HttpProvider(process.env.WEB3_PROVIDER_ENDPOINT));
        } else {
            web3 = new Web3(process.env.WEB3_PROVIDER_ENDPOINT);
        }
        const acc = web3.eth.accounts.privateKeyToAccount(process.env.ETH_PRIVATE_KEY);
        web3.eth.accounts.wallet.add(acc);
        return {web3, acc, Web3}
    }
    initWSWeb3() {
        return new Web3(process.env.WEB3_WS_PROVIDER_ENDPOINT);
    }
    initLocalWeb3() {
        return new Web3("http://0.0.0.0:8545");
    }

    getArbitrage() {
        if (process.env.APP_ENV == 'production') {
            return {address: process.env.CONTRACT_ADDRESS, abi: ca.Arbitrage.abi};
        } else {
            return {address: ca.Arbitrage.address, abi: ca.Arbitrage.abi};
        }
    }
}

exports.init = function () {
    return new init();
};

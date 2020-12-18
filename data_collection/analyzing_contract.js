process.on('unhandledRejection', (reason, promise) => {
    console.log('未处理的拒绝：', promise, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

require('dotenv').config();
let common = require('../common/common');
let struct = require('../common/struct');
let BN = require('bignumber.js');
let dayjs = require('dayjs');

let Web3 = require('web3');
let web3;
if (process.env.APP_ENV == 'production') {
    web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/9cc52b7d92aa4107addd8dcf83a8b008"));
} else {
    web3 = new Web3('http://0.0.0.0:8545');
}

let cc = require('../ChainConfig');

const axios = require('axios')

let c = console.log;
const {Sequelize} = require('sequelize');
const sql = new Sequelize(process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql'
});
const acc = web3.eth.accounts.privateKeyToAccount('0x9679727a20329d53f114382ea91b6f9e1e3e0b622f79a44bd53a5b2fb794171d');
const {program} = require('commander');


let gTokens = [];

async function loadTokens(sql) {
    let tokens = await sql.query("SELECT * FROM `token` ;", {type: 'SELECT'});
    let ret = {};
    tokens.forEach(i => {
        ret[i.name] = i;
    });
    return ret;
}

async function main() {
    let recognitionToken = async function (address, save) {
        let ctt = new web3.eth.Contract(cc.token.abi, address);
        let symbol = await ctt.methods.symbol().call({from: acc.address});
        let decimal = await ctt.methods.decimals().call({from: acc.address});
        console.log(address, symbol, decimal);
        if (save) {
            let [err, ok] = await updateToken(address.toLowerCase(), symbol.toLowerCase(), decimal);
            if (err) {
                console.error(`update token info error: ${err.message || ""}`);
            }
        }
    };
    program.version('0.0.1')
        .command('token <address> [save]')
        .description("analizing token info")
        .action(recognitionToken);

    program
        .command('uniswap <type> <address> [save]')
        .description("analizing uniswap info")
        .action(async (type, address, save) => {
            address = address.toLowerCase();
            let tokens = await loadTokensAddrKey(sql);
            let ctt = new web3.eth.Contract(cc.exchange.uniswap.pair.abi, address);
            let token0 = (await ctt.methods.token0().call({from: acc.address})).toLowerCase();
            let token1 = (await ctt.methods.token1().call({from: acc.address})).toLowerCase();
            if (!tokens.hasOwnProperty(token0)) {
                //识别token
                c(`recognition ${token0}`)
                await recognitionToken(token0, save);
            }
            if (!tokens.hasOwnProperty(token1)) {
                //识别token
                c(`recognition ${token1}`)
                await recognitionToken(token1, save);
            }
            tokens = await loadTokensAddrKey(sql);

            // let reserves = await ctt.methods.getReserves().call({from: acc.address});
            console.log(token0, token1, `${tokens[token0].name}/${tokens[token1].name}`);

            if (save) {
                let [err, ok] = await updateQuote(type, `${tokens[token0].name}/${tokens[token1].name}`, "uniswap", address, 0.003);
                if (err) {
                    console.error(`update token info error: ${err.message || ""}`);
                }
                process.exit(0);
            }
        });

    program
        .command('balancer <address> [save]')
        .description("analizing balancer info")
        .action(async (address, save) => {
            let tokens = await loadTokensAddrKey(sql);
            let ctt = new web3.eth.Contract(cc.exchange.balancer.abi, address);
            let cttTokens = await ctt.methods.getFinalTokens().call({from: acc.address});
            let weights = [];
            for (let i = 0; i < cttTokens.length; i++) {
                let cToken = cttTokens[i].toLowerCase();
                if (!tokens.hasOwnProperty(cToken)) {
                    c(`recognition balancer tokens: ${i} ${cToken}`)
                    await recognitionToken(cToken, save);
                }
                let weight = await ctt.methods.getDenormalizedWeight(cToken).call();
                weights.push(web3.utils.fromWei(weight, 'ether'));
            }
            tokens = await loadTokensAddrKey(sql);
            let tokensName = []
            for (let i = 0; i < cttTokens.length; i++) {
                let cToken = cttTokens[i].toLowerCase();
                tokensName.push(tokens[cToken].name);
            }

            let fee = await ctt.methods.getSwapFee().call({from: acc.address});
            fee = new BN(fee).div(new BN("10").pow(18)).toFixed(8);
            console.log(`${tokensName.join('/')}`);

            if (save) {
                let [err, ok] = await updateQuote(/* balancer 的exchange就是合约地址 */address, tokensName.join('/'), "balancer", address, fee, weights.join('/'));
                if (err) {
                    console.error(`update token info error: ${err.message || ""}`);
                }
                process.exit(0);
            }
        });

    program.parse(process.argv);
}

async function updateToken(address, name, decimal) {
    try {
        await sql.query("insert into token (name, `decimal`, address) " +
            "values (?, ?, ?) " +
            "on duplicate key update " +
            "`decimal` = values(`decimal`) ",
            {
                replacements: [name, decimal - 0, address],
                type: 'INSERT'
            })
    } catch (e) {
        return [e, false];
    }
    return [null, true];
}

async function updateQuote(exchange, name, protocol, address, fee, args) {
    try {
        await sql.query("insert into quote (exchange, name, protocol, enabled, contract_address, fee, args, created_at) " +
            "values (?, ?, ?, ?, ?, ?, ?, ?) " +
            "on duplicate key update " +
            "`fee` = values(`fee`), args = values(args) ",
            {
                replacements: [exchange, name, protocol, 1, address, fee, args || "", new dayjs().format("YYYY-MM-DD HH:mm:ss")],
                type: 'INSERT'
            })
    } catch (e) {
        return [e, false];
    }
    return [null, true];
}

async function loadTokensAddrKey(sql) {
    let tokens = await sql.query("SELECT * FROM `token` ;", {type: 'SELECT'});
    let ret = {};
    tokens.forEach(i => {
        ret[i.address.toLowerCase()] = i;
    });
    return ret;
}

main();

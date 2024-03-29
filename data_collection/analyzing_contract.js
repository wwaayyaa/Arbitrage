const init = require('../common/init').init();
const db = init.initDB();
const {web3, acc} = init.initWeb3AndAccount();

let common = require('../common/common');
let BN = require('bignumber.js');
let dayjs = require('dayjs');

let cc = require('../ChainConfig');

let c = console.log;
const {program} = require('commander');

async function main() {
    let recognitionToken = async function (address, save) {
        let ctt = new web3.eth.Contract(cc.token.abi, address);
        let symbol = await ctt.methods.symbol().call({from: acc.address});
        let decimal = await ctt.methods.decimals().call({from: acc.address});
        console.log(address, symbol, decimal);
        if (save) {
            let [err, ok] = await db.updateToken(address.toLowerCase(), symbol.toLowerCase(), decimal);
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
            let tokens = await db.getTokensKeyByAddress();
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
            tokens = await db.getTokensKeyByAddress();

            // let reserves = await ctt.methods.getReserves().call({from: acc.address});
            console.log(token0, token1, `${tokens[token0].name}/${tokens[token1].name}`);

            if (save) {
                let [err, ok] = await db.updateQuote(type, `${tokens[token0].name}/${tokens[token1].name}`, "uniswap", address, 0.003);
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
            let tokens = await db.getTokensKeyByAddress();
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
            tokens = await db.getTokensKeyByAddress();
            let tokensName = []
            for (let i = 0; i < cttTokens.length; i++) {
                let cToken = cttTokens[i].toLowerCase();
                tokensName.push(tokens[cToken].name);
            }

            let fee = await ctt.methods.getSwapFee().call({from: acc.address});
            fee = new BN(fee).div(new BN("10").pow(18)).toFixed(8);
            console.log(`${tokensName.join('/')}`);

            if (save) {
                let [err, ok] = await db.updateQuote(/* balancer 的exchange就是合约地址 */address, tokensName.join('/'), "balancer", address, fee, weights.join('/'));
                if (err) {
                    console.error(`update token info error: ${err.message || ""}`);
                }
                process.exit(0);
            }
        });

    program.parse(process.argv);
}

main();

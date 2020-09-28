let Pair = require('./pair');

function Exchange(name, address, abi, web3, account) {
    this.name = name;
    this.address = address;
    this.abi = abi;
    this.web3 = web3;
    this.account = account;
    this.contract = new web3.eth.Contract(abi, address);
}

Exchange.prototype.name = function () {
    return this.name;
};

Exchange.prototype.address = function () {
    return this.address;
};

Exchange.prototype.abi = function () {
    return this.abi;
};

Exchange.prototype.setPair = function (pair) {
    this.pair = pair;
    this.pairContract = new this.web3.eth.Contract(pair.abi, pair.address);
    return this;
};

Exchange.prototype.getPriceInfo = async function () {
    let reserves = await this.pairContract.methods.getReserves().call({from: this.account.address});
    return {reserve0: reserves[0], reserve1: reserves[1], price: reserves[1] == 0 ? 0 : reserves[0] / reserves[1]}
};

module.exports = Exchange;

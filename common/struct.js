// function SocketCollectedPriceInfo(){
//
// }

class SocketCollectedPriceInfo{
    constructor(protocol, exchange, quoteA, quoteB, price) {
        this.protocol = protocol;
        this.exchange = exchange;
        this.quoteA = quoteA;
        this.quoteB = quoteB;
        this.price = price;
    }
}

exports.SocketCollectedPriceInfo = SocketCollectedPriceInfo;

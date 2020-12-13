// function SocketCollectedPriceInfo(){
//
// }

class SocketCollectedPriceInfo{
    constructor(protocol, exchange, quoteA, quoteB, price, height) {
        this.protocol = protocol;
        this.exchange = exchange;
        this.quoteA = quoteA;
        this.quoteB = quoteB;
        this.price = price;
        this.height = height || 0;
    }
}

exports.SocketCollectedPriceInfo = SocketCollectedPriceInfo;

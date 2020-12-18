const Decimal = require('decimal.js');
const BN = require('bignumber.js');

function BalancerUtils() {
    this.calcRelativeDiff = function (expected, actual) {
        return ((Decimal(expected).minus(Decimal(actual))).div(expected)).abs();
    }

    this.calcSpotPrice = function (tokenBalanceIn, tokenWeightIn, tokenBalanceOut, tokenWeightOut, swapFee) {
        const numer = Decimal(tokenBalanceIn).div(Decimal(tokenWeightIn));
        const denom = Decimal(tokenBalanceOut).div(Decimal(tokenWeightOut));
        const ratio = numer.div(denom);
        const scale = Decimal(1).div(Decimal(1).sub(Decimal(swapFee)));
        const spotPrice = ratio.mul(scale);
        return spotPrice;
    }

    this.calcOutGivenIn = function (tokenBalanceIn, tokenWeightIn, tokenBalanceOut, tokenWeightOut, tokenAmountIn, swapFee) {
        // console.log(`tokenBalanceIn, tokenWeightIn, tokenBalanceOut, tokenWeightOut, tokenAmountIn, swapFee`, tokenBalanceIn, tokenWeightIn, tokenBalanceOut, tokenWeightOut, tokenAmountIn, swapFee);
        const weightRatio = Decimal(tokenWeightIn).div(Decimal(tokenWeightOut));
        const adjustedIn = Decimal(tokenAmountIn).times((Decimal(1).minus(Decimal(swapFee))));
        const y = Decimal(tokenBalanceIn).div(Decimal(tokenBalanceIn).plus(adjustedIn));
        const foo = y.pow(weightRatio);
        const bar = Decimal(1).minus(foo);
        const tokenAmountOut = Decimal(tokenBalanceOut).times(bar);
        return tokenAmountOut;
    }

    this.calcInGivenOut = function (tokenBalanceIn, tokenWeightIn, tokenBalanceOut, tokenWeightOut, tokenAmountOut, swapFee) {
        const weightRatio = Decimal(tokenWeightOut).div(Decimal(tokenWeightIn));
        const diff = Decimal(tokenBalanceOut).minus(tokenAmountOut);
        const y = Decimal(tokenBalanceOut).div(diff);
        const foo = y.pow(weightRatio).minus(Decimal(1));
        const tokenAmountIn = (Decimal(tokenBalanceIn).times(foo)).div(Decimal(1).minus(Decimal(swapFee)));
        return tokenAmountIn;
    }

    this.calcPoolOutGivenSingleIn = function (tokenBalanceIn, tokenWeightIn, poolSupply, totalWeight, tokenAmountIn, swapFee) {
        const normalizedWeight = Decimal(tokenWeightIn).div(Decimal(totalWeight));
        const zaz = Decimal(1).sub(Decimal(normalizedWeight)).mul(Decimal(swapFee));
        const tokenAmountInAfterFee = Decimal(tokenAmountIn).mul(Decimal(1).sub(zaz));
        const newTokenBalanceIn = Decimal(tokenBalanceIn).add(tokenAmountInAfterFee);
        const tokenInRatio = newTokenBalanceIn.div(Decimal(tokenBalanceIn));
        const poolRatio = tokenInRatio.pow(normalizedWeight);
        const newPoolSupply = poolRatio.mul(Decimal(poolSupply));
        const poolAmountOut = newPoolSupply.sub(Decimal(poolSupply));
        return poolAmountOut;
    }

    this.calcSingleInGivenPoolOut = function (tokenBalanceIn, tokenWeightIn, poolSupply, totalWeight, poolAmountOut, swapFee) {
        const normalizedWeight = Decimal(tokenWeightIn).div(Decimal(totalWeight));
        const newPoolSupply = Decimal(poolSupply).plus(Decimal(poolAmountOut));
        const poolRatio = newPoolSupply.div(Decimal(poolSupply));
        const boo = Decimal(1).div(normalizedWeight);
        const tokenInRatio = poolRatio.pow(boo);
        const newTokenBalanceIn = tokenInRatio.mul(Decimal(tokenBalanceIn));
        const tokenAmountInAfterFee = newTokenBalanceIn.sub(Decimal(tokenBalanceIn));
        const zar = (Decimal(1).sub(normalizedWeight)).mul(Decimal(swapFee));
        const tokenAmountIn = tokenAmountInAfterFee.div(Decimal(1).sub(zar));
        return tokenAmountIn;
    }
}

function UniswapHelper() {
    /*
    * function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) internal pure returns (uint amountOut) {
        require(amountIn > 0, 'UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'UniswapV2Library: INSUFFICIENT_LIQUIDITY');
        uint amountInWithFee = amountIn.mul(997);
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
        *
        * 改方法是用最小单位计算，结果是out的位数
    }*/
    this.getAmountOut = function (amountIn, balanceIn, balanceOut) {
        let amountInWithFee = new BN(amountIn).times(997);
        let numerator = amountInWithFee.times(new BN(balanceOut));
        let denominator = new BN(balanceIn).times(1000).add(amountInWithFee);
        return numerator.div(denominator).toFixed(18);
    }

    this.getAmountOutDecimal = function (amountIn, balanceIn, balanceOut) {
        // console.log(`amountIn, balanceIn, balanceOut`, amountIn, balanceIn, balanceOut);
        let amountInWithFee = Decimal(amountIn).mul(Decimal(997));
        let numerator = Decimal(amountInWithFee).mul(Decimal(balanceOut));
        let denominator = Decimal(balanceIn).mul(Decimal(1000)).add(Decimal(amountInWithFee));
        return Decimal(numerator).div(Decimal(denominator)).toFixed(18);
    }
}

module.exports = {
    BalancerUtils,
    UniswapHelper,
};

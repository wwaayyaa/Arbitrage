## 价格监控 v3 
在v2版本，实现了uniswap协议和三大交易所的价格抓取。
但是在要引入balancer的时候遇到了问题。balancer可以有无数多的池，并且允许同样的交易对存在。之前的设计无法兼容。
现在重新修改quote表，引入协议信息，代码上根据不同的协议做不同的事情。下面列举已经支持的3个协议区别。
    1. cefi 最简单，通过相关http api获取价格信息，严格区分pair的顺序
    1. uniswap 目前支持uniswapV2、sushiswap，pair的顺序根据合约不定，需要特殊处理。
    1. balancer 会有N多池子，每个池子可能2-8个token，每个池子最大产生28个交易对信息。
价格依然通过socket传递，但是也要新增一个price表（用于保存最新的价格信息），和之前不一样的地方在于，现在会翻转pair的价格，也就是会同时存eth/usdt usdt/eth两行数据。
这个版本把合约地址带入数据库管理，并且对同样对合约，使用同一个abi，减少配置大小，也更加统一。

模块准备进一步拆分，会有一个socket的内存数据中心，web服务，抓取服务（cefi和defi拆分，cefi轮询，defi监控出块然后获取最新状态）。

统一规范，本系统内所有的交易对，```AAA/BBB = N``` 都意义是指一个AAA由BBB计价，如果```eth/usdt = 543.40```,代表一个eth，需要543.3个usdt

### 套利方式

#### 1. 搬砖套利
这种方式目前主要是在两个交易对之间做，且需要有本金。 如我有eth， 可以在两个不同的交易所之间做 eth/usdt的套利，最后换回eth。
例如 ETH -> USDT(甲交易所), USDT -> ETH(乙交易所)

#### 2. 三方搬砖套利
这种方式和搬砖类似，不过我并不持有任何一种token。此时需要我通过eth额外购买/闪贷其中一种token，再利上面的规则套利一圈，再卖成eth。
例如一 ETH -> ATOKEN, ATOKEN -> BTOKEN(甲交易所), BTOKEN -> ATOKEN(乙交易所), ATOKEN -> ETH
例如二 闪贷ATOKEN, ATOKEN -> BTOKEN(甲交易所), BTOKEN -> ATOKEN(乙交易所), 归还ATOKEN, 剩余ATOKEN -> ETH

#### 3. 三角套利
这个就是在3个quote之间流转一圈，实现套利。
例如 ETH -> ATOKEN, ATOKEN -> BTOKEN, BTOKEN -> ETH


### 合约的实现

暂时的想法是，合约提供step数组参数，合约内置支持uniswap、balancer两种交易方式。
合约内通过step 一步一步的执行计划，完成套利。
```javascript
//以下是两步套利的参数，每一步是5个参数，展开成10个参数的函数。
a2(
//protocol, exchangeContractAddress, fromToken, toToken, tradeAmount
'balancer', cc.exchange.balancer['0x7afe74ae3c19f070c109a38c286684256adc656c'].address, cc.token.weth.address, cc.token.dai.address, web3.utils.toWei("2", 'ether'),
'uniswap', cc.exchange.uniswap.router02.address, cc.token.dai.address, cc.token.weth.address, "0"
)
```


## 价格监控 v2
由于要同时监控DeFi和CeFi，所以之前的设计有些问题。
老的设计只监控了uni和sushi，同时强制绑定了他们同样的交易对为一组。
现在按照主流的规则 Token/MasterToken，例如dai/eth这种方式统一各个数据，交易所已经是标准做法。DeFi上面各不相同。
前端也要改成拖拽+随意组合的方式，方便同时观察多组数据在时间维度上的情况。

之前使用的LowDB,现在需要采用MySQL。

准备实现的交易对如下，主观按照重要程度排序

### CeFi
1. BTC/USDT
1. ETH/BTC
1. DAI/ETH

### DeFi
1. WBTC/ETH
1. USDT/ETH
1. USDC/ETH
1. DAI/ETH
1. LEND/ETH
1. ....
1. YFI
1. UNI
1. COMP


## 价格监控 v1
最早的版本，使用lowdb，监控了uniswap+sushiswap，当时发现要么两边价格一样，要么其中一边流动性不足。
并且没有差价发现机制。



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



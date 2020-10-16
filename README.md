## 价格监控 
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

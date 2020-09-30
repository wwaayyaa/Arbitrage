## 跨交易所双币种套利

1. 首先要监控价格
1. 发现两个交易对之间的差价有力可图则进行套利，影响因素：
    1. 价差达到的百分比
    2. 手续费情况
    3. 深度情况
1. 借贷来源
    1. aave-flashloan 如果借以太需要特殊地址 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE 特殊地址
    1. uniswap-flashswap
1. 然后在价格高的交易所换成token
    1. 如果是以太买token
    1. 如果是token买token
1. approve
1. 卖出token换回借贷资产
1. 还清借贷（本金+手续费）
1. 判断一波是否赚钱，如果亏了直接revert，赚了就下一步
1. 余额转出 or 存在合约等一次性提现


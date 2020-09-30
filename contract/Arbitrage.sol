pragma solidity ^0.6.6;

import "./aave/FlashLoanReceiverBase.sol";
import "./aave/ILendingPoolAddressesProvider.sol";
import "./aave/ILendingPool.sol";
import "./interfaces/IUniswapV2Router02.sol";
import './interfaces/IWETH.sol';

contract Arbitrage is FlashLoanReceiverBase {
    address immutable exchange1Addr;
    address immutable exchange2Addr;
    uint256 initAmount;
    uint which;
    address asset;
    address token;
    uint deadline;
    address[] path;

    constructor(address _addressProvider, address _exchange1, address _exchange2) FlashLoanReceiverBase(_addressProvider) public {
        exchange1Addr = _exchange1;
        exchange2Addr = _exchange2;
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(
        address _reserve,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _params
    )
        external
        override
    {
        require(_amount <= getBalanceInternal(address(this), _reserve), "Invalid balance, was the flashLoan successful?");
//    require(1!=1, 'just fk1');
        // Your logic goes here.
        //buy token2
        IUniswapV2Router02 _router;
        if (which == 2){
            _router = IUniswapV2Router02(exchange2Addr);
        } else if (which  == 1){
            _router = IUniswapV2Router02(exchange1Addr);
        }
//    require(1!=1, 'just fk2');
        IWETH WETH = IWETH(_router.WETH());
        IERC20 TOKEN = IERC20(token);
        uint _oldETHBalance = address(this).balance;
        uint _oldTokenBalance = TOKEN.balanceOf(address(this));

        address[] memory _path ;
        path = _path;
        path.push(_router.WETH());
        path.push(token);

        _router.swapExactETHForTokens.value(_amount)(0, path, address(this), deadline);


        //sell token2
        if (which == 2){
            _router = IUniswapV2Router02(exchange1Addr);
        } else if (which  == 1){
            _router = IUniswapV2Router02(exchange2Addr);
        }

        path = _path;
        path.push(token);
        path.push(_router.WETH());
        uint _newTokenBalance = TOKEN.balanceOf(address(this));
        require(_newTokenBalance > _oldTokenBalance, "miserable loss 1");

        //approve
        TOKEN.approve(address(_router), _newTokenBalance - _oldTokenBalance);

        _router.swapExactTokensForETH(_newTokenBalance - _oldTokenBalance, 0, path, address(this), deadline);
        uint _newETHBalance = address(this).balance;
        require(_newETHBalance > _oldETHBalance, "miserable loss 2");

        // !! Ensure that *this contract* has enough of `_reserve` funds to payback the `_fee` !!
        uint256 totalDebt = _amount.add(_fee);
        transferFundsBackToPoolInternal(_reserve, totalDebt);

    }

    /**
        Flash loan 1000000000000000000 wei (1 ether) worth of `_asset`
        只接我们想要的币种，哪边价格高就在哪边先卖出换成token2，然后再去价格低的地方买回来。
     */
    function flashloan(address _asset, uint256 _amount, address _token,  uint _which, uint _deadline)
        public
        onlyOwner
        {
        bytes memory data = "";
        which = _which;
        asset = _asset;
        token = _token;
        deadline = _deadline;
//        require(1!=1, 'just f');

        ILendingPool lendingPool = ILendingPool(addressesProvider.getLendingPool());
//        require(1!=1, 'just fk');
        lendingPool.flashLoan(address(this), _asset, _amount, data);
    }

    function test() public onlyOwner {
        require(1>2, 'just error1');
        require(1<2, 'just error2');
    }




}

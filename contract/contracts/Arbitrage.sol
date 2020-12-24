// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;

import './interfaces/IUniswapV2Router01.sol';
import './interfaces/IBPool.sol';
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./utils/Withdrawable.sol";

contract Arbitrage is Withdrawable {
    using SafeERC20 for IERC20;
    event StepTest(string n1, string n2, string n3, string n4);

    //    function tradeUniswap(address router, uint amountIn, address path1, address path2){
    //
    //    }
    //
    //    function tradeBalancer(address pool, uint amountIn, address addressIn, address addressOut){
    //
    //    }
    address[] path;

    modifier ensure(uint height) {
        require(height >= block.number, 'error: LATE');
//        require(deadline >= block.timestamp, 'error: EXPIRED');
        _;
    }

    function stepExecutor(string memory n, uint8 protocol, address ex, address addr1, address addr2, uint amount, uint minAmountOut, uint timestamp) internal returns (uint){
        bool ok = IERC20(addr1).approve(ex, amount);
        require(ok, append("approve error", n));

        uint balanceBefore = IERC20(addr2).balanceOf(address(this));

        if (protocol == 1) {
            delete path;
            path.push(addr1);
            path.push(addr2);
            IUniswapV2Router01(ex).swapExactTokensForTokens(amount, minAmountOut, path, address(this), timestamp);
        } else if (protocol == 2) {
            IBPool(ex).swapExactAmountIn(addr1, amount, addr2, minAmountOut, 999999999999999999999999999999999999999999999);
        } else {
            require(false, append("unknown p", n));
        }
        uint balanceAfter = IERC20(addr2).balanceOf(address(this));
        require(balanceAfter > balanceBefore, append("error ", n));

        return balanceAfter - balanceBefore;
    }

    //协议(1 uniswap, 2 balancer)、ex（uniswap传入router地址，balancer传入pool地址）、addrfrom、addrto、amount
    function a2(uint height,
        uint8 protocol1, address ex1, address addr11, address addr12, uint amount1, uint minAmountOut1,
        uint8 protocol2, address ex2, address addr21, address addr22, uint amount2, uint minAmountOut2
    ) public ensure(height) {
        //根据类型1判断交易所
        //需要approve权限
        //调用swap方法
        //根据类型2判断交易所
        //再approve
        //新增的token全部swap
        //判断余额是否变多

        uint wethBalanceBefore = IERC20(addr11).balanceOf(address(this));
        //step 1
        uint balance = stepExecutor("1", protocol1, ex1, addr11, addr12, amount1, minAmountOut1, 3333333333);
        //step 2
        stepExecutor("2", protocol2, ex2, addr21, addr22, balance, minAmountOut2, 3333333333);

        uint wethBalanceAfter = IERC20(addr11).balanceOf(address(this));

        require(wethBalanceAfter > wethBalanceBefore, string(abi.encodePacked("error finish ")));
    }

    function a3(uint height,
        uint8 protocol1, address ex1, address addr11, address addr12, uint amount1, uint minAmountOut1,
        uint8 protocol2, address ex2, address addr21, address addr22, uint amount2, uint minAmountOut2,
        uint8 protocol3, address ex3, address addr31, address addr32, uint amount3, uint minAmountOut3
    ) public ensure(height) {
        uint wethBalanceBefore = IERC20(addr11).balanceOf(address(this));
        //step 1
        uint balance = stepExecutor("1", protocol1, ex1, addr11, addr12, amount1, minAmountOut1, 3333333333);
        //step 2
        balance = stepExecutor("2", protocol2, ex2, addr21, addr22, balance, minAmountOut2, 3333333333);
        //step 3
        stepExecutor("3", protocol3, ex3, addr31, addr32, balance, minAmountOut3, 3333333333);

        uint wethBalanceAfter = IERC20(addr11).balanceOf(address(this));

        require(wethBalanceAfter > wethBalanceBefore, string(abi.encodePacked("error finish ")));
    }

    function withdrawN(address _assetAddress, uint amount) public onlyOwner {
        if (_assetAddress == ETHER) {
            msg.sender.transfer(amount);
        } else {
            IERC20(_assetAddress).safeTransfer(msg.sender, amount);
        }
        emit LogWithdraw(msg.sender, _assetAddress, amount);
    }

    function append(string memory a, string memory b) internal pure returns (string memory) {
        return string(abi.encodePacked(a, b));
    }
}

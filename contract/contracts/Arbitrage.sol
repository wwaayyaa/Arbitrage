// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
pragma experimental ABIEncoderV2;

import './interfaces/IUniswapV2Router01.sol';
import './interfaces/IBPool.sol';
//import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./utils/Withdrawable.sol";

contract Arbitrage is Withdrawable {
    using SafeERC20 for IERC20;
    event EStep(uint n);

    //协议(1 uniswap, 2 balancer)、ex（uniswap传入router地址，balancer传入pool地址）、addrfrom、addrto、amount
    struct Step {
        uint8 protocol;
        address ex;
        address addrFrom;
        address addrTo;
        uint amountIn;
        uint minAmountOut;
    }

    address[] path;

    modifier ensure(uint height, uint deadline) {
        require(height >= block.number, 'PI-ERROR: LATE');
        require(deadline >= block.timestamp, 'PI-ERROR: EXPIRED');
        _;
    }

    function stepExecutor(uint n, uint8 protocol, address ex, address addr1, address addr2, uint amount, uint minAmountOut, uint timestamp) internal returns (uint){
        IERC20(addr1).approve(ex, amount);

        uint balanceBefore = IERC20(addr2).balanceOf(address(this));

        if (protocol == 1) {
            //这三步大约10000gas
            delete path;
            //3000+gas
            path.push(addr1);
            path.push(addr2);
            //大概90000gas
            IUniswapV2Router01(ex).swapExactTokensForTokens(amount, minAmountOut, path, address(this), timestamp);
        } else if (protocol == 2) {
            //大概92000gas
            IBPool(ex).swapExactAmountIn(addr1, amount, addr2, minAmountOut, 999999999999999999999999999999999999999999999);
        } else {
            require(false, "PI-ERROR: unknown p");
        }
        uint balanceAfter = IERC20(addr2).balanceOf(address(this));
        require(balanceAfter > balanceBefore, "PI-ERROR: check");
        EStep(n);

        return balanceAfter - balanceBefore;
    }

    function aN(uint height, uint deadline, Step[] memory steps) public ensure(height, deadline) {
        uint wethBalanceBefore = IERC20(steps[0].addrFrom).balanceOf(address(this));
        require(wethBalanceBefore > steps[0].amountIn, "PI-ERROR: insufficient");

        uint balance = steps[0].amountIn;
        for (uint i = 0; i < steps.length; i++) {
            balance = stepExecutor(i, steps[i].protocol, steps[i].ex, steps[i].addrFrom, steps[i].addrTo, balance, steps[i].minAmountOut, deadline);
        }
        uint wethBalanceAfter = IERC20(steps[0].addrFrom).balanceOf(address(this));

        require(wethBalanceAfter > wethBalanceBefore, "PI-ERROR: FINISH");
    }

    //    function a2(uint height,
    //        uint8 protocol1, address ex1, address addr11, address addr12, uint amount1, uint minAmountOut1,
    //        uint8 protocol2, address ex2, address addr21, address addr22, uint amount2, uint minAmountOut2
    //    ) public ensure(height) {
    //        //根据类型1判断交易所
    //        //需要approve权限
    //        //调用swap方法
    //        //根据类型2判断交易所
    //        //再approve
    //        //新增的token全部swap
    //        //判断余额是否变多
    //
    //        uint wethBalanceBefore = IERC20(addr11).balanceOf(address(this));
    //        //step 1
    //        uint balance = stepExecutor("1", protocol1, ex1, addr11, addr12, amount1, minAmountOut1, 3333333333);
    //        //step 2
    //        stepExecutor("2", protocol2, ex2, addr21, addr22, balance, minAmountOut2, 3333333333);
    //
    //        uint wethBalanceAfter = IERC20(addr11).balanceOf(address(this));
    //
    //        require(wethBalanceAfter > wethBalanceBefore, string(abi.encodePacked("error finish ")));
    //    }
    //
    //    function a3(uint height,
    //        uint8 protocol1, address ex1, address addr11, address addr12, uint amount1, uint minAmountOut1,
    //        uint8 protocol2, address ex2, address addr21, address addr22, uint amount2, uint minAmountOut2,
    //        uint8 protocol3, address ex3, address addr31, address addr32, uint amount3, uint minAmountOut3
    //    ) public ensure(height) {
    //        uint wethBalanceBefore = IERC20(addr11).balanceOf(address(this));
    //        //step 1
    //        uint balance = stepExecutor("1", protocol1, ex1, addr11, addr12, amount1, minAmountOut1, 3333333333);
    //        //step 2
    //        balance = stepExecutor("2", protocol2, ex2, addr21, addr22, balance, minAmountOut2, 3333333333);
    //        //step 3
    //        stepExecutor("3", protocol3, ex3, addr31, addr32, balance, minAmountOut3, 3333333333);
    //
    //        uint wethBalanceAfter = IERC20(addr11).balanceOf(address(this));
    //
    //        require(wethBalanceAfter > wethBalanceBefore, string(abi.encodePacked("error finish ")));
    //    }

    function withdrawN(address _assetAddress, uint amount) public onlyOwner {
        if (_assetAddress == ETHER) {
            msg.sender.transfer(amount);
        } else {
            IERC20(_assetAddress).safeTransfer(msg.sender, amount);
        }
        emit LogWithdraw(msg.sender, _assetAddress, amount);
    }

    //    function append(string memory a, string memory b) internal pure returns (string memory) {
    //        return string(abi.encodePacked(a, b));
    //    }
    //
    //    function uint2str(uint _i) internal pure returns (string memory _uintAsString) {
    //        if (_i == 0) {
    //            return "0";
    //        }
    //        uint j = _i;
    //        uint len;
    //        while (j != 0) {
    //            len++;
    //            j /= 10;
    //        }
    //        bytes memory bstr = new bytes(len);
    //        uint k = len - 1;
    //        while (_i != 0) {
    //            bstr[k--] = byte(uint8(48 + _i % 10));
    //            _i /= 10;
    //        }
    //        return string(bstr);
    //    }
}

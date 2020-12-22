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
    event StepTest(string n1, string n2, string n3, string n4);

    function a2test(string memory arg1, string memory arg2, string memory arg3, string memory arg4, string memory arg5, string memory arg6, string memory arg7, string memory arg8) public {
        emit StepTest(arg1, arg2, arg3, arg4);
        emit StepTest(arg5, arg6, arg7, arg8);
        require(compareStrings(arg1, arg2), "heiheihei not ==");
    }

    //    function tradeUniswap(address router, uint amountIn, address path1, address path2){
    //
    //    }
    //
    //    function tradeBalancer(address pool, uint amountIn, address addressIn, address addressOut){
    //
    //    }
    address[] path;

    //协议、ex（uniswap传入router地址，balancer传入pool地址）、addrfrom、addrto、amount
    function a2(string memory protocol1, address ex1, address addr11, address addr12, uint amount1,
        string memory protocol2, address ex2, address addr21, address addr22, uint amount2) public {
        //根据类型1判断交易所
        //需要approve权限
        //调用swap方法
        //根据类型2判断交易所
        //再approve
        //新增的token全部swap
        //判断余额是否变多

        uint wethBalanceBefore = IERC20(addr11).balanceOf(address(this));
        //step 1
        uint balanceBefore = 0;
        uint balanceAfter = 0;
        if (compareStrings(protocol1, "uniswap")) {
            bool ok = IERC20(addr11).approve(ex1, amount1);
            require(ok, "approve1 error");
            delete path;
            path.push(addr11);
            path.push(addr12);
            balanceBefore = IERC20(addr12).balanceOf(address(this));
            IUniswapV2Router01(ex1).swapExactTokensForTokens(amount1, 0, path, address(this), 3333333333);
            balanceAfter = IERC20(addr12).balanceOf(address(this));
            require(balanceAfter > balanceBefore, "error 1");
        } else if (compareStrings(protocol1, "balancer")) {
            bool ok = IERC20(addr11).approve(ex1, amount1);
            require(ok, "approve1 error");
            balanceBefore = IERC20(addr12).balanceOf(address(this));
            IBPool(ex1).swapExactAmountIn(addr11, amount1, addr12, 0, 999999999999999999999999999999999999999999999);
            balanceAfter = IERC20(addr12).balanceOf(address(this));
            require(balanceAfter > balanceBefore, "error 1");
        } else {
            require(false, "unknown p1");
        }
        //step 2
        uint balance = balanceAfter - balanceBefore;
        if (compareStrings(protocol2, "uniswap")) {
            bool ok = IERC20(addr21).approve(ex2, balance);
            require(ok, "approve1 error");
            delete path;
            path.push(addr21);
            path.push(addr22);
            balanceBefore = IERC20(addr22).balanceOf(address(this));
            IUniswapV2Router01(ex2).swapExactTokensForTokens(balance, 0, path, address(this), 3333333333);
            balanceAfter = IERC20(addr22).balanceOf(address(this));
            require(balanceAfter > balanceBefore, string(abi.encodePacked("error 2 ", uint2str(balanceAfter), " ", uint2str(balanceBefore))));
        } else if (compareStrings(protocol2, "balancer")) {
            bool ok = IERC20(addr21).approve(ex2, balance);
            require(ok, "approve1 error");
            balanceBefore = IERC20(addr22).balanceOf(address(this));
            IBPool(ex2).swapExactAmountIn(addr21, balance, addr22, 0, 999999999999999999999999999999999999999999999);
            balanceAfter = IERC20(addr22).balanceOf(address(this));
            require(balanceAfter > balanceBefore, string(abi.encodePacked("error 2 ", uint2str(balanceAfter), " ", uint2str(balanceBefore))));
        } else {
            require(false, "unknown p2");
        }
        uint wethBalanceAfter = IERC20(addr11).balanceOf(address(this));
        require(wethBalanceAfter > wethBalanceBefore, string(abi.encodePacked("error 3 ", uint2str(wethBalanceAfter), " ", uint2str(wethBalanceBefore))));
    }

    function compareStrings(string memory a, string memory b) public view returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function uint2str(uint _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint j = _i;
        uint len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint k = len - 1;
        while (_i != 0) {
            bstr[k--] = byte(uint8(48 + _i % 10));
            _i /= 10;
        }
        return string(bstr);
    }

    function withdrawN(address _assetAddress, uint amount) public onlyOwner {
        if (_assetAddress == ETHER) {
            msg.sender.transfer(amount);
        } else {
            ERC20(_assetAddress).safeTransfer(msg.sender, amount);
        }
        emit LogWithdraw(msg.sender, _assetAddress, amount);
    }

}

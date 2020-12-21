const path = require('path');
const db = require('./db').DB;

class init{
    constructor() {
        process.on('unhandledRejection', (reason, promise) => {
            console.log('未处理的拒绝：', promise, '原因：', reason);
            // 记录日志、抛出错误、或其他逻辑。
        });
        require('dotenv').config();
    }
    initDB(){
        return new db(process.env.DB_HOST, process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASS, {});
    }
}
exports.init = function(){
    return new init();
};

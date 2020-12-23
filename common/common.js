const axios = require('axios');
exports.sleep = function (ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};
exports.Ding = class {
    constructor(key) {
        this.key = key
    }

    DingTPL = {
        "msgtype": "markdown",
        "markdown": {
            "title": "",
            "text": "",
        },
    }

    ding = async function (title, text) {
        await this.dingding(this.key, title, text);
    }

    dingding = async function (key, title, text) {
        let msg = this.DingTPL;
        msg.markdown.title = title;
        msg.markdown.text = text || title;
        try {
            await axios.post('https://oapi.dingtalk.com/robot/send?access_token=' + key, msg);
            return [null, true]
        } catch (e) {
            return [e, false]
        }
    };
};

/**
 * rss（resident set size）：RAM 中保存的进程占用的内存部分，包括代码本身、栈、堆。
 * heapTotal：堆中总共申请到的内存量。
 * heapUsed：堆中目前用到的内存量，判断内存泄漏我们主要以这个字段为准。
 * external： V8 引擎内部的 C++ 对象占用的内存。
 */
exports.memoryInfo = function () {
    const format = function (bytes) {
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };
    const memoryUsage = process.memoryUsage();

    console.log(JSON.stringify({
        rss: format(memoryUsage.rss),
        heapTotal: format(memoryUsage.heapTotal),
        heapUsed: format(memoryUsage.heapUsed),
        external: format(memoryUsage.external),
    }));
};

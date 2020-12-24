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
let format2MB = function (bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
};
exports.memoryInfo = function () {

    const memoryUsage = process.memoryUsage();

    console.log(JSON.stringify({
        rss: format2MB(memoryUsage.rss),
        heapTotal: format2MB(memoryUsage.heapTotal),
        heapUsed: format2MB(memoryUsage.heapUsed),
        external: format2MB(memoryUsage.external),
        datetime: new Date().toJSON()
    }));
};

exports.memoryInfoForever = async function (ms) {
    while (true) {
        this.memoryInfo();
        await this.sleep(ms);
    }
};

exports.sortTokensAsc = function (tokens) {
    let cnt = tokens.length;
    for (let i = 0; i < cnt - 1; i++) {
        for (let j = i + 1; j < cnt; j++) {
            if (tokens[i] > tokens[j]) {
                [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
            }
        }
    }
    return tokens;
};
exports.sortTokensDesc = function (tokens) {
    let cnt = tokens.length;
    for (let i = 0; i < cnt - 1; i++) {
        for (let j = i + 1; j < cnt; j++) {
            if (tokens[i] < tokens[j]) {
                [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
            }
        }
    }
    return tokens;
};
exports.tokens2String = function (tokens) {
    return tokens.join('/');
};
exports.string2Tokens = function (str) {
    return str.split('/');
};
exports.hasToken = function (token, tokens) {
    for (let t of tokens) {
        if (token == t) {
            return true;
        }
    }
    return false;
};
exports.shuffle = function (array) {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

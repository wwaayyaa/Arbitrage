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
}

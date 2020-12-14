const axios = require('axios');
exports.sleep = function(ms){
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};
exports.DingTPL = {
    "msgtype": "markdown",
    "markdown": {
        "title": "",
        "text": "",
    },
};
exports.ding = async function ding(key, title, text) {
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

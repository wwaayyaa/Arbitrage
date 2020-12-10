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
    let msg = DingTPL;
    msg.markdown.title = title;
    msg.markdown.text = text || title;
    try {
        let response = await axios.post('https://oapi.dingtalk.com/robot/send?access_token=' + key, msg);
    } catch (e) {
        console.error(`ding error: ${e.message} ${msg}`);
    }
};

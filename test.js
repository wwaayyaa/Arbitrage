/**
 * 测试gc
 * node --expose-gc test.js
 */
function info() {
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
}
let gJobs = [];
(async ()=>{
    console.log(1);
    info()

    for(let i = 0;i< 10;i++){
        let job = {
            uuid: '123',
            step: [{a:1,b:2},{a:11,b:22}],
            status: 0,
            arr: new Array(10*1024*1024)
        };
        gJobs.push(job);
        console.log('---')
        info()
    }
    global.gc();
    for(let i = 0;i< 10;i++){
        gJobs.shift()
        info()
    }
    global.gc();

    console.log('-end--')
    info()

})()




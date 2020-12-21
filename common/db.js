const {Sequelize} = require('sequelize');
const dayjs = require('dayjs');

//暂时将db类和models层放一起
class DB {
    constructor(host, database, user, pass, options) {
        this.host = host;
        this.data = database;
        this.user = user;
        this.pass = pass;
        this.options = options;
        this.sql = this.newDB(host, database, user, pass, options);
    }

    newDB(host, data, user, pass, options){
        return new Sequelize(data, user, pass, {
            host: host,
            dialect: 'mysql',
            logging: options.logging || false,
        });
    }

    /*相关数据操作*/

    async getQuotes() {
        return await this.sql.query("SELECT * FROM `quote` where enabled = 1 ;", {type: 'SELECT'});
    }
    async getTokens() {
        return await this.sql.query("SELECT * FROM `token` ;", {type: 'SELECT'});
    }
    async getTokensKeyByToken() {
        let tokens = await this.getTokens();
        let ret = {};
        tokens.forEach(i => {
            ret[i.name] = i;
        });
        return ret;
    }
    async getTokensKeyByAddress() {
        let tokens = await this.getTokens();
        let ret = {};
        tokens.forEach(i => {
            ret[i.address.toLowerCase()] = i;
        });
        return ret;
    }


    async updateToken(address, name, decimal) {
        try {
            await this.sql.query("insert into token (name, `decimal`, address) " +
                "values (?, ?, ?) " +
                "on duplicate key update " +
                "`decimal` = values(`decimal`) ",
                {
                    replacements: [name, decimal - 0, address],
                    type: 'INSERT'
                })
        } catch (e) {
            return [e, false];
        }
        return [null, true];
    }

    async updateQuote(exchange, name, protocol, address, fee, args) {
        try {
            await this.sql.query("insert into quote (exchange, name, protocol, enabled, contract_address, fee, args, created_at) " +
                "values (?, ?, ?, ?, ?, ?, ?, ?) " +
                "on duplicate key update " +
                "`fee` = values(`fee`), args = values(args) ",
                {
                    replacements: [exchange, name, protocol, 1, address, fee, args || "", new dayjs().format("YYYY-MM-DD HH:mm:ss")],
                    type: 'INSERT'
                })
        } catch (e) {
            return [e, false];
        }
        return [null, true];
    }


    async newArbitrageJob(uuid, type, height, step, quote, rate, status, principal, txFee, profit) {
        let now = new dayjs();
        try {
            await this.sql.query("insert into arbitrage_job (uuid, type, height, step, quote, rate, status, principal, tx_fee, profit, created_at, updated_at) " +
                "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ",
                {
                    replacements: [uuid, type, height, step, quote, rate, status, principal, txFee, profit, now.format("YYYY-MM-DD HH:mm:ss"), now.format("YYYY-MM-DD HH:mm:ss")],
                    type: 'INSERT'
                })
        } catch (e) {
            return [e, false];
        }
        return [null, true];
    }

    async updateArbitrageJob(uuid, status, txFee, profit, txHash) {
        let now = new dayjs();
        try {
            await this.sql.query("update arbitrage_job set status = ?, tx_fee = ?, profit = ?, tx_hash = ?, updated_at = ?" +
                " where uuid = ?",
                {
                    replacements: [status, txFee, profit, txHash, now.format("YYYY-MM-DD HH:mm:ss"), uuid],
                    type: 'UPDATE'
                })
        } catch (e) {
            return [e, false];
        }
        return [null, true];
    }

    async updatePriceNow(protocol, exchange, quoteA, quoteB, price, height) {
        let now = new dayjs();
        try {
            await this.sql.query("insert into price_now (protocol, exchange, quote_a, quote_b, price, updated_height, updated_at) " +
                "values (?, ?, ?, ?, ?, ?, ?) " +
                "on duplicate key update " +
                "price = values(price),updated_height = values(updated_height),updated_at = values(updated_at) ",
                {
                    replacements: [protocol, exchange, quoteA, quoteB, price, height || 0, now.format("YYYY-MM-DD HH:mm:ss")],
                    type: 'INSERT'
                })
        } catch (e) {
            return [e, false];
        }
        return [null, true];
    }

    async updatePriceNowBatch(priceList) {
        let now = new dayjs();
        now = now.format("YYYY-MM-DD HH:mm:ss");
        let args = [];
        let values = [];
        for (let i = 0; i < priceList.length; i++) {
            let p = priceList[i];
            args.push(p.protocol, p.exchange, p.quoteA, p.quoteB, p.price, p.height, now);
            values.push('(?, ?, ?, ?, ?, ?, ?)');
        }
        values = values.join(',');
        try {
            await this.sql.query("insert into price_now (protocol, exchange, quote_a, quote_b, price, updated_height, updated_at) " +
                `values ${values} ` +
                "on duplicate key update " +
                "price = values(price),updated_height = values(updated_height),updated_at = values(updated_at) ",
                {
                    replacements: args,
                    type: 'INSERT'
                })
        } catch (e) {
            return [e, false];
        }
        return [null, true];
    }

    async updatePriceHistory(protocol, exchange, minute, quoteA, quoteB, price, height) {
        let now = new dayjs();
        try {
            await this.sql.query("insert into price_history (protocol, exchange, minute, quote_a, quote_b, price, updated_height, updated_at) " +
                "values (?, ?, ?, ?, ?, ?, ?, ?) " +
                "on duplicate key update " +
                "price = values(price),updated_height = values(updated_height),updated_at = values(updated_at) ",
                {
                    replacements: [protocol, exchange, minute, quoteA, quoteB, price, height || 0, now.format("YYYY-MM-DD HH:mm:ss")],
                    type: 'INSERT'
                })
        } catch (e) {
            return [e, false];
        }
        return [null, true];
    }

    async updatePriceHistoryBatch(priceList) {
        let now = new dayjs();
        now = now.format("YYYY-MM-DD HH:mm:ss");
        let args = [];
        let values = [];
        for (let i = 0; i < priceList.length; i++) {
            let p = priceList[i];
            args.push(p.protocol, p.exchange, p.minute, p.quoteA, p.quoteB, p.price, p.height, now);
            values.push('(?, ?, ?, ?, ?, ?, ?, ?)');
        }
        values = values.join(',');
        try {
            await this.sql.query("insert into price_history (protocol, exchange, minute, quote_a, quote_b, price, updated_height, updated_at) " +
                `values ${values} ` +
                "on duplicate key update " +
                "price = values(price), updated_height = values(updated_height), updated_at = values(updated_at) ",
                {
                    replacements: args,
                    type: 'INSERT'
                })
        } catch (e) {
            return [e, false];
        }
        return [null, true];
    }
}

exports.DB = DB;

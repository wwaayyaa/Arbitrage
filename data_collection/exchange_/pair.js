function Pair(name, address, abi){
    this.name = name;
    this.address = address;
    this.abi = abi;
}
Pair.prototype.name = function(){
    return this.name;
};

Pair.prototype.address = function(){
    return this.address;
};

Pair.prototype.abi = function(){
    return this.abi;
};

module.exports = Pair;

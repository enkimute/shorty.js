/**
 * shorty.js - String compression for streams of short JSON strings.
 * @author Enki
 * @desc Implements an adaptive huffman compressor that allows you to efficiently compress streams of JSON or text messages without having to buffer.
 */
(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof define == 'function' && define.amd) define(name, definition);
  else context[name] = definition();
}('Shorty', this, function () {
 
  function Shorty(tokensize) {
    this.tokensize = tokensize||10;
    this.reset(true); 
  };

  Shorty.prototype.reset = function(full) {
    if (full===true) {
      this.nodes     = [{up:0,weight:0}];
      this.nyt       = 0;
      this.nodecount = 0;
    }
    this.data      = '';
    this.curpos    = 0;
    this.bitCount  = 7;
    this.bitChar   = 0;
  }

  Shorty.prototype.findNode = function(x) {
    for (var i=this.nodes.length-1; i>0; i--) if (typeof this.nodes[i].symbol != "undefined" && this.nodes[i].symbol == x) return i;
    return 0;
  }

  Shorty.prototype.addNode = function(token) {
    if (this.nodecount >= 2046) return 0;
    this.nodes[++this.nodecount] = { up : this.nyt, symbol : token, weight : 1};
    this.nodes[++this.nodecount] = { up : this.nyt, weight : 0 };
    this.nodes[this.nyt].weight+=1;
    this.nyt = this.nodecount;
    if (this.nodes[this.nodecount-2].up != this.nodecount-2) this.balanceNode ( this.nodes[this.nodecount-2].up );
    return this.nodecount-2;
  }

  Shorty.prototype.swapNode = function(a,b) {
    var t = this.nodes[a].symbol;
    var u = this.nodes[b].symbol;
    var v = this.nodes[a].weight;
    this.nodes[a].symbol = u;
    this.nodes[b].symbol = t;
    this.nodes[a].weight = this.nodes[b].weight;
    this.nodes[b].weight = v;
    for (var n=this.nodes.length-1; n>0; n--) if (this.nodes[n].up==a) this.nodes[n].up = b; else if (this.nodes[n].up==b) this.nodes[n].up=a;
  }

  Shorty.prototype.balanceNode = function(node) {
    while (true) {
      var minnr = node;
      var weight = this.nodes[node].weight;
      while ( minnr > 1 && this.nodes[minnr-1].weight == weight ) minnr--;
      if (minnr != node && minnr != this.nodes[node].up) {
        this.swapNode(minnr, node);
        node = minnr;
      }
      this.nodes[node].weight++;
      if (this.nodes[node].up == node) return;
      node = this.nodes[node].up;
    }
  }

  Shorty.prototype.emitNode = function ( node ) {
    var emit = [];
    while (node != 0) {
      emit.unshift(node%2);
      node = this.nodes[node].up;
    }
    for (var e=0; e<emit.length; e++) this.emitBit(emit[e]);
  }

  Shorty.prototype.emitNyt = function ( token ) {
    this.emitNode(this.nyt);
    var ll = token.length - 1;
    if (this.tokensize > 8) this.emitBit(ll&8);
    if (this.tokensize > 4) this.emitBit(ll&4);
    if (this.tokensize > 2) this.emitBit(ll&2);
    if (this.tokensize > 1) this.emitBit(ll&1);
    for (var cc=0; cc<token.length; cc++)
      this.emitByte( token.charCodeAt(cc) );
    return this.nyt;
  }

  Shorty.prototype.readNode = function () {
    if (this.nyt==0) {
      var len = ((this.tokensize > 8)?this.readBit()*8:0) + ((this.tokensize>4)?this.readBit()*4:0) + ((this.tokensize>2)?this.readBit()*2:0) + ((this.tokensize>1)?this.readBit():0) + 1;
      var stream = '';
      while (len--) stream += this.readByte();
      return stream;
    }
    var node=0;
    while (true) {
      var bit = this.readBit();
      if (this.nodes[node].symbol == undefined) for (var m=0;;m++) if (this.nodes[m].up == node && m!=node && ((m%2)==bit)) { node = m; break; };
      if (this.nodes[node].symbol != undefined || this.nodes[node].weight==0) {
        if (this.nodes[node].weight) return this.nodes[node].symbol;
        var len = ((this.tokensize > 8)?this.readBit()*8:0) + ((this.tokensize>4)?this.readBit()*4:0) + ((this.tokensize>2)?this.readBit()*2:0) + ((this.tokensize>1)?this.readBit():0)+1;
        var stream = '';
        while (len--) stream += this.readByte();
        return stream;
      }
    }
  }

  Shorty.prototype.emitBit = function(bit) {
    if (bit) this.bitChar += 1<<this.bitCount;
    if (--this.bitCount < 0) {
      this.data += String.fromCharCode(this.bitChar);
      this.bitCount = 7;
      this.bitChar  = 0;
    }
  };

  Shorty.prototype.emitByte = function(byte) {
    for (var i=7; i>=0; i--) { this.emitBit( byte>>i&1 ); }
  };

  Shorty.prototype.readBit = function() {
    if (this.curpos == this.data.length*8) throw ('done');
    var bit = this.data.charCodeAt(this.curpos >> 3) >> (7-this.curpos&7) & 1;
    this.curpos++;
    return bit;
  };

  Shorty.prototype.readByte = function() {
    var res = 0;
    for (var i=0; i<8; i++) res += (128>>i)*this.readBit();
    return String.fromCharCode(res);
  };

  Shorty.prototype.deflate = function(data) {
    var token, l=data.length, i, x;
    this.reset();
    for (i=0; i<l; i++) {
      token = data[i];
      if (this.tokensize > 1) {
        if (/[a-zA-Z]/.test(token))
        while ((i+1)<l && token.length<this.tokensize && /[a-zA-Z]/.test(data[i+1])) { token += data[++i]; }
        else if (/[=\[\],\.:\"'\{\}]/.test(token)) while ((i+1)<l && token.length<this.tokensize && /[=\[\],\.:\"'\{\}]/.test(data[i+1])){ i++; token += data[i] }; //joe hl patch "
      };
      x = this.findNode( token );
      if (!x) {
        this.emitNyt( token );
        x = this.addNode( token );
      } else {
        this.emitNode( x );
        this.balanceNode( x );
      }
    }
    if (this.bitCount != 7) {
      var oldlength = this.data.length;
      this.emitNode( this.nyt );
      if (oldlength == this.data.length) this.emitByte(0);
    }
    return this.data;
  };

  Shorty.prototype.inflate = function(data) {
    this.reset();
    this.data = data;
    var output = '';
    try {
      for (var i=0; i>=0; i++) {
        var token = this.readNode( );
        output += token;
        var node = this.findNode( token );
        if (!node) this.addNode( token );
              else this.balanceNode( node );
      }
    } catch (e) { };
    return output;
  }; 

  return Shorty;
}));

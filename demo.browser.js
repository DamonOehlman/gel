;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Gel = require('./gel'),
	gel = new Gel(),
	crel = require('crel'),
    input,
    context,
    output,
    ui = crel('div',
        crel('h1', 'Gel tester (shift+enter to run)'),
        crel('div', {'class':'halfWidth'},
            crel('h2', 'Input (Gel)'),
            input = crel('textarea')
        ),
        crel('div', {'class':'halfWidth'},
            crel('h2', 'Context (JSON)'),
            context = crel('textarea')
        ),
        crel('h2', 'Output'),
        output = crel('pre')
    );

function run(event){
    if(event.which === 13 && event.shiftKey){
        try{
            output.innerText = gel.evaluate(input.value, JSON.parse(context.value || '{}'));
        }catch(error){
            output.innerText = error;
        }
        event.preventDefault();
    }
}

input.addEventListener('keypress', run);
context.addEventListener('keypress', run);

window.onload = function () {
    document.body.appendChild(ui);
};
},{"./gel":2,"crel":3}],2:[function(require,module,exports){
(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory(require('lang-js'));
    } else if (typeof define === 'function' && define.amd) {
        define(['lang'], factory);
    } else {
        root.Gel = factory(root.Lang);
  }
}(this, function (Lang) {

    var createNestingParser = Lang.createNestingParser,
        detectString = Lang.detectString,
        Token = Lang.Token,
        Scope = Lang.Scope,
        createSpec = require('spec-js');

    function fastEach(items, callback) {
        for (var i = 0; i < items.length; i++) {
            if (callback(items[i], i, items)) break;
        }
        return items;
    }
    
    function stringFormat(string, values){    
        return string.replace(/{(\d+)}/g, function(match, number) { 
            return values[number] != null
              ? values[number]
              : ''
            ;
        });
    }

    function isIdentifier(substring){
        var valid = /^[$A-Z_][0-9A-Z_$]*/i,
            possibleIdentifier = substring.match(valid);

        if (possibleIdentifier && possibleIdentifier.index === 0) {
            return possibleIdentifier[0];
        }
    }

    function tokeniseIdentifier(substring){
        // searches for valid identifiers or operators
        //operators
        var operators = "!=<>/&|*%-^?+\\",
            index = 0;
            
        while (operators.indexOf(substring.charAt(index)||null) >= 0 && ++index) {}

        if (index > 0) {
            return substring.slice(0, index);
        }

        var identifier = isIdentifier(substring);

        if(identifier != null){
            return identifier;                        
        }
    }

    function createKeywordTokeniser(Constructor, keyword){
        return function(substring){
            substring = isIdentifier(substring);
            if (substring === keyword) {
                return new Constructor(substring, substring.length);
            }
        };
    }

    function StringToken(){}
    StringToken = createSpec(StringToken, Token);
    StringToken.prototype.precedence = 2;
    StringToken.prototype.stringTerminal = '"';
    StringToken.prototype.name = 'double quoted string';
    StringToken.tokenise = function (substring) {
        if (substring.charAt(0) === this.prototype.stringTerminal) {
            var index = 0,
            escapes = 0;
                   
            while (substring.charAt(++index) !== this.prototype.stringTerminal)
            {
               if(index >= substring.length){
                       throw "Unclosed " + this.name;
               }
               if (substring.charAt(index) === '\\' && substring.charAt(index+1) === this.prototype.stringTerminal) {
                       substring = substring.slice(0, index) + substring.slice(index + 1);
                       escapes++;
               }
            }

            return new this(
                substring.slice(0, index+1),
                index + escapes + 1
            );
        }
    }
    StringToken.prototype.evaluate = function () {
        this.result = this.original.slice(1,-1);
    }

    function String2Token(){}
    String2Token = createSpec(String2Token, StringToken);
    String2Token.prototype.stringTerminal = "'";
    String2Token.prototype.name = 'single quoted string';
    String2Token.tokenise = StringToken.tokenise;

    function ParenthesesToken(){
    }
    ParenthesesToken = createSpec(ParenthesesToken, Token);
    ParenthesesToken.prototype.name = 'parentheses';
    ParenthesesToken.tokenise = function(substring) {
        if(substring.charAt(0) === '(' || substring.charAt(0) === ')'){
            return new ParenthesesToken(substring.charAt(0), 1);
        }
    }
    ParenthesesToken.prototype.parse = createNestingParser(/^\($/,/^\)$/);
    ParenthesesToken.prototype.evaluate = function(scope){
        scope = new Scope(scope);
            
        var functionToken = this.childTokens[0];

        if(!functionToken){
            throw "Invalid function call. No function was provided to execute.";
        }
        
        functionToken.evaluate(scope);

        if(typeof functionToken.result !== 'function'){
            throw functionToken.original + " (" + functionToken.result + ")" + " is not a function";
        }
            
        this.result = scope.callWith(functionToken.result, this.childTokens.slice(1), this);
    };

    function NumberToken(){}
    NumberToken = createSpec(NumberToken, Token);
    NumberToken.prototype.name = 'number';
    NumberToken.tokenise = function(substring) {
        var specials = {
            "NaN": Number.NaN,
            "-NaN": Number.NaN,
            "Infinity": Infinity,
            "-Infinity": -Infinity
        };
        for (var key in specials) {
            if (substring.slice(0, key.length) === key) {
                return new NumberToken(key, key.length);
            }
        }

        var valids = "0123456789-.Eex",
            index = 0;
            
        while (valids.indexOf(substring.charAt(index)||null) >= 0 && ++index) {}

        if (index > 0) {
            var result = substring.slice(0, index);
            if(isNaN(parseFloat(result))){
                return;
            }
            return new NumberToken(result, index);
        }

        return;
    };
    NumberToken.prototype.evaluate = function(scope){        
        this.result = parseFloat(this.original);
    };

    function NullToken(){}
    NullToken = createSpec(NullToken, Token);
    NullToken.prototype.name = 'semicolon';
    NullToken.prototype.precedence = 2;
    NullToken.tokenise = createKeywordTokeniser(NullToken, "null");
    NullToken.prototype.evaluate = function(scope){
        this.result = null;
    };

    function UndefinedToken(){}
    UndefinedToken = createSpec(UndefinedToken, Token);
    UndefinedToken.prototype.name = 'undefined';
    UndefinedToken.prototype.precedence = 2;
    UndefinedToken.tokenise = createKeywordTokeniser(UndefinedToken, 'undefined');
    UndefinedToken.prototype.evaluate = function(scope){
        this.result = undefined;
    };

    function TrueToken(){}
    TrueToken = createSpec(TrueToken, Token);
    TrueToken.prototype.name = 'true';
    TrueToken.prototype.precedence = 2;
    TrueToken.tokenise = createKeywordTokeniser(TrueToken, 'true');
    TrueToken.prototype.evaluate = function(scope){
        this.result = true;
    };

    function FalseToken(){}
    FalseToken = createSpec(FalseToken, Token);
    FalseToken.prototype.name = 'false';
    FalseToken.prototype.precedence = 2;
    FalseToken.tokenise = createKeywordTokeniser(FalseToken, 'false');
    FalseToken.prototype.evaluate = function(scope){
        this.result = false;
    };

    function DelimiterToken(){}
    DelimiterToken = createSpec(DelimiterToken, Token);
    DelimiterToken.prototype.name = 'delimiter';
    DelimiterToken.prototype.precedence = 2;
    DelimiterToken.tokenise = function(substring) {
        var i = 0;
        while(i < substring.length && substring.charAt(i).trim() === "" || substring.charAt(i) === ',') {
            i++;
        }

        if(i){
            return new DelimiterToken(substring.slice(0, i), i);
        }
    };
    DelimiterToken.prototype.parse = function(tokens, position){
        tokens.splice(position, 1);
    };

    function IdentifierToken(){}
    IdentifierToken = createSpec(IdentifierToken, Token);
    IdentifierToken.prototype.name = 'identifier';
    IdentifierToken.prototype.precedence = 3;
    IdentifierToken.tokenise = function(substring){
        var result = tokeniseIdentifier(substring);

        if(result != null){
            return new IdentifierToken(result, result.length);
        }
    };
    IdentifierToken.prototype.evaluate = function(scope){
        this.result = scope.get(this.original);
    };

    function PeriodToken(){}
    PeriodToken = createSpec(PeriodToken, Token);
    PeriodToken.prototype.name = 'period';
    PeriodToken.prototype.precedence = 1;
    PeriodToken.tokenise = function(substring){
        var periodConst = ".";
        return (substring.charAt(0) === periodConst) ? new PeriodToken(periodConst, 1) : undefined;
    };
    PeriodToken.prototype.parse = function(tokens, position){
        this.targetToken = tokens.splice(position-1,1)[0];
        this.identifierToken = tokens.splice(position,1)[0];
    };
    PeriodToken.prototype.evaluate = function(scope){
        this.targetToken.evaluate(scope);
        if(
            this.targetToken.result &&
            (typeof this.targetToken.result === 'object' || typeof this.targetToken.result === 'function')
            && this.targetToken.result.hasOwnProperty(this.identifierToken.original)
        ){
            this.result = this.targetToken.result[this.identifierToken.original];
        }else{
            this.result = undefined;
        }
    };

    function FunctionToken(){}
    FunctionToken = createSpec(FunctionToken, Token);
    FunctionToken.prototype.name = 'function';
    FunctionToken.tokenise = function convertFunctionToken(substring) {
        if(substring.charAt(0) === '{' || substring.charAt(0) === '}'){
            return new FunctionToken(substring.charAt(0), 1);
        }
    };
    FunctionToken.prototype.parse = createNestingParser(/^\{$/,/^\}$/);
    FunctionToken.prototype.evaluate = function(scope){
        var parameterNames = this.childTokens.slice(),
            fnBody = parameterNames.pop();
                                
        this.result = function(scope, args){
            scope = new Scope(scope);
                
            for(var i = 0; i < parameterNames.length; i++){
                scope.set(parameterNames[i].original, args.get(i));
            }
            
            fnBody.evaluate(scope);
            
            return fnBody.result;
        }
    };

    var tokenConverters = [
            StringToken,
            String2Token,
            ParenthesesToken,
            NumberToken,
            NullToken,
            UndefinedToken,
            TrueToken,
            FalseToken,
            DelimiterToken,
            IdentifierToken,
            PeriodToken,
            FunctionToken
        ],
        scope = {
            "toString":function(scope, args){
                return "" + args.next();
            },
            "+":function(scope, args){
                return args.next() + args.next();
            },
            "-":function(scope, args){
                return args.next() - args.next();
            },
            "/":function(scope, args){
                return args.next() / args.next();
            },
            "*":function(scope, args){
                return args.next() * args.next();
            },
            "isNaN":function(scope, args){
                return isNaN(args.get(0));
            },
            "max":function(scope, args){
                var result = args.next();
                while(args.hasNext()){
                    result = Math.max(result, args.next());
                }
                return result;
            },
            "min":function(scope, args){
                var result = args.next();
                while(args.hasNext()){
                    result = Math.min(result, args.next());
                }
                return result;
            },
            ">":function(scope, args){
                return args.next() > args.next();
            },
            "<":function(scope, args){
                return args.next() < args.next();
            },
            ">=":function(scope, args){
                return args.next() >= args.next();
            },
            "<=":function(scope, args){
                return args.next() <= args.next();
            },
            "?":function(scope, args){
                return args.next() ? args.next() : args.get(2);
            },
            "!":function(scope, args){
                return !args.next();
            },
            "=":function(scope, args){
                return args.next() == args.next();
            },
            "==":function(scope, args){
                return args.next() === args.next();
            },
            "!=":function(scope, args){
                return args.next() != args.next();
            },
            "!==":function(scope, args){
                return args.next() !== args.next();
            },
            "||":function(scope, args){
                var nextArg;
                while(args.hasNext()){
                    nextArg = args.next();
                    if(nextArg){
                        return nextArg;
                    }
                }
                return nextArg;
            },
            "|":function(scope, args){
                var nextArg;
                while(args.hasNext()){
                    nextArg = args.next();
                    if(nextArg === true ){
                        return nextArg;
                    }
                }
                return nextArg;
            },
            "&&":function(scope, args){
                var nextArg;
                while(args.hasNext()){
                    nextArg = args.next();
                    if(!nextArg){
                        return false;
                    }
                }
                return nextArg;
            },
            "object":function(scope, args){
                var result = {};
                while(args.hasNext()){
                    result[args.next()] = args.next();
                }
                return result;
            },
            "keys":function(scope, args){
                var object = args.next();
                return typeof object === 'object' ? Object.keys(object) : undefined;
            },
            "values":function(scope, args){
                var target = args.next(),
                    result = [];
                for(var key in target){
                    result.push(target[key]);
                }
                return result;
            },
            "invert":function(scope, args){
                var target = args.next(),
                    result = {};
                for(var key in target){
                    result[target[key]] = key;
                }
                return result;
            },
            "extend":function(scope, args){
                var result = {};
                while(args.hasNext()){
                    var nextObject = args.next();
                    for(var key in nextObject){
                        result[key] = nextObject[key];
                    }
                }
                return result;
            },
            "array":function(scope, args){
                var result = [];
                while(args.hasNext()){
                    result.push(args.next());
                }
                return result;
            },
            "map":function(scope, args){
                var source = args.next(),
                    isArray = Array.isArray(source),
                    result = isArray ? [] : {},
                    functionToken = args.next();

                if(isArray){
                    fastEach(source, function(item, index){
                        result[index] = scope.callWith(functionToken, [item]);
                    });
                }else{
                    for(var key in source){
                        result[key] = scope.callWith(functionToken, [source[key]]);
                    };
                }  
                
                return result;
            },
            "pairs": function(scope, args){
                var target = args.next(),
                    result = [];

                for(var key in target){
                    if(target.hasOwnProperty(key)){
                        result.push([key, target[key]]);
                    }
                }

                return result;
            },
            "flatten":function(scope, args){
                var target = args.next(),
                    shallow = args.hasNext() && args.next();

                function flatten(target){
                    var result = [],
                        source;

                    for(var i = 0; i < target.length; i++){
                        source = target[i];

                        for(var j = 0; j < source.length; j++){
                            if(!shallow && Array.isArray(source[j])){
                                result.push(flatten(source));
                            }else{
                                result.push(target[i][j]);
                            }
                        }
                    }
                    return result;
                }
                return flatten(target);
            },
            "sort": function(scope, args) {
                var args = args.all(),
                    result;
                
                var array = args[0];
                var functionToCompare = args[1];
                
                if (Array.isArray(array)) {
                
                    result = array.sort(function(a,b){
                        return scope.callWith(functionToCompare, [a,b]);
                    });

                    return result;
                
                }else {
                    return;
                }
            },
            "filter": function(scope, args) {
                var args = args.all(),
                    filteredList = [];
                    
                if (args.length < 2) {
                    return args;
                }
                


                var array = args[0],
                    functionToCompare = args[1];
                
                if (Array.isArray(array)) {
                    
                    fastEach(array, function(item, index){
                        if(typeof functionToCompare === "function"){
                            if(scope.callWith(functionToCompare, [item])){ 
                                filteredList.push(item);
                            }
                        }else{
                            if(item === functionToCompare){ 
                                filteredList.push(item);
                            }
                        }
                    });
                    return filteredList;                
                }
            },
            "findOne": function(scope, args) {
                var args = args.all(),
                    result;
                    
                if (args.length < 2) {
                    return args;
                }
                


                var array = args[0],
                    functionToCompare = args[1];
                
                if (Array.isArray(array)) {
                    
                    fastEach(array, function(item, index){
                        if(scope.callWith(functionToCompare, [item])){ 
                            result = item;
                            return true;
                        }
                    });
                    return result;              
                }
            },
            "concat":function(scope, args){
                var result = args.next();
                while(args.hasNext()){
                    if(result == null || !result.concat){
                        return undefined;
                    }
                    var next = args.next();
                    Array.isArray(next) && (result = result.concat(next));
                }
                return result;
            },
            "join":function(scope, args){
                args = args.all();

                return args.slice(1).join(args[0]);
            },
            "slice":function(scope, args){
                var target = args.next(),
                    start,
                    end;

                if(args.hasNext()){
                    start = target;
                    target = args.next();
                }
                if(args.hasNext()){
                    end = target;
                    target = args.next();
                }
                
                return target.slice(start, end);
            },
            "split":function(scope, args){
                return args.next().split(args.hasNext() && args.next());
            },
            "last":function(scope, args){
                var array = args.next();

                if(!Array.isArray(array)){
                    return;
                }
                return array.slice(-1).pop();
            },
            "first":function(scope, args){
                var array = args.next();

                if(!Array.isArray(array)){
                    return;
                }
                return array[0];
            },
            "length":function(scope, args){
                return args.next().length;
            },
            "getValue":function(scope, args){
                var target = args.next(),
                    key = args.next();

                if(!target || typeof target !== 'object'){
                    return;
                }

                return target[key];
            },
            "compare":function(scope, args){
                var args = args.all(),
                    comparitor = args.pop(),
                    reference = args.pop(),
                    result = true,
                    objectToCompare;
                                    
                while(args.length){
                    objectToCompare = args.pop();
                    for(var key in objectToCompare){
                        if(!scope.callWith(comparitor, [objectToCompare[key], reference[key]])){
                            result = false;
                        }
                    }
                }
                
                return result;
            },
            "contains": function(scope, args){
                var args = args.all(),
                    target = args.shift(),
                    success = false,
                    strict = false,
                    arg;
                    
                if(target == null){
                    return;
                }
                    
                if(typeof target === 'boolean'){
                    strict = target;
                    target = args.shift();
                }
                    
                arg = args.pop();

                if(target == null || !target.indexOf){
                    return;
                }
                                     
                if(typeof arg === "string" && !strict){
                    arg = arg.toLowerCase();

                    if(Array.isArray(target)){
                        fastEach(target, function(targetItem){
                            if(typeof targetItem === 'string' && targetItem.toLowerCase() === arg.toLowerCase()){
                                return success = true;
                            }
                        });
                    }else{
                        if(typeof target === 'string' && target.toLowerCase().indexOf(arg)>=0){
                            return success = true;
                        }
                    }
                    return success;
                }else{
                    return target.indexOf(arg)>=0;
                }
            },
            "charAt":function(scope, args){
                var target = args.next(),
                    position;

                if(args.hasNext()){
                    position = args.next();
                }

                if(typeof target !== 'string'){
                    return;
                }

                return target.charAt(position);
            },
            "toLowerCase":function(scope, args){
                var target = args.next();

                if(typeof target !== 'string'){
                    return undefined;
                }

                return target.toLowerCase();
            },
            "toUpperCase":function(scope, args){
                var target = args.next();

                if(typeof target !== 'string'){
                    return undefined;
                }

                return target.toUpperCase();
            },
            "format": function format(scope, args) {
                var args = args.all();
                
                return stringFormat(args.shift(), args);
            },
            "refine": function(scope, args){
                var args = args.all(),
                    exclude = typeof args[0] === "boolean" && args.shift(),
                    original = args.shift(),
                    refined = {};
                    
                for(var i = 0; i < args.length; i++){
                    args[i] = args[i].toString();
                }

                for(var key in original){
                    if(args.indexOf(key)>=0){
                        !exclude && (refined[key] = original[key]);
                    }else if(exclude){
                        refined[key] = original[key];
                    }
                }
                
                return refined;
            },
            "date": (function(){
                var date = function(scope, args) {
                    return args.length ? new Date(args.length > 1 ? args.all() : args.next()) : new Date();
                };
                
                date.addDays = function(scope, args){
                    var baseDate = args.next();

                    return new Date(baseDate.setDate(baseDate.getDate() + args.next()));
                }
                
                return date;
            })(),
            "toJSON":function(scope, args){
                return JSON.stringify(args.next());
            },
            "fromJSON":function(scope, args){
                return JSON.parse(args.next());
            },
            "fold": function(scope, args){
                var args = args.all(),
                    fn = args.pop(),
                    seed = args.pop(),
                    array = args[0],
                    result = seed;
                
                if(args.length > 1){
                    array = args;
                }

                if(!array || !array.length){
                    return result;
                }
                    
                for(var i = 0; i < array.length; i++){
                    result = scope.callWith(fn, [result, array[i]]);
                }
                
                return result;
            },
            "partial": function(scope, args){
                var outerArgs = args.all(),
                    fn = outerArgs.shift();
                
                return function(scope, args){
                    var innerArgs = args.all();
                    return scope.callWith(fn, outerArgs.concat(innerArgs));
                };
            },
            "flip": function(scope, args){
                var outerArgs = args.all().reverse(),
                    fn = outerArgs.pop();
                
                return function(scope, args){
                    return scope.callWith(fn, outerArgs)
                };
            },
            "compose": function(scope, args){
                var outerArgs = args.all().reverse();
                    
                return function(scope, args){
                    var result = scope.callWith(outerArgs[0], args.all());
                    
                    for(var i = 1; i < outerArgs.length; i++){
                        result = scope.callWith(outerArgs[i], [result]);
                    }
                    
                    return result;
                };
            },
            "apply": function(scope, args){
                var fn = args.next()
                    outerArgs = args.next();
                    
                return scope.callWith(fn, outerArgs);
            }
        };

    
    Gel = function(){    
        var gel = {},
            lang = new Lang();
            
        gel.lang = lang;
        gel.tokenise = function(expression){
            return gel.lang.tokenise(expression, this.tokenConverters);
        }
        gel.evaluate = function(expression, injectedScope, returnAsTokens){
            var scope = new Lang.Scope();

            scope.add(this.scope).add(injectedScope);

            return lang.evaluate(expression, scope, this.tokenConverters, returnAsTokens);
        };
        gel.tokenConverters = tokenConverters.slice();
        gel.scope = Object.create(scope);
        
        return gel;
    };

    Gel.Token = Lang.Token;
    Gel.Scope = Lang.Scope;

    return Gel;
    
}));
},{"lang-js":4,"spec-js":6}],3:[function(require,module,exports){
//Copyright (C) 2012 Kory Nunn

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

//The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/*

    This code is not formatted for readability, but rather run-speed and to assist compilers.
    
    However, the code's intention should be transparent.
    
    *** IE SUPPORT ***
    
    If you require this library to work in IE7, add the following after declaring crel.
    
    var testDiv = document.createElement('div'),
        testLabel = document.createElement('label');

    testDiv.setAttribute('class', 'a');    
    testDiv['className'] !== 'a' ? crel.attrMap['class'] = 'className':undefined;
    testDiv.setAttribute('name','a');
    testDiv['name'] !== 'a' ? crel.attrMap['name'] = function(element, value){
        element.id = value;
    }:undefined;
    

    testLabel.setAttribute('for', 'a');
    testLabel['htmlFor'] !== 'a' ? crel.attrMap['for'] = 'htmlFor':undefined;
    
    

*/

// if the module has no dependencies, the above pattern can be simplified to
(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root.crel = factory();
  }
}(this, function () {
    // based on http://stackoverflow.com/questions/384286/javascript-isdom-how-do-you-check-if-a-javascript-object-is-a-dom-object
    var isNode = typeof Node === 'object'
        ? function (object) { return object instanceof Node }
        : function (object) {
            return object
                && typeof object === 'object'
                && typeof object.nodeType === 'number'
                && typeof object.nodeName === 'string';
        };

    function crel(){
        var document = window.document,
            args = arguments, //Note: assigned to a variable to assist compilers. Saves about 40 bytes in closure compiler. Has negligable effect on performance.
            element = document.createElement(args[0]),
            child,
            settings = args[1],
            childIndex = 2,
            argumentsLength = args.length,
            attributeMap = crel.attrMap;

        // shortcut
        if(argumentsLength === 1){
            return element;
        }

        if(typeof settings !== 'object' || isNode(settings)) {
            --childIndex;
            settings = null;
        }

        // shortcut if there is only one child that is a string    
        if((argumentsLength - childIndex) === 1 && typeof args[childIndex] === 'string' && element.textContent !== undefined){
            element.textContent = args[childIndex];
        }else{    
            for(; childIndex < argumentsLength; ++childIndex){
                child = args[childIndex];
                
                if(child == null){
                    continue;
                }
                
                if(!isNode(child)){
                    child = document.createTextNode(child);
                }
                
                element.appendChild(child);
            }
        }
        
        for(var key in settings){
            if(!attributeMap[key]){
                element.setAttribute(key, settings[key]);
            }else{
                var attr = crel.attrMap[key];
                if(typeof attr === 'function'){     
                    attr(element, settings[key]);               
                }else{            
                    element.setAttribute(attr, settings[key]);
                }
            }
        }
        
        return element;
    }
    
    // Used for mapping one kind of attribute to the supported version of that in bad browsers.
    // String referenced so that compilers maintain the property name.
    crel['attrMap'] = {};
    
    // String referenced so that compilers maintain the property name.
    crel["isNode"] = isNode;
    
    return crel;
}));

},{}],4:[function(require,module,exports){
var Token = require('./src/token');

function fastEach(items, callback) {
    for (var i = 0; i < items.length; i++) {
        if (callback(items[i], i, items)) break;
    }
    return items;
}

function callWith(fn, fnArguments, calledToken){
    var argIndex = 0,
        scope = this,
        args = {
            callee: calledToken,
            length: fnArguments.length,
            raw: function(evaluated){
                var rawArgs = fnArguments.slice();
                if(evaluated){
                    fastEach(rawArgs, function(arg){
                        if(arg instanceof Token){
                            arg.evaluate(scope);
                        }
                    });
                }
                return rawArgs;
            },
            getRaw: function(index, evaluated){
                var arg = fnArguments[index];

                if(evaluated){
                    if(arg instanceof Token){
                        arg.evaluate(scope);
                    }
                }
                return arg;
            },
            get: function(index){
                var arg = fnArguments[index];
                    
                if(arg instanceof Token){
                    arg.evaluate(scope);
                    return arg.result;
                }
                return arg;
            },
            hasNext: function(){
                return argIndex < fnArguments.length;
            },
            next: function(){
                if(!this.hasNext()){
                    throw "Incorrect number of arguments";
                }
                if(fnArguments[argIndex] instanceof Token){
                    fnArguments[argIndex].evaluate(scope);
                    return fnArguments[argIndex++].result;
                }
                return fnArguments[argIndex++];
            },
            all: function(){
                var allArgs = [];
                while(this.hasNext()){
                    allArgs.push(this.next());
                }
                return allArgs;
            }
        };
        
    return fn(scope, args);
}

function Scope(oldScope){
    this.__scope__ = {};
    this.__outerScope__ = oldScope;
}
Scope.prototype.get = function(key){
    if(key in this.__scope__){
        if(this.__scope__.hasOwnProperty(key)){
            return this.__scope__[key];
        }
    }
    return this.__outerScope__ && this.__outerScope__.get(key);
};
Scope.prototype.set = function(key, value, bubble){
    if(bubble){
        var currentScope = this;
        while(currentScope && !(key in currentScope.__scope__)){
            currentScope = currentScope.__outerScope__;
        }

        if(currentScope){
            currentScope.set(key, value);
        }
    }
    this.__scope__[key] = value;
    return this;
};
Scope.prototype.add = function(obj){
    for(var key in obj){
        this.__scope__[key] = obj[key];
    }
    return this;
};
Scope.prototype.isDefined = function(key){
    if(key in this.__scope__){
        return true;
    }
    return this.__outerScope__ && this.__outerScope__.isDefined(key) || false;
};
Scope.prototype.callWith = callWith;

// Takes a start and end regex, returns an appropriate parse function
function createNestingParser(openRegex, closeRegex){
    return function(tokens, index){
        if(this.original.match(openRegex)){
            var position = index,
                opens = 1;
                
            while(position++, position <= tokens.length && opens){
                if(!tokens[position]){
                    throw "Invalid nesting. No closing token was found matching " + closeRegex.toString();
                }
                if(tokens[position].original.match(openRegex)){
                    opens++;
                }
                if(tokens[position].original.match(closeRegex)){
                    opens--;
                }
            }

            // remove all wrapped tokens from the token array, including nest end token.
            var childTokens = tokens.splice(index + 1, position - 1 - index);

            // Remove the nest end token.
            childTokens.pop();

            // parse them, then add them as child tokens.
            this.childTokens = parse(childTokens);
            
            //Remove nesting end token
        }else{
            // If a nesting end token is found during parsing,
            // there is invalid nesting,
            // because the opening token should remove its closing token.
            throw "Invalid nesting. No opening token was found matching " + openRegex.toString();
        }
    };
}

function scanForToken(tokenisers, expression){
    for (var i = 0; i < tokenisers.length; i++) {
        var token = tokenisers[i].tokenise(expression);
        if (token) {                
            return token;
        }
    }
}

function sortByPrecedence(items){
    return items.slice().sort(function(a,b){
        var precedenceDifference = a.precedence - b.precedence;
        return precedenceDifference ? precedenceDifference : items.indexOf(a) - items.indexOf(b);
    });
}

function tokenise(expression, tokenConverters, memoisedTokens) {
    if(!expression){
        return [];
    }
    
    if(memoisedTokens && memoisedTokens[expression]){
        return memoisedTokens[expression].slice();
    }

    tokenConverters = sortByPrecedence(tokenConverters);
    
    var originalExpression = expression,
        tokens = [],
        totalCharsProcessed = 0,
        previousLength,
        reservedKeywordToken;
    
    do {
        previousLength = expression.length;
        
        var token;

        token = scanForToken(tokenConverters, expression);
        
        if(token){
            expression = expression.slice(token.length);
            totalCharsProcessed += token.length;                    
            tokens.push(token);
            continue;
        }
        
        if(expression.length === previousLength){
            throw "Unable to determine next token in expression: " + expression;
        }
        
    } while (expression);
    
    memoisedTokens && (memoisedTokens[originalExpression] = tokens.slice());
    
    return tokens;
}

function parse(tokens){
    var parsedTokens = 0,
        tokensByPrecedence = sortByPrecedence(tokens),
        currentToken = tokensByPrecedence[0],
        tokenNumber = 0;

    while(currentToken && currentToken.parsed == true){
        currentToken = tokensByPrecedence[tokenNumber++];
    }

    if(!currentToken){
        return tokens;
    }

    if(currentToken.parse){
        currentToken.parse(tokens, tokens.indexOf(currentToken));
    }

    // Even if the token has no parse method, it is still concidered 'parsed' at this point.
    currentToken.parsed = true;
    
    return parse(tokens);
}

function evaluate(tokens, scope){        
    scope = scope || new Scope();
    for(var i = 0; i < tokens.length; i++){
        var token = tokens[i];
        token.evaluate(scope);
    }
    
    return tokens;
}

function printTopExpressions(stats){
    var allStats = [];
    for(var key in stats){
        allStats.push({
            expression: key,
            time: stats[key].time,
            calls: stats[key].calls,
            averageTime: stats[key].averageTime
        });
    }

    allStats.sort(function(stat1, stat2){
        return stat2.time - stat1.time;
    }).slice(0, 10).forEach(function(stat){
        console.log([
            "Expression: ",
            stat.expression,
            '\n',
            'Average evaluation time: ',
            stat.averageTime,
            '\n',
            'Total time: ',
            stat.time,
            '\n',
            'Call count: ',                    
            stat.calls
        ].join(''));
    });
}

function Lang(){    
    var lang = {},
        memoisedTokens = {},
        memoisedExpressions = {};


    var stats = {};

    lang.printTopExpressions = function(){
        printTopExpressions(stats);
    }

    function addStat(stat){
        var expStats = stats[stat.expression] = stats[stat.expression] || {time:0, calls:0};

        expStats.time += stat.time;
        expStats.calls++;
        expStats.averageTime = expStats.time / expStats.calls;
    }

    lang.parse = parse;
    lang.tokenise = function(expression, tokenConverters){
        return tokenise(expression, tokenConverters, memoisedTokens);
    };
    lang.evaluate = function(expression, scope, tokenConverters, returnAsTokens){
        var langInstance = this,
            memoiseKey = expression,
            expressionTree,
            evaluatedTokens,
            lastToken;

        if(!(scope instanceof Scope)){
            var injectedScope = scope;

            scope = new Scope();

            scope.add(injectedScope);
        }

        if(Array.isArray(expression)){
            return evaluate(expression , scope).slice(-1).pop();
        }

        if(memoisedExpressions[memoiseKey]){
            expressionTree = memoisedExpressions[memoiseKey].slice();
        } else{            
            expressionTree = langInstance.parse(langInstance.tokenise(expression, tokenConverters, memoisedTokens));
            
            memoisedExpressions[memoiseKey] = expressionTree;
        }
        
        
        var startTime = new Date();
        evaluatedTokens = evaluate(expressionTree , scope);
        addStat({
            expression: expression,
            time: new Date() - startTime
        });
        
        if(returnAsTokens){
            return evaluatedTokens.slice();
        }
            
        lastToken = evaluatedTokens.slice(-1).pop();
        
        return lastToken && lastToken.result;
    };
    
    lang.callWith = callWith;
    return lang;
};

Lang.createNestingParser = createNestingParser;
Lang.Scope = Scope;
Lang.Token = Token;

module.exports = Lang;
},{"./src/token":5}],5:[function(require,module,exports){
function Token(substring, length){
    this.original = substring;
    this.length = length;
}
Token.prototype.name = 'token';
Token.prototype.precedence = 0;
Token.prototype.valueOf = function(){
    return this.result;
}

module.exports = Token;
},{}],6:[function(require,module,exports){
Object.create = Object.create || function (o) {
    if (arguments.length > 1) {
        throw new Error('Object.create implementation only accepts the first parameter.');
    }
    function F() {}
    F.prototype = o;
    return new F();
};

function createSpec(child, parent){
    var parentPrototype;
    
    if(!parent) {
        parent = Object;
    }
    
    if(!parent.prototype) {
        parent.prototype = {};
    }
    
    parentPrototype = parent.prototype;
    
    child.prototype = Object.create(parent.prototype);
    child.prototype.__super__ = parentPrototype;
    
    // Yes, This is 'bad'. However, it runs once per Spec creation.
    var spec = new Function("child", "return function " + child.name + "(){child.prototype.__super__.constructor.apply(this, arguments);return child.apply(this, arguments);}")(child);
    
    spec.prototype = child.prototype;
    spec.prototype.constructor = child.prototype.constructor = spec;
    
    return spec;
}

module.exports = createSpec;
},{}]},{},[1])
;

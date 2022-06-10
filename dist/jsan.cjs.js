'use strict';

var lib = {};

var cycle = {};

var pathGetter_1 = pathGetter;

function pathGetter(obj, path) {
  if (path !== '$') {
    var paths = getPaths(path);

    for (var i = 0; i < paths.length; i++) {
      path = paths[i].toString().replace(/\\"/g, '"');
      if (typeof obj[path] === 'undefined' && i !== paths.length - 1) continue;
      obj = obj[path];
    }
  }

  return obj;
}

function getPaths(pathString) {
  var regex = /(?:\.(\w+))|(?:\[(\d+)\])|(?:\["((?:[^\\"]|\\.)*)"\])/g;
  var matches = [];
  var match;

  while (match = regex.exec(pathString)) {
    matches.push(match[1] || match[2] || match[3]);
  }

  return matches;
}

var utils = {};

var hasRequiredUtils;

function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  var pathGetter = pathGetter_1;
  var jsan = requireLib();

  utils.getRegexFlags = function getRegexFlags(regex) {
    var flags = '';
    if (regex.ignoreCase) flags += 'i';
    if (regex.global) flags += 'g';
    if (regex.multiline) flags += 'm';
    return flags;
  };

  utils.stringifyFunction = function stringifyFunction(fn, customToString) {
    if (typeof customToString === 'function') {
      return customToString(fn);
    }

    var str = fn.toString();
    var match = str.match(/^[^{]*{|^[^=]*=>/);
    var start = match ? match[0] : '<function> ';
    var end = str[str.length - 1] === '}' ? '}' : '';
    return start.replace(/\r\n|\n/g, ' ').replace(/\s+/g, ' ') + ' /* ... */ ' + end;
  };

  utils.restore = function restore(obj, root) {
    var type = obj[0];
    var rest = obj.slice(1);

    switch (type) {
      case '$':
        return pathGetter(root, obj);

      case 'r':
        var comma = rest.indexOf(',');
        var flags = rest.slice(0, comma);
        var source = rest.slice(comma + 1);
        return RegExp(source, flags);

      case 'd':
        return new Date(+rest);

      case 'f':
        var fn = function () {
          throw new Error("can't run jsan parsed function");
        };

        fn.toString = function () {
          return rest;
        };

        return fn;

      case 'u':
        return undefined;

      case 'e':
        var error = new Error(rest);
        error.stack = 'Stack is unavailable for jsan parsed errors';
        return error;

      case 's':
        return Symbol(rest);

      case 'g':
        return Symbol.for(rest);

      case 'm':
        return new Map(jsan.parse(rest));

      case 'l':
        return new Set(jsan.parse(rest));

      case 'n':
        return NaN;

      case 'i':
        return Infinity;

      case 'y':
        return -Infinity;

      default:
        console.warn('unknown type', obj);
        return obj;
    }
  };

  return utils;
}

var hasRequiredCycle;

function requireCycle() {
  if (hasRequiredCycle) return cycle;
  hasRequiredCycle = 1;
  var utils = requireUtils();
  var WMap = typeof WeakMap !== 'undefined' ? WeakMap : function () {
    var keys = [];
    var values = [];
    return {
      set: function (key, value) {
        keys.push(key);
        values.push(value);
      },
      get: function (key) {
        for (var i = 0; i < keys.length; i++) {
          if (keys[i] === key) {
            return values[i];
          }
        }
      }
    };
  }; // Based on https://github.com/douglascrockford/JSON-js/blob/master/cycle.js

  cycle.decycle = function decycle(object, options, replacer, map) {

    map = map || new WMap();
    var noCircularOption = !Object.prototype.hasOwnProperty.call(options, 'circular');
    var withRefs = options.refs !== false;
    return function derez(_value, path, key) {
      // The derez recurses through the object, producing the deep copy.
      var i, // The loop counter
      name, // Property name
      nu; // The new object or array
      // typeof null === 'object', so go on if this value is really an object but not
      // one of the weird builtin objects.

      var value = typeof replacer === 'function' ? replacer(key || '', _value) : _value;

      if (options.date && value instanceof Date) {
        return {
          $jsan: 'd' + value.getTime()
        };
      }

      if (options.regex && value instanceof RegExp) {
        return {
          $jsan: 'r' + utils.getRegexFlags(value) + ',' + value.source
        };
      }

      if (options['function'] && typeof value === 'function') {
        return {
          $jsan: 'f' + utils.stringifyFunction(value, options['function'])
        };
      }

      if (options['nan'] && typeof value === 'number' && isNaN(value)) {
        return {
          $jsan: 'n'
        };
      }

      if (options['infinity']) {
        if (Number.POSITIVE_INFINITY === value) return {
          $jsan: 'i'
        };
        if (Number.NEGATIVE_INFINITY === value) return {
          $jsan: 'y'
        };
      }

      if (options['undefined'] && value === undefined) {
        return {
          $jsan: 'u'
        };
      }

      if (options['error'] && value instanceof Error) {
        return {
          $jsan: 'e' + value.message
        };
      }

      if (options['symbol'] && typeof value === 'symbol') {
        var symbolKey = Symbol.keyFor(value);

        if (symbolKey !== undefined) {
          return {
            $jsan: 'g' + symbolKey
          };
        } // 'Symbol(foo)'.slice(7, -1) === 'foo'


        return {
          $jsan: 's' + value.toString().slice(7, -1)
        };
      }

      if (options['map'] && typeof Map === 'function' && value instanceof Map && typeof Array.from === 'function') {
        return {
          $jsan: 'm' + JSON.stringify(decycle(Array.from(value), options, replacer, map))
        };
      }

      if (options['set'] && typeof Set === 'function' && value instanceof Set && typeof Array.from === 'function') {
        return {
          $jsan: 'l' + JSON.stringify(decycle(Array.from(value), options, replacer, map))
        };
      }

      if (value && typeof value.toJSON === 'function') {
        try {
          value = value.toJSON(key);
        } catch (error) {
          var keyString = key || '$';
          return "toJSON failed for '" + (map.get(value) || keyString) + "'";
        }
      }

      if (typeof value === 'object' && value !== null && !(value instanceof Boolean) && !(value instanceof Date) && !(value instanceof Number) && !(value instanceof RegExp) && !(value instanceof String) && !(typeof value === 'symbol') && !(value instanceof Error)) {
        // If the value is an object or array, look to see if we have already
        // encountered it. If so, return a $ref/path object.
        if (typeof value === 'object') {
          var foundPath = map.get(value);

          if (foundPath) {
            if (noCircularOption && withRefs) {
              return {
                $jsan: foundPath
              };
            } // This is only a true circular reference if the parent path is inside of foundPath
            // drop the last component of the current path and check if it starts with foundPath


            var parentPath = path.split('.').slice(0, -1).join('.');

            if (parentPath.indexOf(foundPath) === 0) {
              if (!noCircularOption) {
                return typeof options.circular === 'function' ? options.circular(value, path, foundPath) : options.circular;
              }

              return {
                $jsan: foundPath
              };
            }

            if (withRefs) return {
              $jsan: foundPath
            };
          }

          map.set(value, path);
        } // If it is an array, replicate the array.


        if (Object.prototype.toString.apply(value) === '[object Array]') {
          nu = [];

          for (i = 0; i < value.length; i += 1) {
            nu[i] = derez(value[i], path + '[' + i + ']', i);
          }
        } else {
          // If it is an object, replicate the object.
          nu = {};

          for (name in value) {
            if (Object.prototype.hasOwnProperty.call(value, name)) {
              var nextPath = /^\w+$/.test(name) ? '.' + name : '[' + JSON.stringify(name) + ']';
              nu[name] = name === '$jsan' ? [derez(value[name], path + nextPath)] : derez(value[name], path + nextPath, name);
            }
          }
        }

        return nu;
      }

      return value;
    }(object, '$');
  };

  cycle.retrocycle = function retrocycle($) {

    return function rez(value) {
      // The rez function walks recursively through the object looking for $jsan
      // properties. When it finds one that has a value that is a path, then it
      // replaces the $jsan object with a reference to the value that is found by
      // the path.
      var i, item, name;

      if (value && typeof value === 'object') {
        if (Object.prototype.toString.apply(value) === '[object Array]') {
          for (i = 0; i < value.length; i += 1) {
            item = value[i];

            if (item && typeof item === 'object') {
              if (item.$jsan) {
                value[i] = utils.restore(item.$jsan, $);
              } else {
                rez(item);
              }
            }
          }
        } else {
          for (name in value) {
            // base case passed raw object
            if (typeof value[name] === 'string' && name === '$jsan') {
              return utils.restore(value.$jsan, $);
            } else {
              if (name === '$jsan') {
                value[name] = value[name][0];
              }

              if (typeof value[name] === 'object') {
                item = value[name];

                if (item && typeof item === 'object') {
                  if (item.$jsan) {
                    value[name] = utils.restore(item.$jsan, $);
                  } else {
                    rez(item);
                  }
                }
              }
            }
          }
        }
      }

      return value;
    }($);
  };

  return cycle;
}

var hasRequiredLib;

function requireLib() {
  if (hasRequiredLib) return lib;
  hasRequiredLib = 1;
  var cycle = requireCycle();

  lib.stringify = function stringify(value, replacer, space, _options) {
    if (arguments.length < 4) {
      try {
        if (arguments.length === 1) {
          return JSON.stringify(value);
        } else {
          return JSON.stringify.apply(JSON, arguments);
        }
      } catch (e) {}
    }

    var options = _options || false;

    if (typeof options === 'boolean') {
      options = {
        'date': options,
        'function': options,
        'regex': options,
        'undefined': options,
        'error': options,
        'symbol': options,
        'map': options,
        'set': options,
        'nan': options,
        'infinity': options
      };
    }

    var decycled = cycle.decycle(value, options, replacer);

    if (arguments.length === 1) {
      return JSON.stringify(decycled);
    } else {
      // decycle already handles when replacer is a function.
      return JSON.stringify(decycled, Array.isArray(replacer) ? replacer : null, space);
    }
  };

  lib.parse = function parse(text, reviver) {
    var needsRetrocycle = /"\$jsan"/.test(text);
    var parsed;

    if (arguments.length === 1) {
      parsed = JSON.parse(text);
    } else {
      parsed = JSON.parse(text, reviver);
    }

    if (needsRetrocycle) {
      parsed = cycle.retrocycle(parsed);
    }

    return parsed;
  };

  return lib;
}

var libExports = requireLib();

module.exports = libExports;

var WildwoodCoop = (function(exports) {
  "use strict";var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});

  var _BinaryReader_instances, ensure_fn, _a, _b, _c, _d, _e, _f, _g, _h, _i, _events, _j, _TableCacheImpl_instances, makeReadonlyIndex_fn, _k, _ws, __WebsocketDecompressAdapter_instances, decompress_fn, _l, _uri, _nameOrAddress, _identity, _token, _emitter, _compression, _lightMode, _confirmedReads, _createWSFn, _m, _onApplied, _onError, _n, _querySetId, _unsubscribeCalled, _endedState, _activeState, _emitter2, _o, _connectionIdHex, _queryId, _requestId, _eventId, _emitter3, _inboundQueue, _inboundQueueOffset, _isDrainingInboundQueue, _outboundQueue, _isOutboundFlushScheduled, _negotiatedWsProtocol, _subscriptionManager, _remoteModule, _reducerCallbacks, _reducerCallInfo, _procedureCallbacks, _rowDeserializers, _rowIdMetadata, _reducerArgsSerializers, _procedureSerializers, _reducerNameBytes, _procedureNameBytes, _sourceNameToTableDef, _messageReader, _rowListReader, _clientFrameEncoder, _boundSubscriptionBuilder, _boundDisconnect, _getNextQueryId, _getNextRequestId, _DbConnectionImpl_instances, makeDbView_fn, makeReducers_fn, makeProcedures_fn, makeEventContext_fn, parseRowList_fn, mergeTableUpdates_fn, queryRowsToTableUpdates_fn, tableUpdateRowsToOperations_fn, querySetUpdateToTableUpdates_fn, flushOutboundQueue_fn, flushOutboundQueueV2_fn, flushOutboundQueueV3_fn, scheduleOutboundFlush_fn, scheduleDeferredOutboundFlush_fn, scheduleOutboundFlushWith_fn, _reducerArgsEncoder, _clientMessageEncoder, sendEncodedMessage_fn, sendMessage_fn, sendCallReducerMessage_fn, sendCallProcedureMessage_fn, setConnectionId_fn, nextEventId_fn, handleOnOpen_fn, applyTableUpdates_fn, applyTransactionUpdates_fn, dispatchPendingCallbacks_fn, processServerMessage_fn, processV2Message_fn, processMessage_fn, handleOnMessage_fn, callReducerWithEncodedName_fn, callReducerGeneric_fn, callProcedureWithEncodedName_fn, callProcedureGeneric_fn, _p, _compoundTypes, _moduleDef, _ModuleContext_instances, registerCompoundTypeRecursively_fn, _q;
  function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
  }
  var base64Js = {};
  var hasRequiredBase64Js;
  function requireBase64Js() {
    if (hasRequiredBase64Js) return base64Js;
    hasRequiredBase64Js = 1;
    base64Js.byteLength = byteLength;
    base64Js.toByteArray = toByteArray;
    base64Js.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (var i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1) validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i2;
      for (i2 = 0; i2 < len2; i2 += 4) {
        tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num) {
      return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
    }
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i2 = start; i2 < end; i2 += 3) {
        tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
    return base64Js;
  }
  var base64JsExports = requireBase64Js();
  var safeStableStringify = { exports: {} };
  var hasRequiredSafeStableStringify;
  function requireSafeStableStringify() {
    if (hasRequiredSafeStableStringify) return safeStableStringify.exports;
    hasRequiredSafeStableStringify = 1;
    (function(module, exports2) {
      const { hasOwnProperty } = Object.prototype;
      const stringify2 = configure();
      stringify2.configure = configure;
      stringify2.stringify = stringify2;
      stringify2.default = stringify2;
      exports2.stringify = stringify2;
      exports2.configure = configure;
      module.exports = stringify2;
      const strEscapeSequencesRegExp = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
      function strEscape(str) {
        if (str.length < 5e3 && !strEscapeSequencesRegExp.test(str)) {
          return `"${str}"`;
        }
        return JSON.stringify(str);
      }
      function sort(array, comparator) {
        if (array.length > 200 || comparator) {
          return array.sort(comparator);
        }
        for (let i = 1; i < array.length; i++) {
          const currentValue = array[i];
          let position = i;
          while (position !== 0 && array[position - 1] > currentValue) {
            array[position] = array[position - 1];
            position--;
          }
          array[position] = currentValue;
        }
        return array;
      }
      const typedArrayPrototypeGetSymbolToStringTag = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(
          Object.getPrototypeOf(
            new Int8Array()
          )
        ),
        Symbol.toStringTag
      ).get;
      function isTypedArrayWithEntries(value) {
        return typedArrayPrototypeGetSymbolToStringTag.call(value) !== void 0 && value.length !== 0;
      }
      function stringifyTypedArray(array, separator, maximumBreadth) {
        if (array.length < maximumBreadth) {
          maximumBreadth = array.length;
        }
        const whitespace = separator === "," ? "" : " ";
        let res = `"0":${whitespace}${array[0]}`;
        for (let i = 1; i < maximumBreadth; i++) {
          res += `${separator}"${i}":${whitespace}${array[i]}`;
        }
        return res;
      }
      function getCircularValueOption(options) {
        if (hasOwnProperty.call(options, "circularValue")) {
          const circularValue = options.circularValue;
          if (typeof circularValue === "string") {
            return `"${circularValue}"`;
          }
          if (circularValue == null) {
            return circularValue;
          }
          if (circularValue === Error || circularValue === TypeError) {
            return {
              toString() {
                throw new TypeError("Converting circular structure to JSON");
              }
            };
          }
          throw new TypeError('The "circularValue" argument must be of type string or the value null or undefined');
        }
        return '"[Circular]"';
      }
      function getDeterministicOption(options) {
        let value;
        if (hasOwnProperty.call(options, "deterministic")) {
          value = options.deterministic;
          if (typeof value !== "boolean" && typeof value !== "function") {
            throw new TypeError('The "deterministic" argument must be of type boolean or comparator function');
          }
        }
        return value === void 0 ? true : value;
      }
      function getBooleanOption(options, key) {
        let value;
        if (hasOwnProperty.call(options, key)) {
          value = options[key];
          if (typeof value !== "boolean") {
            throw new TypeError(`The "${key}" argument must be of type boolean`);
          }
        }
        return value === void 0 ? true : value;
      }
      function getPositiveIntegerOption(options, key) {
        let value;
        if (hasOwnProperty.call(options, key)) {
          value = options[key];
          if (typeof value !== "number") {
            throw new TypeError(`The "${key}" argument must be of type number`);
          }
          if (!Number.isInteger(value)) {
            throw new TypeError(`The "${key}" argument must be an integer`);
          }
          if (value < 1) {
            throw new RangeError(`The "${key}" argument must be >= 1`);
          }
        }
        return value === void 0 ? Infinity : value;
      }
      function getItemCount(number) {
        if (number === 1) {
          return "1 item";
        }
        return `${number} items`;
      }
      function getUniqueReplacerSet(replacerArray) {
        const replacerSet = /* @__PURE__ */ new Set();
        for (const value of replacerArray) {
          if (typeof value === "string" || typeof value === "number") {
            replacerSet.add(String(value));
          }
        }
        return replacerSet;
      }
      function getStrictOption(options) {
        if (hasOwnProperty.call(options, "strict")) {
          const value = options.strict;
          if (typeof value !== "boolean") {
            throw new TypeError('The "strict" argument must be of type boolean');
          }
          if (value) {
            return (value2) => {
              let message = `Object can not safely be stringified. Received type ${typeof value2}`;
              if (typeof value2 !== "function") message += ` (${value2.toString()})`;
              throw new Error(message);
            };
          }
        }
      }
      function configure(options) {
        options = { ...options };
        const fail = getStrictOption(options);
        if (fail) {
          if (options.bigint === void 0) {
            options.bigint = false;
          }
          if (!("circularValue" in options)) {
            options.circularValue = Error;
          }
        }
        const circularValue = getCircularValueOption(options);
        const bigint = getBooleanOption(options, "bigint");
        const deterministic = getDeterministicOption(options);
        const comparator = typeof deterministic === "function" ? deterministic : void 0;
        const maximumDepth = getPositiveIntegerOption(options, "maximumDepth");
        const maximumBreadth = getPositiveIntegerOption(options, "maximumBreadth");
        function stringifyFnReplacer(key, parent, stack, replacer, spacer, indentation) {
          let value = parent[key];
          if (typeof value === "object" && value !== null && typeof value.toJSON === "function") {
            value = value.toJSON(key);
          }
          value = replacer.call(parent, key, value);
          switch (typeof value) {
            case "string":
              return strEscape(value);
            case "object": {
              if (value === null) {
                return "null";
              }
              if (stack.indexOf(value) !== -1) {
                return circularValue;
              }
              let res = "";
              let join = ",";
              const originalIndentation = indentation;
              if (Array.isArray(value)) {
                if (value.length === 0) {
                  return "[]";
                }
                if (maximumDepth < stack.length + 1) {
                  return '"[Array]"';
                }
                stack.push(value);
                if (spacer !== "") {
                  indentation += spacer;
                  res += `
${indentation}`;
                  join = `,
${indentation}`;
                }
                const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
                let i = 0;
                for (; i < maximumValuesToStringify - 1; i++) {
                  const tmp2 = stringifyFnReplacer(String(i), value, stack, replacer, spacer, indentation);
                  res += tmp2 !== void 0 ? tmp2 : "null";
                  res += join;
                }
                const tmp = stringifyFnReplacer(String(i), value, stack, replacer, spacer, indentation);
                res += tmp !== void 0 ? tmp : "null";
                if (value.length - 1 > maximumBreadth) {
                  const removedKeys = value.length - maximumBreadth - 1;
                  res += `${join}"... ${getItemCount(removedKeys)} not stringified"`;
                }
                if (spacer !== "") {
                  res += `
${originalIndentation}`;
                }
                stack.pop();
                return `[${res}]`;
              }
              let keys = Object.keys(value);
              const keyLength = keys.length;
              if (keyLength === 0) {
                return "{}";
              }
              if (maximumDepth < stack.length + 1) {
                return '"[Object]"';
              }
              let whitespace = "";
              let separator = "";
              if (spacer !== "") {
                indentation += spacer;
                join = `,
${indentation}`;
                whitespace = " ";
              }
              const maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
              if (deterministic && !isTypedArrayWithEntries(value)) {
                keys = sort(keys, comparator);
              }
              stack.push(value);
              for (let i = 0; i < maximumPropertiesToStringify; i++) {
                const key2 = keys[i];
                const tmp = stringifyFnReplacer(key2, value, stack, replacer, spacer, indentation);
                if (tmp !== void 0) {
                  res += `${separator}${strEscape(key2)}:${whitespace}${tmp}`;
                  separator = join;
                }
              }
              if (keyLength > maximumBreadth) {
                const removedKeys = keyLength - maximumBreadth;
                res += `${separator}"...":${whitespace}"${getItemCount(removedKeys)} not stringified"`;
                separator = join;
              }
              if (spacer !== "" && separator.length > 1) {
                res = `
${indentation}${res}
${originalIndentation}`;
              }
              stack.pop();
              return `{${res}}`;
            }
            case "number":
              return isFinite(value) ? String(value) : fail ? fail(value) : "null";
            case "boolean":
              return value === true ? "true" : "false";
            case "undefined":
              return void 0;
            case "bigint":
              if (bigint) {
                return String(value);
              }
            // fallthrough
            default:
              return fail ? fail(value) : void 0;
          }
        }
        function stringifyArrayReplacer(key, value, stack, replacer, spacer, indentation) {
          if (typeof value === "object" && value !== null && typeof value.toJSON === "function") {
            value = value.toJSON(key);
          }
          switch (typeof value) {
            case "string":
              return strEscape(value);
            case "object": {
              if (value === null) {
                return "null";
              }
              if (stack.indexOf(value) !== -1) {
                return circularValue;
              }
              const originalIndentation = indentation;
              let res = "";
              let join = ",";
              if (Array.isArray(value)) {
                if (value.length === 0) {
                  return "[]";
                }
                if (maximumDepth < stack.length + 1) {
                  return '"[Array]"';
                }
                stack.push(value);
                if (spacer !== "") {
                  indentation += spacer;
                  res += `
${indentation}`;
                  join = `,
${indentation}`;
                }
                const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
                let i = 0;
                for (; i < maximumValuesToStringify - 1; i++) {
                  const tmp2 = stringifyArrayReplacer(String(i), value[i], stack, replacer, spacer, indentation);
                  res += tmp2 !== void 0 ? tmp2 : "null";
                  res += join;
                }
                const tmp = stringifyArrayReplacer(String(i), value[i], stack, replacer, spacer, indentation);
                res += tmp !== void 0 ? tmp : "null";
                if (value.length - 1 > maximumBreadth) {
                  const removedKeys = value.length - maximumBreadth - 1;
                  res += `${join}"... ${getItemCount(removedKeys)} not stringified"`;
                }
                if (spacer !== "") {
                  res += `
${originalIndentation}`;
                }
                stack.pop();
                return `[${res}]`;
              }
              stack.push(value);
              let whitespace = "";
              if (spacer !== "") {
                indentation += spacer;
                join = `,
${indentation}`;
                whitespace = " ";
              }
              let separator = "";
              for (const key2 of replacer) {
                const tmp = stringifyArrayReplacer(key2, value[key2], stack, replacer, spacer, indentation);
                if (tmp !== void 0) {
                  res += `${separator}${strEscape(key2)}:${whitespace}${tmp}`;
                  separator = join;
                }
              }
              if (spacer !== "" && separator.length > 1) {
                res = `
${indentation}${res}
${originalIndentation}`;
              }
              stack.pop();
              return `{${res}}`;
            }
            case "number":
              return isFinite(value) ? String(value) : fail ? fail(value) : "null";
            case "boolean":
              return value === true ? "true" : "false";
            case "undefined":
              return void 0;
            case "bigint":
              if (bigint) {
                return String(value);
              }
            // fallthrough
            default:
              return fail ? fail(value) : void 0;
          }
        }
        function stringifyIndent(key, value, stack, spacer, indentation) {
          switch (typeof value) {
            case "string":
              return strEscape(value);
            case "object": {
              if (value === null) {
                return "null";
              }
              if (typeof value.toJSON === "function") {
                value = value.toJSON(key);
                if (typeof value !== "object") {
                  return stringifyIndent(key, value, stack, spacer, indentation);
                }
                if (value === null) {
                  return "null";
                }
              }
              if (stack.indexOf(value) !== -1) {
                return circularValue;
              }
              const originalIndentation = indentation;
              if (Array.isArray(value)) {
                if (value.length === 0) {
                  return "[]";
                }
                if (maximumDepth < stack.length + 1) {
                  return '"[Array]"';
                }
                stack.push(value);
                indentation += spacer;
                let res2 = `
${indentation}`;
                const join2 = `,
${indentation}`;
                const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
                let i = 0;
                for (; i < maximumValuesToStringify - 1; i++) {
                  const tmp2 = stringifyIndent(String(i), value[i], stack, spacer, indentation);
                  res2 += tmp2 !== void 0 ? tmp2 : "null";
                  res2 += join2;
                }
                const tmp = stringifyIndent(String(i), value[i], stack, spacer, indentation);
                res2 += tmp !== void 0 ? tmp : "null";
                if (value.length - 1 > maximumBreadth) {
                  const removedKeys = value.length - maximumBreadth - 1;
                  res2 += `${join2}"... ${getItemCount(removedKeys)} not stringified"`;
                }
                res2 += `
${originalIndentation}`;
                stack.pop();
                return `[${res2}]`;
              }
              let keys = Object.keys(value);
              const keyLength = keys.length;
              if (keyLength === 0) {
                return "{}";
              }
              if (maximumDepth < stack.length + 1) {
                return '"[Object]"';
              }
              indentation += spacer;
              const join = `,
${indentation}`;
              let res = "";
              let separator = "";
              let maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
              if (isTypedArrayWithEntries(value)) {
                res += stringifyTypedArray(value, join, maximumBreadth);
                keys = keys.slice(value.length);
                maximumPropertiesToStringify -= value.length;
                separator = join;
              }
              if (deterministic) {
                keys = sort(keys, comparator);
              }
              stack.push(value);
              for (let i = 0; i < maximumPropertiesToStringify; i++) {
                const key2 = keys[i];
                const tmp = stringifyIndent(key2, value[key2], stack, spacer, indentation);
                if (tmp !== void 0) {
                  res += `${separator}${strEscape(key2)}: ${tmp}`;
                  separator = join;
                }
              }
              if (keyLength > maximumBreadth) {
                const removedKeys = keyLength - maximumBreadth;
                res += `${separator}"...": "${getItemCount(removedKeys)} not stringified"`;
                separator = join;
              }
              if (separator !== "") {
                res = `
${indentation}${res}
${originalIndentation}`;
              }
              stack.pop();
              return `{${res}}`;
            }
            case "number":
              return isFinite(value) ? String(value) : fail ? fail(value) : "null";
            case "boolean":
              return value === true ? "true" : "false";
            case "undefined":
              return void 0;
            case "bigint":
              if (bigint) {
                return String(value);
              }
            // fallthrough
            default:
              return fail ? fail(value) : void 0;
          }
        }
        function stringifySimple(key, value, stack) {
          switch (typeof value) {
            case "string":
              return strEscape(value);
            case "object": {
              if (value === null) {
                return "null";
              }
              if (typeof value.toJSON === "function") {
                value = value.toJSON(key);
                if (typeof value !== "object") {
                  return stringifySimple(key, value, stack);
                }
                if (value === null) {
                  return "null";
                }
              }
              if (stack.indexOf(value) !== -1) {
                return circularValue;
              }
              let res = "";
              const hasLength = value.length !== void 0;
              if (hasLength && Array.isArray(value)) {
                if (value.length === 0) {
                  return "[]";
                }
                if (maximumDepth < stack.length + 1) {
                  return '"[Array]"';
                }
                stack.push(value);
                const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
                let i = 0;
                for (; i < maximumValuesToStringify - 1; i++) {
                  const tmp2 = stringifySimple(String(i), value[i], stack);
                  res += tmp2 !== void 0 ? tmp2 : "null";
                  res += ",";
                }
                const tmp = stringifySimple(String(i), value[i], stack);
                res += tmp !== void 0 ? tmp : "null";
                if (value.length - 1 > maximumBreadth) {
                  const removedKeys = value.length - maximumBreadth - 1;
                  res += `,"... ${getItemCount(removedKeys)} not stringified"`;
                }
                stack.pop();
                return `[${res}]`;
              }
              let keys = Object.keys(value);
              const keyLength = keys.length;
              if (keyLength === 0) {
                return "{}";
              }
              if (maximumDepth < stack.length + 1) {
                return '"[Object]"';
              }
              let separator = "";
              let maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
              if (hasLength && isTypedArrayWithEntries(value)) {
                res += stringifyTypedArray(value, ",", maximumBreadth);
                keys = keys.slice(value.length);
                maximumPropertiesToStringify -= value.length;
                separator = ",";
              }
              if (deterministic) {
                keys = sort(keys, comparator);
              }
              stack.push(value);
              for (let i = 0; i < maximumPropertiesToStringify; i++) {
                const key2 = keys[i];
                const tmp = stringifySimple(key2, value[key2], stack);
                if (tmp !== void 0) {
                  res += `${separator}${strEscape(key2)}:${tmp}`;
                  separator = ",";
                }
              }
              if (keyLength > maximumBreadth) {
                const removedKeys = keyLength - maximumBreadth;
                res += `${separator}"...":"${getItemCount(removedKeys)} not stringified"`;
              }
              stack.pop();
              return `{${res}}`;
            }
            case "number":
              return isFinite(value) ? String(value) : fail ? fail(value) : "null";
            case "boolean":
              return value === true ? "true" : "false";
            case "undefined":
              return void 0;
            case "bigint":
              if (bigint) {
                return String(value);
              }
            // fallthrough
            default:
              return fail ? fail(value) : void 0;
          }
        }
        function stringify3(value, replacer, space) {
          if (arguments.length > 1) {
            let spacer = "";
            if (typeof space === "number") {
              spacer = " ".repeat(Math.min(space, 10));
            } else if (typeof space === "string") {
              spacer = space.slice(0, 10);
            }
            if (replacer != null) {
              if (typeof replacer === "function") {
                return stringifyFnReplacer("", { "": value }, [], replacer, spacer, "");
              }
              if (Array.isArray(replacer)) {
                return stringifyArrayReplacer("", value, [], getUniqueReplacerSet(replacer), spacer, "");
              }
            }
            if (spacer.length !== 0) {
              return stringifyIndent("", value, [], spacer, "");
            }
          }
          return stringifySimple("", value, []);
        }
        return stringify3;
      }
    })(safeStableStringify, safeStableStringify.exports);
    return safeStableStringify.exports;
  }
  var safeStableStringifyExports = requireSafeStableStringify();
  const cjsModule = /* @__PURE__ */ getDefaultExportFromCjs(safeStableStringifyExports);
  cjsModule.configure;
  const stringify$1 = cjsModule;
  var BinaryReader = (_a = class {
    constructor(input) {
      __privateAdd(this, _BinaryReader_instances);
      /**
       * The DataView used to read values from the binary data.
       *
       * Note: The DataView's `byteOffset` is relative to the beginning of the
       * underlying ArrayBuffer, not the start of the provided Uint8Array input.
       * This `BinaryReader`'s `#offset` field is used to track the current read position
       * relative to the start of the provided Uint8Array input.
       */
      __publicField(this, "view");
      /**
       * Represents the offset (in bytes) relative to the start of the DataView
       * and provided Uint8Array input.
       *
       * Note: This is *not* the absolute byte offset within the underlying ArrayBuffer.
       */
      __publicField(this, "offset", 0);
      this.view = input instanceof DataView ? input : new DataView(input.buffer, input.byteOffset, input.byteLength);
      this.offset = 0;
    }
    reset(input) {
      this.view = input instanceof DataView ? input : new DataView(input.buffer, input.byteOffset, input.byteLength);
      this.offset = 0;
    }
    get remaining() {
      return this.view.byteLength - this.offset;
    }
    readUInt8Array() {
      const length = this.readU32();
      __privateMethod(this, _BinaryReader_instances, ensure_fn).call(this, length);
      return this.readBytes(length);
    }
    readBool() {
      const value = this.view.getUint8(this.offset);
      this.offset += 1;
      return value !== 0;
    }
    readByte() {
      const value = this.view.getUint8(this.offset);
      this.offset += 1;
      return value;
    }
    readBytes(length) {
      const array = new Uint8Array(
        this.view.buffer,
        this.view.byteOffset + this.offset,
        length
      );
      this.offset += length;
      return array;
    }
    readI8() {
      const value = this.view.getInt8(this.offset);
      this.offset += 1;
      return value;
    }
    readU8() {
      return this.readByte();
    }
    readI16() {
      const value = this.view.getInt16(this.offset, true);
      this.offset += 2;
      return value;
    }
    readU16() {
      const value = this.view.getUint16(this.offset, true);
      this.offset += 2;
      return value;
    }
    readI32() {
      const value = this.view.getInt32(this.offset, true);
      this.offset += 4;
      return value;
    }
    readU32() {
      const value = this.view.getUint32(this.offset, true);
      this.offset += 4;
      return value;
    }
    readI64() {
      const value = this.view.getBigInt64(this.offset, true);
      this.offset += 8;
      return value;
    }
    readU64() {
      const value = this.view.getBigUint64(this.offset, true);
      this.offset += 8;
      return value;
    }
    readU128() {
      const lowerPart = this.view.getBigUint64(this.offset, true);
      const upperPart = this.view.getBigUint64(this.offset + 8, true);
      this.offset += 16;
      return (upperPart << BigInt(64)) + lowerPart;
    }
    readI128() {
      const lowerPart = this.view.getBigUint64(this.offset, true);
      const upperPart = this.view.getBigInt64(this.offset + 8, true);
      this.offset += 16;
      return (upperPart << BigInt(64)) + lowerPart;
    }
    readU256() {
      const p0 = this.view.getBigUint64(this.offset, true);
      const p1 = this.view.getBigUint64(this.offset + 8, true);
      const p2 = this.view.getBigUint64(this.offset + 16, true);
      const p3 = this.view.getBigUint64(this.offset + 24, true);
      this.offset += 32;
      return (p3 << BigInt(3 * 64)) + (p2 << BigInt(2 * 64)) + (p1 << BigInt(1 * 64)) + p0;
    }
    readI256() {
      const p0 = this.view.getBigUint64(this.offset, true);
      const p1 = this.view.getBigUint64(this.offset + 8, true);
      const p2 = this.view.getBigUint64(this.offset + 16, true);
      const p3 = this.view.getBigInt64(this.offset + 24, true);
      this.offset += 32;
      return (p3 << BigInt(3 * 64)) + (p2 << BigInt(2 * 64)) + (p1 << BigInt(1 * 64)) + p0;
    }
    readF32() {
      const value = this.view.getFloat32(this.offset, true);
      this.offset += 4;
      return value;
    }
    readF64() {
      const value = this.view.getFloat64(this.offset, true);
      this.offset += 8;
      return value;
    }
    readString() {
      const uint8Array = this.readUInt8Array();
      return new TextDecoder("utf-8").decode(uint8Array);
    }
  }, _BinaryReader_instances = new WeakSet(), /** Ensure we have at least `n` bytes left to read */
  ensure_fn = function(n) {
    if (this.offset + n > this.view.byteLength) {
      throw new RangeError(
        `Tried to read ${n} byte(s) at relative offset ${this.offset}, but only ${this.remaining} byte(s) remain`
      );
    }
  }, _a);
  var ArrayBufferPrototypeTransfer = ArrayBuffer.prototype.transfer ?? function(newByteLength) {
    if (newByteLength === void 0) {
      return this.slice();
    } else if (newByteLength <= this.byteLength) {
      return this.slice(0, newByteLength);
    } else {
      const copy = new Uint8Array(newByteLength);
      copy.set(new Uint8Array(this));
      return copy.buffer;
    }
  };
  var ResizableBuffer = class {
    constructor(init) {
      __publicField(this, "buffer");
      __publicField(this, "view");
      this.buffer = typeof init === "number" ? new ArrayBuffer(init) : init;
      this.view = new DataView(this.buffer);
    }
    get capacity() {
      return this.buffer.byteLength;
    }
    grow(newSize) {
      if (newSize <= this.buffer.byteLength) return;
      this.buffer = ArrayBufferPrototypeTransfer.call(this.buffer, newSize);
      this.view = new DataView(this.buffer);
    }
  };
  var BinaryWriter = class {
    constructor(init) {
      __publicField(this, "buffer");
      __publicField(this, "offset", 0);
      this.buffer = typeof init === "number" ? new ResizableBuffer(init) : init;
    }
    clear() {
      this.offset = 0;
    }
    reset(buffer) {
      this.buffer = buffer;
      this.offset = 0;
    }
    expandBuffer(additionalCapacity) {
      const minCapacity = this.offset + additionalCapacity + 1;
      if (minCapacity <= this.buffer.capacity) return;
      let newCapacity = this.buffer.capacity * 2;
      if (newCapacity < minCapacity) newCapacity = minCapacity;
      this.buffer.grow(newCapacity);
    }
    toBase64() {
      return base64JsExports.fromByteArray(this.getBuffer());
    }
    getBuffer() {
      return new Uint8Array(this.buffer.buffer, 0, this.offset);
    }
    get view() {
      return this.buffer.view;
    }
    writeUInt8Array(value) {
      const length = value.length;
      this.expandBuffer(4 + length);
      this.writeU32(length);
      new Uint8Array(this.buffer.buffer, this.offset).set(value);
      this.offset += length;
    }
    writeBool(value) {
      this.expandBuffer(1);
      this.view.setUint8(this.offset, value ? 1 : 0);
      this.offset += 1;
    }
    writeByte(value) {
      this.expandBuffer(1);
      this.view.setUint8(this.offset, value);
      this.offset += 1;
    }
    writeBytes(value) {
      this.expandBuffer(value.length);
      new Uint8Array(this.buffer.buffer, this.offset, value.length).set(value);
      this.offset += value.length;
    }
    writeI8(value) {
      this.expandBuffer(1);
      this.view.setInt8(this.offset, value);
      this.offset += 1;
    }
    writeU8(value) {
      this.expandBuffer(1);
      this.view.setUint8(this.offset, value);
      this.offset += 1;
    }
    writeI16(value) {
      this.expandBuffer(2);
      this.view.setInt16(this.offset, value, true);
      this.offset += 2;
    }
    writeU16(value) {
      this.expandBuffer(2);
      this.view.setUint16(this.offset, value, true);
      this.offset += 2;
    }
    writeI32(value) {
      this.expandBuffer(4);
      this.view.setInt32(this.offset, value, true);
      this.offset += 4;
    }
    writeU32(value) {
      this.expandBuffer(4);
      this.view.setUint32(this.offset, value, true);
      this.offset += 4;
    }
    writeI64(value) {
      this.expandBuffer(8);
      this.view.setBigInt64(this.offset, value, true);
      this.offset += 8;
    }
    writeU64(value) {
      this.expandBuffer(8);
      this.view.setBigUint64(this.offset, value, true);
      this.offset += 8;
    }
    writeU128(value) {
      this.expandBuffer(16);
      const lowerPart = value & BigInt("0xFFFFFFFFFFFFFFFF");
      const upperPart = value >> BigInt(64);
      this.view.setBigUint64(this.offset, lowerPart, true);
      this.view.setBigUint64(this.offset + 8, upperPart, true);
      this.offset += 16;
    }
    writeI128(value) {
      this.expandBuffer(16);
      const lowerPart = value & BigInt("0xFFFFFFFFFFFFFFFF");
      const upperPart = value >> BigInt(64);
      this.view.setBigInt64(this.offset, lowerPart, true);
      this.view.setBigInt64(this.offset + 8, upperPart, true);
      this.offset += 16;
    }
    writeU256(value) {
      this.expandBuffer(32);
      const low_64_mask = BigInt("0xFFFFFFFFFFFFFFFF");
      const p0 = value & low_64_mask;
      const p1 = value >> BigInt(64 * 1) & low_64_mask;
      const p2 = value >> BigInt(64 * 2) & low_64_mask;
      const p3 = value >> BigInt(64 * 3);
      this.view.setBigUint64(this.offset + 8 * 0, p0, true);
      this.view.setBigUint64(this.offset + 8 * 1, p1, true);
      this.view.setBigUint64(this.offset + 8 * 2, p2, true);
      this.view.setBigUint64(this.offset + 8 * 3, p3, true);
      this.offset += 32;
    }
    writeI256(value) {
      this.expandBuffer(32);
      const low_64_mask = BigInt("0xFFFFFFFFFFFFFFFF");
      const p0 = value & low_64_mask;
      const p1 = value >> BigInt(64 * 1) & low_64_mask;
      const p2 = value >> BigInt(64 * 2) & low_64_mask;
      const p3 = value >> BigInt(64 * 3);
      this.view.setBigUint64(this.offset + 8 * 0, p0, true);
      this.view.setBigUint64(this.offset + 8 * 1, p1, true);
      this.view.setBigUint64(this.offset + 8 * 2, p2, true);
      this.view.setBigInt64(this.offset + 8 * 3, p3, true);
      this.offset += 32;
    }
    writeF32(value) {
      this.expandBuffer(4);
      this.view.setFloat32(this.offset, value, true);
      this.offset += 4;
    }
    writeF64(value) {
      this.expandBuffer(8);
      this.view.setFloat64(this.offset, value, true);
      this.offset += 8;
    }
    writeString(value) {
      const encoder = new TextEncoder();
      const encodedString = encoder.encode(value);
      this.writeUInt8Array(encodedString);
    }
  };
  function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== "object" || obj1 === null || typeof obj2 !== "object" || obj2 === null) {
      return false;
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }
    return true;
  }
  function uint8ArrayToHexString(array) {
    return Array.prototype.map.call(array.reverse(), (x) => ("00" + x.toString(16)).slice(-2)).join("");
  }
  function uint8ArrayToU128(array) {
    if (array.length != 16) {
      throw new Error(`Uint8Array is not 16 bytes long: ${array}`);
    }
    return new BinaryReader(array).readU128();
  }
  function uint8ArrayToU256(array) {
    if (array.length != 32) {
      throw new Error(`Uint8Array is not 32 bytes long: [${array}]`);
    }
    return new BinaryReader(array).readU256();
  }
  function hexStringToUint8Array(str) {
    if (str.startsWith("0x")) {
      str = str.slice(2);
    }
    const matches = str.match(/.{1,2}/g) || [];
    const data = Uint8Array.from(
      matches.map((byte) => parseInt(byte, 16))
    );
    return data.reverse();
  }
  function hexStringToU128(str) {
    return uint8ArrayToU128(hexStringToUint8Array(str));
  }
  function hexStringToU256(str) {
    return uint8ArrayToU256(hexStringToUint8Array(str));
  }
  function u128ToUint8Array(data) {
    const writer = new BinaryWriter(16);
    writer.writeU128(data);
    return writer.getBuffer();
  }
  function u128ToHexString(data) {
    return uint8ArrayToHexString(u128ToUint8Array(data));
  }
  function u256ToUint8Array(data) {
    const writer = new BinaryWriter(32);
    writer.writeU256(data);
    return writer.getBuffer();
  }
  function u256ToHexString(data) {
    return uint8ArrayToHexString(u256ToUint8Array(data));
  }
  function coerceToBigInt(value, what) {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string" && value.trim() !== "") return BigInt(value);
    throw new TypeError(
      `Cannot convert ${typeof value} to ${what}: expected bigint, integer number, or decimal string`
    );
  }
  function toPascalCase(s) {
    const str = toCamelCase(s);
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function toCamelCase(s) {
    const str = s.replace(/[-_]+/g, "_").replace(/_([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
  var hasOwn = Object.hasOwn;
  var TimeDuration = (_b = class {
    constructor(micros) {
      __publicField(this, "__time_duration_micros__");
      this.__time_duration_micros__ = coerceToBigInt(micros, "TimeDuration");
    }
    /**
     * Get the algebraic type representation of the {@link TimeDuration} type.
     * @returns The algebraic type representation of the type.
     */
    static getAlgebraicType() {
      return AlgebraicType.Product({
        elements: [
          {
            name: "__time_duration_micros__",
            algebraicType: AlgebraicType.I64
          }
        ]
      });
    }
    static isTimeDuration(algebraicType) {
      if (algebraicType.tag !== "Product") {
        return false;
      }
      const elements = algebraicType.value.elements;
      if (elements.length !== 1) {
        return false;
      }
      const microsElement = elements[0];
      return microsElement.name === "__time_duration_micros__" && microsElement.algebraicType.tag === "I64";
    }
    get micros() {
      return this.__time_duration_micros__;
    }
    get millis() {
      return Number(this.micros / _b.MICROS_PER_MILLIS);
    }
    static fromMillis(millis) {
      return new _b(BigInt(millis) * _b.MICROS_PER_MILLIS);
    }
    /** This outputs the same string format that we use in the host and in Rust modules */
    toString() {
      const micros = this.micros;
      const sign = micros < 0 ? "-" : "+";
      const pos = micros < 0 ? -micros : micros;
      const secs = pos / 1000000n;
      const micros_remaining = pos % 1000000n;
      return `${sign}${secs}.${String(micros_remaining).padStart(6, "0")}`;
    }
  }, __publicField(_b, "MICROS_PER_MILLIS", 1000n), _b);
  var Timestamp = (_c = class {
    constructor(micros) {
      __publicField(this, "__timestamp_micros_since_unix_epoch__");
      this.__timestamp_micros_since_unix_epoch__ = coerceToBigInt(
        micros,
        "Timestamp"
      );
    }
    get microsSinceUnixEpoch() {
      return this.__timestamp_micros_since_unix_epoch__;
    }
    /**
     * Get the algebraic type representation of the {@link Timestamp} type.
     * @returns The algebraic type representation of the type.
     */
    static getAlgebraicType() {
      return AlgebraicType.Product({
        elements: [
          {
            name: "__timestamp_micros_since_unix_epoch__",
            algebraicType: AlgebraicType.I64
          }
        ]
      });
    }
    static isTimestamp(algebraicType) {
      if (algebraicType.tag !== "Product") {
        return false;
      }
      const elements = algebraicType.value.elements;
      if (elements.length !== 1) {
        return false;
      }
      const microsElement = elements[0];
      return microsElement.name === "__timestamp_micros_since_unix_epoch__" && microsElement.algebraicType.tag === "I64";
    }
    /**
     * Get a `Timestamp` representing the execution environment's belief of the current moment in time.
     */
    static now() {
      return _c.fromDate(/* @__PURE__ */ new Date());
    }
    /** Convert to milliseconds since Unix epoch. */
    toMillis() {
      return this.microsSinceUnixEpoch / 1000n;
    }
    /**
     * Get a `Timestamp` representing the same point in time as `date`.
     */
    static fromDate(date) {
      const millis = date.getTime();
      const micros = BigInt(millis) * _c.MICROS_PER_MILLIS;
      return new _c(micros);
    }
    /**
     * Get a `Date` representing approximately the same point in time as `this`.
     *
     * This method truncates to millisecond precision,
     * and throws `RangeError` if the `Timestamp` is outside the range representable as a `Date`.
     */
    toDate() {
      const micros = this.__timestamp_micros_since_unix_epoch__;
      const millis = micros / _c.MICROS_PER_MILLIS;
      if (millis > BigInt(Number.MAX_SAFE_INTEGER) || millis < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new RangeError(
          "Timestamp is outside of the representable range of JS's Date"
        );
      }
      return new Date(Number(millis));
    }
    /**
     * Get an ISO 8601 / RFC 3339 formatted string representation of this timestamp with microsecond precision.
     *
     * This method preserves the full microsecond precision of the timestamp,
     * and throws `RangeError` if the `Timestamp` is outside the range representable in ISO format.
     *
     * @returns ISO 8601 formatted string with microsecond precision (e.g., '2025-02-17T10:30:45.123456Z')
     */
    toISOString() {
      const micros = this.__timestamp_micros_since_unix_epoch__;
      const millis = micros / _c.MICROS_PER_MILLIS;
      if (millis > BigInt(Number.MAX_SAFE_INTEGER) || millis < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new RangeError(
          "Timestamp is outside of the representable range for ISO string formatting"
        );
      }
      const date = new Date(Number(millis));
      const isoBase = date.toISOString();
      const microsRemainder = Math.abs(Number(micros % 1000000n));
      const fractionalPart = String(microsRemainder).padStart(6, "0");
      return isoBase.replace(/\.\d{3}Z$/, `.${fractionalPart}Z`);
    }
    since(other) {
      return new TimeDuration(
        this.__timestamp_micros_since_unix_epoch__ - other.__timestamp_micros_since_unix_epoch__
      );
    }
  }, __publicField(_c, "MICROS_PER_MILLIS", 1000n), /**
   * The Unix epoch, the midnight at the beginning of January 1, 1970, UTC.
   */
  __publicField(_c, "UNIX_EPOCH", new _c(0n)), _c);
  var Uuid = (_d = class {
    /**
     * Create a UUID from a raw 128-bit value.
     *
     * @param u - Unsigned 128-bit integer
     * @throws {Error} If the value is outside the valid UUID range
     */
    constructor(u) {
      __publicField(this, "__uuid__");
      const v = coerceToBigInt(u, "Uuid");
      if (v < 0n || v > _d.MAX_UUID_BIGINT) {
        throw new Error("Invalid UUID: must be between 0 and `MAX_UUID_BIGINT`");
      }
      this.__uuid__ = v;
    }
    /**
     * Create a UUID `v4` from explicit random bytes.
     *
     * This method assumes the bytes are already sufficiently random.
     * It only sets the appropriate bits for the UUID version and variant.
     *
     * @param bytes - Exactly 16 random bytes
     * @returns A UUID `v4`
     * @throws {Error} If `bytes.length !== 16`
     *
     * @example
     * ```ts
     * const randomBytes = new Uint8Array(16);
     * const uuid = Uuid.fromRandomBytesV4(randomBytes);
     *
     * console.assert(
     *   uuid.toString() === "00000000-0000-4000-8000-000000000000"
     * );
     * ```
     */
    static fromRandomBytesV4(bytes) {
      if (bytes.length !== 16) throw new Error("UUID v4 requires 16 bytes");
      const arr = new Uint8Array(bytes);
      arr[6] = arr[6] & 15 | 64;
      arr[8] = arr[8] & 63 | 128;
      return new _d(_d.bytesToBigInt(arr));
    }
    /**
     * Generate a UUID `v7` using a monotonic counter from `0` to `2^31 - 1`,
     * a timestamp, and 4 random bytes.
     *
     * The counter wraps around on overflow.
     *
     * The UUID `v7` is structured as follows:
     *
     * ```ascii
     * ┌───────────────────────────────────────────────┬───────────────────┐
     * | B0  | B1  | B2  | B3  | B4  | B5              |         B6        |
     * ├───────────────────────────────────────────────┼───────────────────┤
     * |                 unix_ts_ms                    |      version 7    |
     * └───────────────────────────────────────────────┴───────────────────┘
     * ┌──────────────┬─────────┬──────────────────┬───────────────────────┐
     * | B7           | B8      | B9  | B10 | B11  | B12 | B13 | B14 | B15 |
     * ├──────────────┼─────────┼──────────────────┼───────────────────────┤
     * | counter_high | variant |    counter_low   |        random         |
     * └──────────────┴─────────┴──────────────────┴───────────────────────┘
     * ```
     *
     * @param counter - Mutable monotonic counter (31-bit)
     * @param now - Timestamp since the Unix epoch
     * @param randomBytes - Exactly 4 random bytes
     * @returns A UUID `v7`
     *
     * @throws {Error} If the `counter` is negative
     * @throws {Error} If the `timestamp` is before the Unix epoch
     * @throws {Error} If `randomBytes.length !== 4`
     *
     * @example
     * ```ts
     * const now = Timestamp.fromMillis(1_686_000_000_000n);
     * const counter = { value: 1 };
     * const randomBytes = new Uint8Array(4);
     *
     * const uuid = Uuid.fromCounterV7(counter, now, randomBytes);
     *
     * console.assert(
     *   uuid.toString() === "0000647e-5180-7000-8000-000200000000"
     * );
     * ```
     */
    static fromCounterV7(counter, now, randomBytes) {
      if (randomBytes.length !== 4) {
        throw new Error("`fromCounterV7` requires `randomBytes.length == 4`");
      }
      if (counter.value < 0) {
        throw new Error("`fromCounterV7` uuid `counter` must be non-negative");
      }
      if (now.__timestamp_micros_since_unix_epoch__ < 0) {
        throw new Error("`fromCounterV7` `timestamp` before unix epoch");
      }
      const counterVal = counter.value;
      counter.value = counterVal + 1 & 2147483647;
      const tsMs = now.toMillis() & 0xffffffffffffn;
      const bytes = new Uint8Array(16);
      bytes[0] = Number(tsMs >> 40n & 0xffn);
      bytes[1] = Number(tsMs >> 32n & 0xffn);
      bytes[2] = Number(tsMs >> 24n & 0xffn);
      bytes[3] = Number(tsMs >> 16n & 0xffn);
      bytes[4] = Number(tsMs >> 8n & 0xffn);
      bytes[5] = Number(tsMs & 0xffn);
      bytes[7] = counterVal >>> 23 & 255;
      bytes[9] = counterVal >>> 15 & 255;
      bytes[10] = counterVal >>> 7 & 255;
      bytes[11] = (counterVal & 127) << 1 & 255;
      bytes[12] |= randomBytes[0] & 127;
      bytes[13] = randomBytes[1];
      bytes[14] = randomBytes[2];
      bytes[15] = randomBytes[3];
      bytes[6] = bytes[6] & 15 | 112;
      bytes[8] = bytes[8] & 63 | 128;
      return new _d(_d.bytesToBigInt(bytes));
    }
    /**
     * Parse a UUID from a string representation.
     *
     * @param s - UUID string
     * @returns Parsed UUID
     * @throws {Error} If the string is not a valid UUID
     *
     * @example
     * ```ts
     * const s = "01888d6e-5c00-7000-8000-000000000000";
     * const uuid = Uuid.parse(s);
     *
     * console.assert(uuid.toString() === s);
     * ```
     */
    static parse(s) {
      const hex = s.replace(/-/g, "");
      if (hex.length !== 32) throw new Error("Invalid hex UUID");
      let v = 0n;
      for (let i = 0; i < 32; i += 2) {
        v = v << 8n | BigInt(parseInt(hex.slice(i, i + 2), 16));
      }
      return new _d(v);
    }
    /** Convert to hex string without a 0x prefix. */
    toHexString() {
      return u128ToHexString(this.asBigInt());
    }
    /** Convert to string (hyphenated form). */
    toString() {
      const hex = this.toHexString();
      return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
    }
    /** Convert to bigint (u128). */
    asBigInt() {
      return this.__uuid__;
    }
    /** Return a `Uint8Array` of 16 bytes. */
    toBytes() {
      return _d.bigIntToBytes(this.__uuid__);
    }
    static bytesToBigInt(bytes) {
      let result = 0n;
      for (const b of bytes) result = result << 8n | BigInt(b);
      return result;
    }
    static bigIntToBytes(value) {
      const bytes = new Uint8Array(16);
      for (let i = 15; i >= 0; i--) {
        bytes[i] = Number(value & 0xffn);
        value >>= 8n;
      }
      return bytes;
    }
    /**
     * Returns the version of this UUID.
     *
     * This represents the algorithm used to generate the value.
     *
     * @returns A `UuidVersion`
     * @throws {Error} If the version field is not recognized
     */
    getVersion() {
      const version = this.toBytes()[6] >> 4 & 15;
      switch (version) {
        case 4:
          return "V4";
        case 7:
          return "V7";
        default:
          if (this == _d.NIL) {
            return "Nil";
          }
          if (this == _d.MAX) {
            return "Max";
          }
          throw new Error(`Unsupported UUID version: ${version}`);
      }
    }
    /**
     * Extract the monotonic counter from a UUIDv7.
     *
     * Intended for testing and diagnostics.
     * Behavior is undefined if called on a non-V7 UUID.
     *
     * @returns 31-bit counter value
     */
    getCounter() {
      const bytes = this.toBytes();
      const high = bytes[7];
      const mid1 = bytes[9];
      const mid2 = bytes[10];
      const low = bytes[11] >>> 1;
      return high << 23 | mid1 << 15 | mid2 << 7 | low | 0;
    }
    compareTo(other) {
      if (this.__uuid__ < other.__uuid__) return -1;
      if (this.__uuid__ > other.__uuid__) return 1;
      return 0;
    }
    static getAlgebraicType() {
      return AlgebraicType.Product({
        elements: [
          {
            name: "__uuid__",
            algebraicType: AlgebraicType.U128
          }
        ]
      });
    }
  }, /**
   * The nil UUID (all zeros).
   *
   * @example
   * ```ts
   * const uuid = Uuid.NIL;
   * console.assert(
   *   uuid.toString() === "00000000-0000-0000-0000-000000000000"
   * );
   * ```
   */
  __publicField(_d, "NIL", new _d(0n)), __publicField(_d, "MAX_UUID_BIGINT", 0xffffffffffffffffffffffffffffffffn), /**
   * The max UUID (all ones).
   *
   * @example
   * ```ts
   * const uuid = Uuid.MAX;
   * console.assert(
   *   uuid.toString() === "ffffffff-ffff-ffff-ffff-ffffffffffff"
   * );
   * ```
   */
  __publicField(_d, "MAX", new _d(_d.MAX_UUID_BIGINT)), _d);
  var Identity = class _Identity {
    /**
     * Creates a new `Identity`.
     *
     * `data` can be a hexadecimal string or a `bigint`.
     */
    constructor(data) {
      __publicField(this, "__identity__");
      this.__identity__ = typeof data === "string" ? hexStringToU256(data) : coerceToBigInt(data, "Identity");
    }
    /**
     * Get the algebraic type representation of the {@link Identity} type.
     * @returns The algebraic type representation of the type.
     */
    static getAlgebraicType() {
      return AlgebraicType.Product({
        elements: [{ name: "__identity__", algebraicType: AlgebraicType.U256 }]
      });
    }
    /**
     * Check if two identities are equal.
     */
    isEqual(other) {
      return this.toHexString() === other.toHexString();
    }
    /**
     * Check if two identities are equal.
     */
    equals(other) {
      return this.isEqual(other);
    }
    /**
     * Print the identity as a hexadecimal string.
     */
    toHexString() {
      return u256ToHexString(this.__identity__);
    }
    /**
     * Convert the address to a Uint8Array.
     */
    toUint8Array() {
      return u256ToUint8Array(this.__identity__);
    }
    /**
     * Parse an Identity from a hexadecimal string.
     */
    static fromString(str) {
      return new _Identity(str);
    }
    /**
     * Zero identity (0x0000000000000000000000000000000000000000000000000000000000000000)
     */
    static zero() {
      return new _Identity(0n);
    }
    toString() {
      return this.toHexString();
    }
  };
  var SERIALIZERS = /* @__PURE__ */ new Map();
  var DESERIALIZERS = /* @__PURE__ */ new Map();
  var AlgebraicType = {
    Ref: (value) => ({ tag: "Ref", value }),
    Sum: (value) => ({
      tag: "Sum",
      value
    }),
    Product: (value) => ({
      tag: "Product",
      value
    }),
    Array: (value) => ({
      tag: "Array",
      value
    }),
    String: { tag: "String" },
    Bool: { tag: "Bool" },
    I8: { tag: "I8" },
    U8: { tag: "U8" },
    I16: { tag: "I16" },
    U16: { tag: "U16" },
    I32: { tag: "I32" },
    U32: { tag: "U32" },
    I64: { tag: "I64" },
    U64: { tag: "U64" },
    I128: { tag: "I128" },
    U128: { tag: "U128" },
    I256: { tag: "I256" },
    U256: { tag: "U256" },
    F32: { tag: "F32" },
    F64: { tag: "F64" },
    makeSerializer(ty, typespace) {
      if (ty.tag === "Ref") {
        if (!typespace)
          throw new Error("cannot serialize refs without a typespace");
        while (ty.tag === "Ref") ty = typespace.types[ty.value];
      }
      switch (ty.tag) {
        case "Product":
          return ProductType.makeSerializer(ty.value, typespace);
        case "Sum":
          return SumType.makeSerializer(ty.value, typespace);
        case "Array":
          if (ty.value.tag === "U8") {
            return serializeUint8Array;
          } else {
            const serialize = AlgebraicType.makeSerializer(ty.value, typespace);
            return (writer, value) => {
              writer.writeU32(value.length);
              for (const elem of value) {
                serialize(writer, elem);
              }
            };
          }
        default:
          return primitiveSerializers[ty.tag];
      }
    },
    /** @deprecated Use `makeSerializer` instead. */
    serializeValue(writer, ty, value, typespace) {
      AlgebraicType.makeSerializer(ty, typespace)(writer, value);
    },
    makeDeserializer(ty, typespace) {
      if (ty.tag === "Ref") {
        if (!typespace)
          throw new Error("cannot deserialize refs without a typespace");
        while (ty.tag === "Ref") ty = typespace.types[ty.value];
      }
      switch (ty.tag) {
        case "Product":
          return ProductType.makeDeserializer(ty.value, typespace);
        case "Sum":
          return SumType.makeDeserializer(ty.value, typespace);
        case "Array":
          if (ty.value.tag === "U8") {
            return deserializeUint8Array;
          } else {
            const deserialize = AlgebraicType.makeDeserializer(
              ty.value,
              typespace
            );
            return (reader) => {
              const length = reader.readU32();
              const result = Array(length);
              for (let i = 0; i < length; i++) {
                result[i] = deserialize(reader);
              }
              return result;
            };
          }
        default:
          return primitiveDeserializers[ty.tag];
      }
    },
    /** @deprecated Use `makeDeserializer` instead. */
    deserializeValue(reader, ty, typespace) {
      return AlgebraicType.makeDeserializer(ty, typespace)(reader);
    },
    /**
     * Convert a value of the algebraic type into something that can be used as a key in a map.
     * There are no guarantees about being able to order it.
     * This is only guaranteed to be comparable to other values of the same type.
     * @param value A value of the algebraic type
     * @returns Something that can be used as a key in a map.
     */
    intoMapKey: function(ty, value) {
      switch (ty.tag) {
        case "U8":
        case "U16":
        case "U32":
        case "U64":
        case "U128":
        case "U256":
        case "I8":
        case "I16":
        case "I32":
        case "I64":
        case "I128":
        case "I256":
        case "F32":
        case "F64":
        case "String":
        case "Bool":
          return value;
        case "Product":
          return ProductType.intoMapKey(ty.value, value);
        default: {
          const writer = new BinaryWriter(10);
          AlgebraicType.serializeValue(writer, ty, value);
          return writer.toBase64();
        }
      }
    }
  };
  function bindCall(f) {
    return Function.prototype.call.bind(f);
  }
  var primitiveSerializers = {
    Bool: bindCall(BinaryWriter.prototype.writeBool),
    I8: bindCall(BinaryWriter.prototype.writeI8),
    U8: bindCall(BinaryWriter.prototype.writeU8),
    I16: bindCall(BinaryWriter.prototype.writeI16),
    U16: bindCall(BinaryWriter.prototype.writeU16),
    I32: bindCall(BinaryWriter.prototype.writeI32),
    U32: bindCall(BinaryWriter.prototype.writeU32),
    I64: bindCall(BinaryWriter.prototype.writeI64),
    U64: bindCall(BinaryWriter.prototype.writeU64),
    I128: bindCall(BinaryWriter.prototype.writeI128),
    U128: bindCall(BinaryWriter.prototype.writeU128),
    I256: bindCall(BinaryWriter.prototype.writeI256),
    U256: bindCall(BinaryWriter.prototype.writeU256),
    F32: bindCall(BinaryWriter.prototype.writeF32),
    F64: bindCall(BinaryWriter.prototype.writeF64),
    String: bindCall(BinaryWriter.prototype.writeString)
  };
  Object.freeze(primitiveSerializers);
  var serializeUint8Array = bindCall(BinaryWriter.prototype.writeUInt8Array);
  var primitiveDeserializers = {
    Bool: bindCall(BinaryReader.prototype.readBool),
    I8: bindCall(BinaryReader.prototype.readI8),
    U8: bindCall(BinaryReader.prototype.readU8),
    I16: bindCall(BinaryReader.prototype.readI16),
    U16: bindCall(BinaryReader.prototype.readU16),
    I32: bindCall(BinaryReader.prototype.readI32),
    U32: bindCall(BinaryReader.prototype.readU32),
    I64: bindCall(BinaryReader.prototype.readI64),
    U64: bindCall(BinaryReader.prototype.readU64),
    I128: bindCall(BinaryReader.prototype.readI128),
    U128: bindCall(BinaryReader.prototype.readU128),
    I256: bindCall(BinaryReader.prototype.readI256),
    U256: bindCall(BinaryReader.prototype.readU256),
    F32: bindCall(BinaryReader.prototype.readF32),
    F64: bindCall(BinaryReader.prototype.readF64),
    String: bindCall(BinaryReader.prototype.readString)
  };
  Object.freeze(primitiveDeserializers);
  var deserializeUint8Array = bindCall(BinaryReader.prototype.readUInt8Array);
  var primitiveSizes = {
    Bool: 1,
    I8: 1,
    U8: 1,
    I16: 2,
    U16: 2,
    I32: 4,
    U32: 4,
    I64: 8,
    U64: 8,
    I128: 16,
    U128: 16,
    I256: 32,
    U256: 32,
    F32: 4,
    F64: 8
  };
  var fixedSizePrimitives = new Set(Object.keys(primitiveSizes));
  var isFixedSizeProduct = (ty) => ty.elements.every(
    ({ algebraicType }) => fixedSizePrimitives.has(algebraicType.tag)
  );
  var productSize = (ty) => ty.elements.reduce(
    (acc, { algebraicType }) => acc + primitiveSizes[algebraicType.tag],
    0
  );
  var primitiveJSName = {
    Bool: "Uint8",
    I8: "Int8",
    U8: "Uint8",
    I16: "Int16",
    U16: "Uint16",
    I32: "Int32",
    U32: "Uint32",
    I64: "BigInt64",
    U64: "BigUint64",
    F32: "Float32",
    F64: "Float64"
  };
  var specialProductDeserializers = {
    __time_duration_micros__: (reader) => new TimeDuration(reader.readI64()),
    __timestamp_micros_since_unix_epoch__: (reader) => new Timestamp(reader.readI64()),
    __identity__: (reader) => new Identity(reader.readU256()),
    __connection_id__: (reader) => new ConnectionId(reader.readU128()),
    __uuid__: (reader) => new Uuid(reader.readU128())
  };
  Object.freeze(specialProductDeserializers);
  var unitDeserializer = () => ({});
  var getElementInitializer = (element) => {
    let init;
    switch (element.algebraicType.tag) {
      case "String":
        init = "''";
        break;
      case "Bool":
        init = "false";
        break;
      case "I8":
      case "U8":
      case "I16":
      case "U16":
      case "I32":
      case "U32":
        init = "0";
        break;
      case "I64":
      case "U64":
      case "I128":
      case "U128":
      case "I256":
      case "U256":
        init = "0n";
        break;
      case "F32":
      case "F64":
        init = "0.0";
        break;
      default:
        init = "undefined";
    }
    return `${element.name}: ${init}`;
  };
  var ProductType = {
    makeSerializer(ty, typespace) {
      let serializer = SERIALIZERS.get(ty);
      if (serializer != null) return serializer;
      if (isFixedSizeProduct(ty)) {
        const size = productSize(ty);
        const body2 = `"use strict";
writer.expandBuffer(${size});
const view = writer.view;
${ty.elements.map(
          ({ name, algebraicType: { tag } }) => tag in primitiveJSName ? `view.set${primitiveJSName[tag]}(writer.offset, value.${name}, ${primitiveSizes[tag] > 1 ? "true" : ""});
writer.offset += ${primitiveSizes[tag]};` : `writer.write${tag}(value.${name});`
        ).join("\n")}`;
        serializer = Function("writer", "value", body2);
        SERIALIZERS.set(ty, serializer);
        return serializer;
      }
      const serializers = {};
      const body = '"use strict";\n' + ty.elements.map(
        (element) => `this.${element.name}(writer, value.${element.name});`
      ).join("\n");
      serializer = Function("writer", "value", body).bind(
        serializers
      );
      SERIALIZERS.set(ty, serializer);
      for (const { name, algebraicType } of ty.elements) {
        serializers[name] = AlgebraicType.makeSerializer(
          algebraicType,
          typespace
        );
      }
      Object.freeze(serializers);
      return serializer;
    },
    /** @deprecated Use `makeSerializer` instead. */
    serializeValue(writer, ty, value, typespace) {
      ProductType.makeSerializer(ty, typespace)(writer, value);
    },
    makeDeserializer(ty, typespace) {
      switch (ty.elements.length) {
        case 0:
          return unitDeserializer;
        case 1: {
          const fieldName = ty.elements[0].name;
          if (hasOwn(specialProductDeserializers, fieldName))
            return specialProductDeserializers[fieldName];
        }
      }
      let deserializer = DESERIALIZERS.get(ty);
      if (deserializer != null) return deserializer;
      if (isFixedSizeProduct(ty)) {
        const body = `"use strict";
const result = { ${ty.elements.map(getElementInitializer).join(", ")} };
const view = reader.view;
${ty.elements.map(
          ({ name, algebraicType: { tag } }) => tag in primitiveJSName ? tag === "Bool" ? `result.${name} = view.getUint8(reader.offset) !== 0;
reader.offset += 1;` : `result.${name} = view.get${primitiveJSName[tag]}(reader.offset, ${primitiveSizes[tag] > 1 ? "true" : ""});
reader.offset += ${primitiveSizes[tag]};` : `result.${name} = reader.read${tag}();`
        ).join("\n")}
return result;`;
        deserializer = Function("reader", body);
        DESERIALIZERS.set(ty, deserializer);
        return deserializer;
      }
      const deserializers = {};
      deserializer = Function(
        "reader",
        `"use strict";
const result = { ${ty.elements.map(getElementInitializer).join(", ")} };
${ty.elements.map(({ name }) => `result.${name} = this.${name}(reader);`).join("\n")}
return result;`
      ).bind(deserializers);
      DESERIALIZERS.set(ty, deserializer);
      for (const { name, algebraicType } of ty.elements) {
        deserializers[name] = AlgebraicType.makeDeserializer(
          algebraicType,
          typespace
        );
      }
      Object.freeze(deserializers);
      return deserializer;
    },
    /** @deprecated Use `makeDeserializer` instead. */
    deserializeValue(reader, ty, typespace) {
      return ProductType.makeDeserializer(ty, typespace)(reader);
    },
    intoMapKey(ty, value) {
      if (ty.elements.length === 1) {
        const fieldName = ty.elements[0].name;
        if (hasOwn(specialProductDeserializers, fieldName)) {
          return value[fieldName];
        }
      }
      const writer = new BinaryWriter(10);
      AlgebraicType.serializeValue(writer, AlgebraicType.Product(ty), value);
      return writer.toBase64();
    }
  };
  var SumType = {
    makeSerializer(ty, typespace) {
      if (ty.variants.length == 2 && ty.variants[0].name === "some" && ty.variants[1].name === "none") {
        const serialize = AlgebraicType.makeSerializer(
          ty.variants[0].algebraicType,
          typespace
        );
        return (writer, value) => {
          if (value !== null && value !== void 0) {
            writer.writeByte(0);
            serialize(writer, value);
          } else {
            writer.writeByte(1);
          }
        };
      } else if (ty.variants.length == 2 && ty.variants[0].name === "ok" && ty.variants[1].name === "err") {
        const serializeOk = AlgebraicType.makeSerializer(
          ty.variants[0].algebraicType,
          typespace
        );
        const serializeErr = AlgebraicType.makeSerializer(
          ty.variants[0].algebraicType,
          typespace
        );
        return (writer, value) => {
          if ("ok" in value) {
            writer.writeU8(0);
            serializeOk(writer, value.ok);
          } else if ("err" in value) {
            writer.writeU8(1);
            serializeErr(writer, value.err);
          } else {
            throw new TypeError(
              "could not serialize result: object had neither a `ok` nor an `err` field"
            );
          }
        };
      } else {
        let serializer = SERIALIZERS.get(ty);
        if (serializer != null) return serializer;
        const serializers = {};
        const body = `switch (value.tag) {
${ty.variants.map(
          ({ name }, i) => `  case ${JSON.stringify(name)}:
    writer.writeByte(${i});
    return this.${name}(writer, value.value);`
        ).join("\n")}
  default:
    throw new TypeError(
      \`Could not serialize sum type; unknown tag \${value.tag}\`
    )
}
`;
        serializer = Function("writer", "value", body).bind(
          serializers
        );
        SERIALIZERS.set(ty, serializer);
        for (const { name, algebraicType } of ty.variants) {
          serializers[name] = AlgebraicType.makeSerializer(
            algebraicType,
            typespace
          );
        }
        Object.freeze(serializers);
        return serializer;
      }
    },
    /** @deprecated Use `makeSerializer` instead. */
    serializeValue(writer, ty, value, typespace) {
      SumType.makeSerializer(ty, typespace)(writer, value);
    },
    makeDeserializer(ty, typespace) {
      if (ty.variants.length == 2 && ty.variants[0].name === "some" && ty.variants[1].name === "none") {
        const deserialize = AlgebraicType.makeDeserializer(
          ty.variants[0].algebraicType,
          typespace
        );
        return (reader) => {
          const tag = reader.readU8();
          if (tag === 0) {
            return deserialize(reader);
          } else if (tag === 1) {
            return void 0;
          } else {
            throw `Can't deserialize an option type, couldn't find ${tag} tag`;
          }
        };
      } else if (ty.variants.length == 2 && ty.variants[0].name === "ok" && ty.variants[1].name === "err") {
        const deserializeOk = AlgebraicType.makeDeserializer(
          ty.variants[0].algebraicType,
          typespace
        );
        const deserializeErr = AlgebraicType.makeDeserializer(
          ty.variants[1].algebraicType,
          typespace
        );
        return (reader) => {
          const tag = reader.readByte();
          if (tag === 0) {
            return { ok: deserializeOk(reader) };
          } else if (tag === 1) {
            return { err: deserializeErr(reader) };
          } else {
            throw `Can't deserialize a result type, couldn't find ${tag} tag`;
          }
        };
      } else {
        let deserializer = DESERIALIZERS.get(ty);
        if (deserializer != null) return deserializer;
        const deserializers = {};
        deserializer = Function(
          "reader",
          `switch (reader.readU8()) {
${ty.variants.map(
            ({ name }, i) => `case ${i}: return { tag: ${JSON.stringify(name)}, value: this.${name}(reader) };`
          ).join("\n")} }`
        ).bind(deserializers);
        DESERIALIZERS.set(ty, deserializer);
        for (const { name, algebraicType } of ty.variants) {
          deserializers[name] = AlgebraicType.makeDeserializer(
            algebraicType,
            typespace
          );
        }
        Object.freeze(deserializers);
        return deserializer;
      }
    },
    /** @deprecated Use `makeDeserializer` instead. */
    deserializeValue(reader, ty, typespace) {
      return SumType.makeDeserializer(ty, typespace)(reader);
    }
  };
  var ConnectionId = class _ConnectionId {
    /**
     * Creates a new `ConnectionId`.
     */
    constructor(data) {
      __publicField(this, "__connection_id__");
      this.__connection_id__ = coerceToBigInt(data, "ConnectionId");
    }
    /**
     * Get the algebraic type representation of the {@link ConnectionId} type.
     * @returns The algebraic type representation of the type.
     */
    static getAlgebraicType() {
      return AlgebraicType.Product({
        elements: [
          { name: "__connection_id__", algebraicType: AlgebraicType.U128 }
        ]
      });
    }
    isZero() {
      return this.__connection_id__ === BigInt(0);
    }
    static nullIfZero(addr) {
      if (addr.isZero()) {
        return null;
      } else {
        return addr;
      }
    }
    static random() {
      function randomU8() {
        return Math.floor(Math.random() * 255);
      }
      let result = BigInt(0);
      for (let i = 0; i < 16; i++) {
        result = result << BigInt(8) | BigInt(randomU8());
      }
      return new _ConnectionId(result);
    }
    /**
     * Compare two connection IDs for equality.
     */
    isEqual(other) {
      return this.__connection_id__ == other.__connection_id__;
    }
    /**
     * Check if two connection IDs are equal.
     */
    equals(other) {
      return this.isEqual(other);
    }
    /**
     * Print the connection ID as a hexadecimal string.
     */
    toHexString() {
      return u128ToHexString(this.__connection_id__);
    }
    /**
     * Convert the connection ID to a Uint8Array.
     */
    toUint8Array() {
      return u128ToUint8Array(this.__connection_id__);
    }
    /**
     * Parse a connection ID from a hexadecimal string.
     */
    static fromString(str) {
      return new _ConnectionId(hexStringToU128(str));
    }
    static fromStringOrNull(str) {
      const addr = _ConnectionId.fromString(str);
      if (addr.isZero()) {
        return null;
      } else {
        return addr;
      }
    }
  };
  var SenderError = class extends Error {
    constructor(message) {
      super(message);
    }
    get name() {
      return "SenderError";
    }
  };
  var InternalError = class extends Error {
    constructor(message) {
      super(message);
    }
    get name() {
      return "InternalError";
    }
  };
  var ScheduleAt = {
    interval(value) {
      return Interval(value);
    },
    time(value) {
      return Time(value);
    },
    getAlgebraicType() {
      return AlgebraicType.Sum({
        variants: [
          {
            name: "Interval",
            algebraicType: TimeDuration.getAlgebraicType()
          },
          { name: "Time", algebraicType: Timestamp.getAlgebraicType() }
        ]
      });
    },
    isScheduleAt(algebraicType) {
      if (algebraicType.tag !== "Sum") {
        return false;
      }
      const variants = algebraicType.value.variants;
      if (variants.length !== 2) {
        return false;
      }
      const intervalVariant = variants.find((v) => v.name === "Interval");
      const timeVariant = variants.find((v) => v.name === "Time");
      if (!intervalVariant || !timeVariant) {
        return false;
      }
      return TimeDuration.isTimeDuration(intervalVariant.algebraicType) && Timestamp.isTimestamp(timeVariant.algebraicType);
    }
  };
  var Interval = (micros) => ({
    tag: "Interval",
    value: new TimeDuration(micros)
  });
  var Time = (microsSinceUnixEpoch) => ({
    tag: "Time",
    value: new Timestamp(microsSinceUnixEpoch)
  });
  var schedule_at_default = ScheduleAt;
  var Option = {
    getAlgebraicType(innerType) {
      return AlgebraicType.Sum({
        variants: [
          { name: "some", algebraicType: innerType },
          {
            name: "none",
            algebraicType: AlgebraicType.Product({ elements: [] })
          }
        ]
      });
    }
  };
  var Result = {
    getAlgebraicType(okType, errType) {
      return AlgebraicType.Sum({
        variants: [
          { name: "ok", algebraicType: okType },
          { name: "err", algebraicType: errType }
        ]
      });
    }
  };
  var QueryBrand = Symbol("QueryBrand");
  var isRowTypedQuery = (val) => !!val && typeof val === "object" && QueryBrand in val;
  function toSql(q) {
    return q.toSql();
  }
  var SemijoinImpl = (_e = QueryBrand, _f = class {
    constructor(sourceQuery, filterQuery, joinCondition) {
      __publicField(this, _e, true);
      __publicField(this, "type", "semijoin");
      this.sourceQuery = sourceQuery;
      this.filterQuery = filterQuery;
      this.joinCondition = joinCondition;
      if (sourceQuery.table.sourceName === filterQuery.table.sourceName) {
        throw new Error("Cannot semijoin a table to itself");
      }
    }
    build() {
      return this;
    }
    where(predicate) {
      const nextSourceQuery = this.sourceQuery.where(predicate);
      return new _f(
        nextSourceQuery,
        this.filterQuery,
        this.joinCondition
      );
    }
    toSql() {
      const left = this.filterQuery;
      const right = this.sourceQuery;
      const leftTable = quoteIdentifier(left.table.sourceName);
      const rightTable = quoteIdentifier(right.table.sourceName);
      let sql = `SELECT ${rightTable}.* FROM ${leftTable} JOIN ${rightTable} ON ${booleanExprToSql(this.joinCondition)}`;
      const clauses = [];
      if (left.whereClause) {
        clauses.push(booleanExprToSql(left.whereClause));
      }
      if (right.whereClause) {
        clauses.push(booleanExprToSql(right.whereClause));
      }
      if (clauses.length > 0) {
        const whereSql = clauses.length === 1 ? clauses[0] : clauses.map(wrapInParens).join(" AND ");
        sql += ` WHERE ${whereSql}`;
      }
      return sql;
    }
  }, _f);
  var FromBuilder = (_g = QueryBrand, _h = class {
    constructor(table2, whereClause) {
      __publicField(this, _g, true);
      this.table = table2;
      this.whereClause = whereClause;
    }
    where(predicate) {
      const newCondition = normalizePredicateExpr(predicate(this.table.cols));
      const nextWhere = this.whereClause ? this.whereClause.and(newCondition) : newCondition;
      return new _h(this.table, nextWhere);
    }
    rightSemijoin(right, on) {
      const sourceQuery = new _h(right);
      const joinCondition = on(
        this.table.indexedCols,
        right.indexedCols
      );
      return new SemijoinImpl(sourceQuery, this, joinCondition);
    }
    leftSemijoin(right, on) {
      const filterQuery = new _h(right);
      const joinCondition = on(
        this.table.indexedCols,
        right.indexedCols
      );
      return new SemijoinImpl(this, filterQuery, joinCondition);
    }
    toSql() {
      return renderSelectSqlWithJoins(this.table, this.whereClause);
    }
    build() {
      return this;
    }
  }, _h);
  var TableRefImpl = (_i = QueryBrand, class {
    constructor(tableDef) {
      __publicField(this, _i, true);
      __publicField(this, "type", "table");
      __publicField(this, "sourceName");
      __publicField(this, "accessorName");
      __publicField(this, "cols");
      __publicField(this, "indexedCols");
      __publicField(this, "tableDef");
      this.sourceName = tableDef.sourceName;
      this.accessorName = tableDef.accessorName;
      this.cols = createRowExpr(tableDef);
      this.indexedCols = this.cols;
      this.tableDef = tableDef;
      Object.freeze(this);
    }
    // Delegate UntypedTableDef properties from tableDef so this can be used as a table def.
    get columns() {
      return this.tableDef.columns;
    }
    get indexes() {
      return this.tableDef.indexes;
    }
    get rowType() {
      return this.tableDef.rowType;
    }
    get constraints() {
      return this.tableDef.constraints;
    }
    asFrom() {
      return new FromBuilder(this);
    }
    rightSemijoin(other, on) {
      return this.asFrom().rightSemijoin(other, on);
    }
    leftSemijoin(other, on) {
      return this.asFrom().leftSemijoin(other, on);
    }
    build() {
      return this.asFrom().build();
    }
    toSql() {
      return this.asFrom().toSql();
    }
    where(predicate) {
      return this.asFrom().where(predicate);
    }
  });
  function createTableRefFromDef(tableDef) {
    return new TableRefImpl(tableDef);
  }
  function makeQueryBuilder(schema2) {
    const qb = /* @__PURE__ */ Object.create(null);
    for (const table2 of Object.values(schema2.tables)) {
      const ref = createTableRefFromDef(
        table2
      );
      qb[table2.accessorName] = ref;
    }
    return Object.freeze(qb);
  }
  function createRowExpr(tableDef) {
    const row = {};
    for (const columnName of Object.keys(tableDef.columns)) {
      const columnBuilder = tableDef.columns[columnName];
      const column = new ColumnExpression(
        tableDef.sourceName,
        columnName,
        columnBuilder.typeBuilder.algebraicType,
        columnBuilder.columnMetadata.name
      );
      row[columnName] = Object.freeze(column);
    }
    return Object.freeze(row);
  }
  function renderSelectSqlWithJoins(table2, where, extraClauses = []) {
    const quotedTable = quoteIdentifier(table2.sourceName);
    const sql = `SELECT * FROM ${quotedTable}`;
    const clauses = [];
    if (where) clauses.push(booleanExprToSql(where));
    clauses.push(...extraClauses);
    if (clauses.length === 0) return sql;
    const whereSql = clauses.length === 1 ? clauses[0] : clauses.map(wrapInParens).join(" AND ");
    return `${sql} WHERE ${whereSql}`;
  }
  var ColumnExpression = class {
    constructor(table2, column, spacetimeType, columnName) {
      __publicField(this, "type", "column");
      // This is the column accessor
      __publicField(this, "column");
      // The name of the column in the database.
      __publicField(this, "columnName");
      __publicField(this, "table");
      // phantom: actual runtime value is undefined
      __publicField(this, "tsValueType");
      __publicField(this, "spacetimeType");
      this.table = table2;
      this.column = column;
      this.columnName = columnName || column;
      this.spacetimeType = spacetimeType;
    }
    eq(x) {
      return new BooleanExpr({
        type: "eq",
        left: this,
        right: normalizeValue(x)
      });
    }
    ne(x) {
      return new BooleanExpr({
        type: "ne",
        left: this,
        right: normalizeValue(x)
      });
    }
    lt(x) {
      return new BooleanExpr({
        type: "lt",
        left: this,
        right: normalizeValue(x)
      });
    }
    lte(x) {
      return new BooleanExpr({
        type: "lte",
        left: this,
        right: normalizeValue(x)
      });
    }
    gt(x) {
      return new BooleanExpr({
        type: "gt",
        left: this,
        right: normalizeValue(x)
      });
    }
    gte(x) {
      return new BooleanExpr({
        type: "gte",
        left: this,
        right: normalizeValue(x)
      });
    }
  };
  function literal(value) {
    return { type: "literal", value };
  }
  function normalizeValue(val) {
    if (val.type === "literal")
      return val;
    if (typeof val === "object" && val != null && "type" in val && val.type === "column") {
      return val;
    }
    return literal(val);
  }
  function normalizePredicateExpr(value) {
    if (value instanceof BooleanExpr) return value;
    if (typeof value === "boolean") {
      return new BooleanExpr({
        type: "eq",
        left: literal(value),
        right: literal(true)
      });
    }
    return new BooleanExpr({
      type: "eq",
      left: value,
      right: literal(true)
    });
  }
  var BooleanExpr = class _BooleanExpr {
    constructor(data) {
      this.data = data;
    }
    and(other) {
      return new _BooleanExpr({
        type: "and",
        clauses: [this.data, other.data]
      });
    }
    or(other) {
      return new _BooleanExpr({
        type: "or",
        clauses: [this.data, other.data]
      });
    }
    not() {
      return new _BooleanExpr({ type: "not", clause: this.data });
    }
  };
  function booleanExprToSql(expr, tableAlias) {
    const data = expr instanceof BooleanExpr ? expr.data : expr;
    switch (data.type) {
      case "eq":
        return `${valueExprToSql(data.left)} = ${valueExprToSql(data.right)}`;
      case "ne":
        return `${valueExprToSql(data.left)} <> ${valueExprToSql(data.right)}`;
      case "gt":
        return `${valueExprToSql(data.left)} > ${valueExprToSql(data.right)}`;
      case "gte":
        return `${valueExprToSql(data.left)} >= ${valueExprToSql(data.right)}`;
      case "lt":
        return `${valueExprToSql(data.left)} < ${valueExprToSql(data.right)}`;
      case "lte":
        return `${valueExprToSql(data.left)} <= ${valueExprToSql(data.right)}`;
      case "and":
        return data.clauses.map((c) => booleanExprToSql(c)).map(wrapInParens).join(" AND ");
      case "or":
        return data.clauses.map((c) => booleanExprToSql(c)).map(wrapInParens).join(" OR ");
      case "not":
        return `NOT ${wrapInParens(booleanExprToSql(data.clause))}`;
    }
  }
  function wrapInParens(sql) {
    return `(${sql})`;
  }
  function valueExprToSql(expr, tableAlias) {
    if (isLiteralExpr(expr)) {
      return literalValueToSql(expr.value);
    }
    const table2 = expr.table;
    return `${quoteIdentifier(table2)}.${quoteIdentifier(expr.columnName)}`;
  }
  function literalValueToSql(value) {
    if (value === null || value === void 0) {
      return "NULL";
    }
    if (value instanceof Identity || value instanceof ConnectionId || value instanceof Uuid) {
      return `0x${value.toHexString()}`;
    }
    if (value instanceof Timestamp) {
      return `'${value.toISOString()}'`;
    }
    switch (typeof value) {
      case "number":
      case "bigint":
        return String(value);
      case "boolean":
        return value ? "TRUE" : "FALSE";
      case "string":
        return `'${value.replace(/'/g, "''")}'`;
      default:
        return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
  }
  function quoteIdentifier(name) {
    return `"${name.replace(/"/g, '""')}"`;
  }
  function isLiteralExpr(expr) {
    return expr.type === "literal";
  }
  function set(x, t2) {
    return { ...x, ...t2 };
  }
  var TypeBuilder = class {
    constructor(algebraicType) {
      /**
       * The TypeScript phantom type. This is not stored at runtime,
       * but is visible to the compiler
       */
      __publicField(this, "type");
      /**
       * The SpacetimeDB algebraic type (run‑time value). In addition to storing
       * the runtime representation of the `AlgebraicType`, it also captures
       * the TypeScript type information of the `AlgebraicType`. That is to say
       * the value is not merely an `AlgebraicType`, but is constructed to be
       * the corresponding concrete `AlgebraicType` for the TypeScript type `Type`.
       *
       * e.g. `string` corresponds to `AlgebraicType.String`
       */
      __publicField(this, "algebraicType");
      this.algebraicType = algebraicType;
    }
    optional() {
      return new OptionBuilder(this);
    }
    serialize(writer, value) {
      const serialize = this.serialize = AlgebraicType.makeSerializer(
        this.algebraicType
      );
      serialize(writer, value);
    }
    deserialize(reader) {
      const deserialize = this.deserialize = AlgebraicType.makeDeserializer(
        this.algebraicType
      );
      return deserialize(reader);
    }
  };
  var U8Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.U8);
    }
    index(algorithm = "btree") {
      return new U8ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new U8ColumnBuilder(this, set(defaultMetadata, { isUnique: true }));
    }
    primaryKey() {
      return new U8ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new U8ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new U8ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new U8ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var U16Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.U16);
    }
    index(algorithm = "btree") {
      return new U16ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new U16ColumnBuilder(this, set(defaultMetadata, { isUnique: true }));
    }
    primaryKey() {
      return new U16ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new U16ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new U16ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new U16ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var U32Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.U32);
    }
    index(algorithm = "btree") {
      return new U32ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new U32ColumnBuilder(this, set(defaultMetadata, { isUnique: true }));
    }
    primaryKey() {
      return new U32ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new U32ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new U32ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new U32ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var U64Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.U64);
    }
    index(algorithm = "btree") {
      return new U64ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new U64ColumnBuilder(this, set(defaultMetadata, { isUnique: true }));
    }
    primaryKey() {
      return new U64ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new U64ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new U64ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new U64ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var U128Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.U128);
    }
    index(algorithm = "btree") {
      return new U128ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new U128ColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new U128ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new U128ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new U128ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new U128ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var U256Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.U256);
    }
    index(algorithm = "btree") {
      return new U256ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new U256ColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new U256ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new U256ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new U256ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new U256ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var I8Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.I8);
    }
    index(algorithm = "btree") {
      return new I8ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new I8ColumnBuilder(this, set(defaultMetadata, { isUnique: true }));
    }
    primaryKey() {
      return new I8ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new I8ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new I8ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new I8ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var I16Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.I16);
    }
    index(algorithm = "btree") {
      return new I16ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new I16ColumnBuilder(this, set(defaultMetadata, { isUnique: true }));
    }
    primaryKey() {
      return new I16ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new I16ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new I16ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new I16ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var I32Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.I32);
    }
    index(algorithm = "btree") {
      return new I32ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new I32ColumnBuilder(this, set(defaultMetadata, { isUnique: true }));
    }
    primaryKey() {
      return new I32ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new I32ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new I32ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new I32ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var I64Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.I64);
    }
    index(algorithm = "btree") {
      return new I64ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new I64ColumnBuilder(this, set(defaultMetadata, { isUnique: true }));
    }
    primaryKey() {
      return new I64ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new I64ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new I64ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new I64ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var I128Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.I128);
    }
    index(algorithm = "btree") {
      return new I128ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new I128ColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new I128ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new I128ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new I128ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new I128ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var I256Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.I256);
    }
    index(algorithm = "btree") {
      return new I256ColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new I256ColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new I256ColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new I256ColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new I256ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new I256ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var F32Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.F32);
    }
    default(value) {
      return new F32ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new F32ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var F64Builder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.F64);
    }
    default(value) {
      return new F64ColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new F64ColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var BoolBuilder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.Bool);
    }
    index(algorithm = "btree") {
      return new BoolColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new BoolColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new BoolColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new BoolColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new BoolColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var StringBuilder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.String);
    }
    index(algorithm = "btree") {
      return new StringColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new StringColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new StringColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new StringColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new StringColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var ArrayBuilder = class extends TypeBuilder {
    constructor(element) {
      super(AlgebraicType.Array(element.algebraicType));
      __publicField(this, "element");
      this.element = element;
    }
    default(value) {
      return new ArrayColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new ArrayColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var ByteArrayBuilder = class extends TypeBuilder {
    constructor() {
      super(AlgebraicType.Array(AlgebraicType.U8));
    }
    default(value) {
      return new ByteArrayColumnBuilder(
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new ByteArrayColumnBuilder(set(defaultMetadata, { name }));
    }
  };
  var OptionBuilder = class extends TypeBuilder {
    constructor(value) {
      super(Option.getAlgebraicType(value.algebraicType));
      __publicField(this, "value");
      this.value = value;
    }
    default(value) {
      return new OptionColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new OptionColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var ProductBuilder = class extends TypeBuilder {
    constructor(elements, name) {
      function elementsArrayFromElementsObj(obj) {
        return Object.keys(obj).map((key) => ({
          name: key,
          // Lazily resolve the underlying object's algebraicType.
          // This will call obj[key].algebraicType only when someone
          // actually reads this property.
          get algebraicType() {
            return obj[key].algebraicType;
          }
        }));
      }
      super(
        AlgebraicType.Product({
          elements: elementsArrayFromElementsObj(elements)
        })
      );
      __publicField(this, "typeName");
      __publicField(this, "elements");
      this.typeName = name;
      this.elements = elements;
    }
    default(value) {
      return new ProductColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new ProductColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var ResultBuilder = class extends TypeBuilder {
    constructor(ok, err) {
      super(Result.getAlgebraicType(ok.algebraicType, err.algebraicType));
      __publicField(this, "ok");
      __publicField(this, "err");
      this.ok = ok;
      this.err = err;
    }
    default(value) {
      return new ResultColumnBuilder(this, set(defaultMetadata, { defaultValue: value }));
    }
  };
  var UnitBuilder = class extends TypeBuilder {
    constructor() {
      super({ tag: "Product", value: { elements: [] } });
    }
  };
  var RowBuilder = class extends TypeBuilder {
    constructor(row, name) {
      const mappedRow = Object.fromEntries(
        Object.entries(row).map(([colName, builder]) => [
          colName,
          builder instanceof ColumnBuilder ? builder : new ColumnBuilder(builder, {})
        ])
      );
      const elements = Object.keys(mappedRow).map((name2) => ({
        name: name2,
        get algebraicType() {
          return mappedRow[name2].typeBuilder.algebraicType;
        }
      }));
      super(AlgebraicType.Product({ elements }));
      __publicField(this, "row");
      __publicField(this, "typeName");
      this.row = mappedRow;
      this.typeName = name;
    }
  };
  var SumBuilderImpl = class extends TypeBuilder {
    constructor(variants, name) {
      function variantsArrayFromVariantsObj(variants2) {
        return Object.keys(variants2).map((key) => ({
          name: key,
          // Lazily resolve the underlying object's algebraicType.
          // This will call obj[key].algebraicType only when someone
          // actually reads this property.
          get algebraicType() {
            return variants2[key].algebraicType;
          }
        }));
      }
      super(
        AlgebraicType.Sum({
          variants: variantsArrayFromVariantsObj(variants)
        })
      );
      __publicField(this, "variants");
      __publicField(this, "typeName");
      this.variants = variants;
      this.typeName = name;
      for (const key of Object.keys(variants)) {
        const desc = Object.getOwnPropertyDescriptor(variants, key);
        const isAccessor = !!desc && (typeof desc.get === "function" || typeof desc.set === "function");
        let isUnit2 = false;
        if (!isAccessor) {
          const variant = variants[key];
          isUnit2 = variant instanceof UnitBuilder;
        }
        if (isUnit2) {
          const constant = this.create(key);
          Object.defineProperty(this, key, {
            value: constant,
            writable: false,
            enumerable: true,
            configurable: false
          });
        } else {
          const fn = ((value) => this.create(key, value));
          Object.defineProperty(this, key, {
            value: fn,
            writable: false,
            enumerable: true,
            configurable: false
          });
        }
      }
    }
    create(tag, value) {
      return value === void 0 ? { tag } : { tag, value };
    }
    default(value) {
      return new SumColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new SumColumnBuilder(this, set(defaultMetadata, { name }));
    }
    index(algorithm = "btree") {
      return new SumColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    primaryKey() {
      return new SumColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
  };
  var SumBuilder = SumBuilderImpl;
  var SimpleSumBuilderImpl = class extends SumBuilderImpl {
    index(algorithm = "btree") {
      return new SimpleSumColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    primaryKey() {
      return new SimpleSumColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
  };
  var ScheduleAtBuilder = class extends TypeBuilder {
    constructor() {
      super(schedule_at_default.getAlgebraicType());
    }
    default(value) {
      return new ScheduleAtColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new ScheduleAtColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var IdentityBuilder = class extends TypeBuilder {
    constructor() {
      super(Identity.getAlgebraicType());
    }
    index(algorithm = "btree") {
      return new IdentityColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new IdentityColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new IdentityColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new IdentityColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new IdentityColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new IdentityColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var ConnectionIdBuilder = class extends TypeBuilder {
    constructor() {
      super(ConnectionId.getAlgebraicType());
    }
    index(algorithm = "btree") {
      return new ConnectionIdColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new ConnectionIdColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new ConnectionIdColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new ConnectionIdColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new ConnectionIdColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new ConnectionIdColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var TimestampBuilder = class extends TypeBuilder {
    constructor() {
      super(Timestamp.getAlgebraicType());
    }
    index(algorithm = "btree") {
      return new TimestampColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new TimestampColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new TimestampColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new TimestampColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new TimestampColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new TimestampColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var TimeDurationBuilder = class extends TypeBuilder {
    constructor() {
      super(TimeDuration.getAlgebraicType());
    }
    index(algorithm = "btree") {
      return new TimeDurationColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new TimeDurationColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new TimeDurationColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new TimeDurationColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new TimeDurationColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new TimeDurationColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var UuidBuilder = class extends TypeBuilder {
    constructor() {
      super(Uuid.getAlgebraicType());
    }
    index(algorithm = "btree") {
      return new UuidColumnBuilder(
        this,
        set(defaultMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new UuidColumnBuilder(
        this,
        set(defaultMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new UuidColumnBuilder(
        this,
        set(defaultMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new UuidColumnBuilder(
        this,
        set(defaultMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new UuidColumnBuilder(
        this,
        set(defaultMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new UuidColumnBuilder(this, set(defaultMetadata, { name }));
    }
  };
  var defaultMetadata = {};
  var ColumnBuilder = class {
    constructor(typeBuilder, metadata) {
      __publicField(this, "typeBuilder");
      __publicField(this, "columnMetadata");
      this.typeBuilder = typeBuilder;
      this.columnMetadata = metadata;
    }
    serialize(writer, value) {
      this.typeBuilder.serialize(writer, value);
    }
    deserialize(reader) {
      return this.typeBuilder.deserialize(reader);
    }
  };
  var U8ColumnBuilder = class _U8ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _U8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _U8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _U8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _U8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _U8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _U8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var U16ColumnBuilder = class _U16ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _U16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _U16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _U16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _U16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _U16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _U16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var U32ColumnBuilder = class _U32ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _U32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _U32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _U32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _U32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _U32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _U32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var U64ColumnBuilder = class _U64ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _U64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _U64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _U64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _U64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _U64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _U64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var U128ColumnBuilder = class _U128ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _U128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _U128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _U128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _U128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _U128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _U128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var U256ColumnBuilder = class _U256ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _U256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _U256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _U256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _U256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _U256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _U256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var I8ColumnBuilder = class _I8ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _I8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _I8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _I8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _I8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _I8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _I8ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var I16ColumnBuilder = class _I16ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _I16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _I16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _I16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _I16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _I16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _I16ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var I32ColumnBuilder = class _I32ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _I32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _I32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _I32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _I32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _I32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _I32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var I64ColumnBuilder = class _I64ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _I64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _I64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _I64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _I64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _I64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _I64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var I128ColumnBuilder = class _I128ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _I128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _I128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _I128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _I128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _I128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _I128ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var I256ColumnBuilder = class _I256ColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _I256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _I256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _I256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    autoInc() {
      return new _I256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isAutoIncrement: true })
      );
    }
    default(value) {
      return new _I256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _I256ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var F32ColumnBuilder = class _F32ColumnBuilder extends ColumnBuilder {
    default(value) {
      return new _F32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _F32ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var F64ColumnBuilder = class _F64ColumnBuilder extends ColumnBuilder {
    default(value) {
      return new _F64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _F64ColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var BoolColumnBuilder = class _BoolColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _BoolColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _BoolColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _BoolColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new _BoolColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _BoolColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var StringColumnBuilder = class _StringColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _StringColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _StringColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _StringColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new _StringColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _StringColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var ArrayColumnBuilder = class _ArrayColumnBuilder extends ColumnBuilder {
    default(value) {
      return new _ArrayColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _ArrayColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var ByteArrayColumnBuilder = class _ByteArrayColumnBuilder extends ColumnBuilder {
    constructor(metadata) {
      super(new TypeBuilder(AlgebraicType.Array(AlgebraicType.U8)), metadata);
    }
    default(value) {
      return new _ByteArrayColumnBuilder(
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _ByteArrayColumnBuilder(set(this.columnMetadata, { name }));
    }
  };
  var OptionColumnBuilder = class _OptionColumnBuilder extends ColumnBuilder {
    default(value) {
      return new _OptionColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
    name(name) {
      return new _OptionColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var ResultColumnBuilder = class _ResultColumnBuilder extends ColumnBuilder {
    constructor(typeBuilder, metadata) {
      super(typeBuilder, metadata);
    }
    default(value) {
      return new _ResultColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, {
          defaultValue: value
        })
      );
    }
  };
  var ProductColumnBuilder = class _ProductColumnBuilder extends ColumnBuilder {
    default(value) {
      return new _ProductColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _ProductColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var SumColumnBuilder = class _SumColumnBuilder extends ColumnBuilder {
    default(value) {
      return new _SumColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _SumColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
    index(algorithm = "btree") {
      return new _SumColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    primaryKey() {
      return new _SumColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
  };
  var SimpleSumColumnBuilder = class _SimpleSumColumnBuilder extends SumColumnBuilder {
    index(algorithm = "btree") {
      return new _SimpleSumColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    primaryKey() {
      return new _SimpleSumColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
  };
  var ScheduleAtColumnBuilder = class _ScheduleAtColumnBuilder extends ColumnBuilder {
    default(value) {
      return new _ScheduleAtColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _ScheduleAtColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var IdentityColumnBuilder = class _IdentityColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _IdentityColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _IdentityColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _IdentityColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new _IdentityColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _IdentityColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var ConnectionIdColumnBuilder = class _ConnectionIdColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _ConnectionIdColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _ConnectionIdColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _ConnectionIdColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new _ConnectionIdColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _ConnectionIdColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var TimestampColumnBuilder = class _TimestampColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _TimestampColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _TimestampColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _TimestampColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new _TimestampColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _TimestampColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var TimeDurationColumnBuilder = class _TimeDurationColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _TimeDurationColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _TimeDurationColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _TimeDurationColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new _TimeDurationColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _TimeDurationColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var UuidColumnBuilder = class _UuidColumnBuilder extends ColumnBuilder {
    index(algorithm = "btree") {
      return new _UuidColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { indexType: algorithm })
      );
    }
    unique() {
      return new _UuidColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isUnique: true })
      );
    }
    primaryKey() {
      return new _UuidColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { isPrimaryKey: true })
      );
    }
    default(value) {
      return new _UuidColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { defaultValue: value })
      );
    }
    name(name) {
      return new _UuidColumnBuilder(
        this.typeBuilder,
        set(this.columnMetadata, { name })
      );
    }
  };
  var RefBuilder = class extends TypeBuilder {
    constructor(ref) {
      super(AlgebraicType.Ref(ref));
      __publicField(this, "ref");
      /** The phantom type of the pointee of this ref. */
      __publicField(this, "__spacetimeType");
      this.ref = ref;
    }
  };
  var enumImpl = ((nameOrObj, maybeObj) => {
    let obj = nameOrObj;
    let name = void 0;
    if (typeof nameOrObj === "string") {
      if (!maybeObj) {
        throw new TypeError(
          "When providing a name, you must also provide the variants object or array."
        );
      }
      obj = maybeObj;
      name = nameOrObj;
    }
    if (Array.isArray(obj)) {
      const simpleVariantsObj = {};
      for (const variant of obj) {
        simpleVariantsObj[variant] = new UnitBuilder();
      }
      return new SimpleSumBuilderImpl(simpleVariantsObj, name);
    }
    return new SumBuilder(obj, name);
  });
  var t = {
    /**
     * Creates a new `Bool` {@link AlgebraicType} to be used in table definitions
     * Represented as `boolean` in TypeScript.
     * @returns A new {@link BoolBuilder} instance
     */
    bool: () => new BoolBuilder(),
    /**
     * Creates a new `String` {@link AlgebraicType} to be used in table definitions
     * Represented as `string` in TypeScript.
     * @returns A new {@link StringBuilder} instance
     */
    string: () => new StringBuilder(),
    /**
     * Creates a new `F64` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link F64Builder} instance
     */
    number: () => new F64Builder(),
    /**
     * Creates a new `I8` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link I8Builder} instance
     */
    i8: () => new I8Builder(),
    /**
     * Creates a new `U8` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link U8Builder} instance
     */
    u8: () => new U8Builder(),
    /**
     * Creates a new `I16` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link I16Builder} instance
     */
    i16: () => new I16Builder(),
    /**
     * Creates a new `U16` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link U16Builder} instance
     */
    u16: () => new U16Builder(),
    /**
     * Creates a new `I32` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link I32Builder} instance
     */
    i32: () => new I32Builder(),
    /**
     * Creates a new `U32` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link U32Builder} instance
     */
    u32: () => new U32Builder(),
    /**
     * Creates a new `I64` {@link AlgebraicType} to be used in table definitions
     * Represented as `bigint` in TypeScript.
     * @returns A new {@link I64Builder} instance
     */
    i64: () => new I64Builder(),
    /**
     * Creates a new `U64` {@link AlgebraicType} to be used in table definitions
     * Represented as `bigint` in TypeScript.
     * @returns A new {@link U64Builder} instance
     */
    u64: () => new U64Builder(),
    /**
     * Creates a new `I128` {@link AlgebraicType} to be used in table definitions
     * Represented as `bigint` in TypeScript.
     * @returns A new {@link I128Builder} instance
     */
    i128: () => new I128Builder(),
    /**
     * Creates a new `U128` {@link AlgebraicType} to be used in table definitions
     * Represented as `bigint` in TypeScript.
     * @returns A new {@link U128Builder} instance
     */
    u128: () => new U128Builder(),
    /**
     * Creates a new `I256` {@link AlgebraicType} to be used in table definitions
     * Represented as `bigint` in TypeScript.
     * @returns A new {@link I256Builder} instance
     */
    i256: () => new I256Builder(),
    /**
     * Creates a new `U256` {@link AlgebraicType} to be used in table definitions
     * Represented as `bigint` in TypeScript.
     * @returns A new {@link U256Builder} instance
     */
    u256: () => new U256Builder(),
    /**
     * Creates a new `F32` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link F32Builder} instance
     */
    f32: () => new F32Builder(),
    /**
     * Creates a new `F64` {@link AlgebraicType} to be used in table definitions
     * Represented as `number` in TypeScript.
     * @returns A new {@link F64Builder} instance
     */
    f64: () => new F64Builder(),
    /**
     * Creates a new `Product` {@link AlgebraicType} to be used in table definitions. Product types in SpacetimeDB
     * are essentially the same as objects in JavaScript/TypeScript.
     * Properties of the object must also be {@link TypeBuilder}s.
     * Represented as an object with specific properties in TypeScript.
     *
     * @param name (optional) A display name for the product type. If omitted, an anonymous product type is created.
     * @param obj The object defining the properties of the type, whose property
     * values must be {@link TypeBuilder}s.
     * @returns A new {@link ProductBuilder} instance.
     */
    object: ((nameOrObj, maybeObj) => {
      if (typeof nameOrObj === "string") {
        if (!maybeObj) {
          throw new TypeError(
            "When providing a name, you must also provide the object."
          );
        }
        return new ProductBuilder(maybeObj, nameOrObj);
      }
      return new ProductBuilder(nameOrObj, void 0);
    }),
    /**
     * Creates a new `Row` {@link AlgebraicType} to be used in table definitions. Row types in SpacetimeDB
     * are similar to `Product` types, but are specifically used to define the schema of a table row.
     * Properties of the object must also be {@link TypeBuilder} or {@link ColumnBuilder}s.
     *
     * You can represent a `Row` as either a {@link RowObj} or an {@link RowBuilder} type when
     * defining a table schema.
     *
     * The {@link RowBuilder} type is useful when you want to create a type which can be used anywhere
     * a {@link TypeBuilder} is accepted, such as in nested objects or arrays, or as the argument
     * to a scheduled function.
     *
     * @param obj The object defining the properties of the row, whose property
     * values must be {@link TypeBuilder}s or {@link ColumnBuilder}s.
     * @returns A new {@link RowBuilder} instance
     */
    row: ((nameOrObj, maybeObj) => {
      const [obj, name] = typeof nameOrObj === "string" ? [maybeObj, nameOrObj] : [nameOrObj, void 0];
      return new RowBuilder(obj, name);
    }),
    /**
     * Creates a new `Array` {@link AlgebraicType} to be used in table definitions.
     * Represented as an array in TypeScript.
     * @param element The element type of the array, which must be a `TypeBuilder`.
     * @returns A new {@link ArrayBuilder} instance
     */
    array(e) {
      return new ArrayBuilder(e);
    },
    enum: enumImpl,
    /**
     * This is a special helper function for conveniently creating `Product` type columns with no fields.
     *
     * @returns A new {@link ProductBuilder} instance with no fields.
     */
    unit() {
      return new UnitBuilder();
    },
    /**
     * Creates a lazily-evaluated {@link TypeBuilder}. This is useful for creating
     * recursive types, such as a tree or linked list.
     * @param thunk A function that returns a {@link TypeBuilder}.
     * @returns A proxy {@link TypeBuilder} that evaluates the thunk on first access.
     */
    lazy(thunk) {
      let cached = null;
      const get = () => cached ?? (cached = thunk());
      const proxy = new Proxy({}, {
        get(_t, prop, recv) {
          const target = get();
          const val = Reflect.get(target, prop, recv);
          return typeof val === "function" ? val.bind(target) : val;
        },
        set(_t, prop, value, recv) {
          return Reflect.set(get(), prop, value, recv);
        },
        has(_t, prop) {
          return prop in get();
        },
        ownKeys() {
          return Reflect.ownKeys(get());
        },
        getOwnPropertyDescriptor(_t, prop) {
          return Object.getOwnPropertyDescriptor(get(), prop);
        },
        getPrototypeOf() {
          return Object.getPrototypeOf(get());
        }
      });
      return proxy;
    },
    /**
     * This is a special helper function for conveniently creating {@link ScheduleAt} type columns.
     * @returns A new ColumnBuilder instance with the {@link ScheduleAt} type.
     */
    scheduleAt: () => {
      return new ScheduleAtBuilder();
    },
    /**
     * This is a convenience method for creating a column with the {@link Option} type.
     * You can create a column of the same type by constructing an enum with a `some` and `none` variant.
     * @param value The type of the value contained in the `some` variant of the `Option`.
     * @returns A new {@link OptionBuilder} instance with the {@link Option} type.
     */
    option(value) {
      return new OptionBuilder(value);
    },
    /**
     * This is a convenience method for creating a column with the {@link Result} type.
     * You can create a column of the same type by constructing an enum with an `ok` and `err` variant.
     * @param ok The type of the value contained in the `ok` variant of the `Result`.
     * @param err The type of the value contained in the `err` variant of the `Result`.
     * @returns A new {@link ResultBuilder} instance with the {@link Result} type.
     */
    result(ok, err) {
      return new ResultBuilder(ok, err);
    },
    /**
     * This is a convenience method for creating a column with the {@link Identity} type.
     * You can create a column of the same type by constructing an `object` with a single `__identity__` element.
     * @returns A new {@link TypeBuilder} instance with the {@link Identity} type.
     */
    identity: () => {
      return new IdentityBuilder();
    },
    /**
     * This is a convenience method for creating a column with the {@link ConnectionId} type.
     * You can create a column of the same type by constructing an `object` with a single `__connection_id__` element.
     * @returns A new {@link TypeBuilder} instance with the {@link ConnectionId} type.
     */
    connectionId: () => {
      return new ConnectionIdBuilder();
    },
    /**
     * This is a convenience method for creating a column with the {@link Timestamp} type.
     * You can create a column of the same type by constructing an `object` with a single `__timestamp_micros_since_unix_epoch__` element.
     * @returns A new {@link TypeBuilder} instance with the {@link Timestamp} type.
     */
    timestamp: () => {
      return new TimestampBuilder();
    },
    /**
     * This is a convenience method for creating a column with the {@link TimeDuration} type.
     * You can create a column of the same type by constructing an `object` with a single `__time_duration_micros__` element.
     * @returns A new {@link TypeBuilder} instance with the {@link TimeDuration} type.
     */
    timeDuration: () => {
      return new TimeDurationBuilder();
    },
    /**
     * This is a convenience method for creating a column with the {@link Uuid} type.
     * You can create a column of the same type by constructing an `object` with a single `__uuid__` element.
     * @returns A new {@link TypeBuilder} instance with the {@link Uuid} type.
     */
    uuid: () => {
      return new UuidBuilder();
    },
    /**
     * This is a convenience method for creating a column with the `ByteArray` type.
     * You can create a column of the same type by constructing an `array` of `u8`.
     * The TypeScript representation is {@link Uint8Array}.
     * @returns A new {@link ByteArrayBuilder} instance with the `ByteArray` type.
     */
    byteArray: () => {
      return new ByteArrayBuilder();
    }
  };
  var BsatnRowList = t.object("BsatnRowList", {
    get sizeHint() {
      return RowSizeHint;
    },
    rowsData: t.byteArray()
  });
  var CallProcedure = t.object("CallProcedure", {
    requestId: t.u32(),
    flags: t.u8(),
    procedure: t.string(),
    args: t.byteArray()
  });
  var CallReducer = t.object("CallReducer", {
    requestId: t.u32(),
    flags: t.u8(),
    reducer: t.string(),
    args: t.byteArray()
  });
  var ClientMessage = t.enum("ClientMessage", {
    get Subscribe() {
      return Subscribe;
    },
    get Unsubscribe() {
      return Unsubscribe;
    },
    get OneOffQuery() {
      return OneOffQuery;
    },
    get CallReducer() {
      return CallReducer;
    },
    get CallProcedure() {
      return CallProcedure;
    }
  });
  var EventTableRows = t.object("EventTableRows", {
    get events() {
      return BsatnRowList;
    }
  });
  var InitialConnection = t.object("InitialConnection", {
    identity: t.identity(),
    connectionId: t.connectionId(),
    token: t.string()
  });
  var OneOffQuery = t.object("OneOffQuery", {
    requestId: t.u32(),
    queryString: t.string()
  });
  var OneOffQueryResult = t.object("OneOffQueryResult", {
    requestId: t.u32(),
    get result() {
      return t.result(QueryRows, t.string());
    }
  });
  var PersistentTableRows = t.object("PersistentTableRows", {
    get inserts() {
      return BsatnRowList;
    },
    get deletes() {
      return BsatnRowList;
    }
  });
  var ProcedureResult = t.object("ProcedureResult", {
    get status() {
      return ProcedureStatus;
    },
    timestamp: t.timestamp(),
    totalHostExecutionDuration: t.timeDuration(),
    requestId: t.u32()
  });
  var ProcedureStatus = t.enum("ProcedureStatus", {
    Returned: t.byteArray(),
    InternalError: t.string()
  });
  var QueryRows = t.object("QueryRows", {
    get tables() {
      return t.array(SingleTableRows);
    }
  });
  var QuerySetId = t.object("QuerySetId", {
    id: t.u32()
  });
  var QuerySetUpdate = t.object("QuerySetUpdate", {
    get querySetId() {
      return QuerySetId;
    },
    get tables() {
      return t.array(TableUpdate);
    }
  });
  var ReducerOk = t.object("ReducerOk", {
    retValue: t.byteArray(),
    get transactionUpdate() {
      return TransactionUpdate;
    }
  });
  var ReducerOutcome = t.enum("ReducerOutcome", {
    get Ok() {
      return ReducerOk;
    },
    OkEmpty: t.unit(),
    Err: t.byteArray(),
    InternalError: t.string()
  });
  var ReducerResult = t.object("ReducerResult", {
    requestId: t.u32(),
    timestamp: t.timestamp(),
    get result() {
      return ReducerOutcome;
    }
  });
  var RowSizeHint = t.enum("RowSizeHint", {
    FixedSize: t.u16(),
    RowOffsets: t.array(t.u64())
  });
  var ServerMessage = t.enum("ServerMessage", {
    get InitialConnection() {
      return InitialConnection;
    },
    get SubscribeApplied() {
      return SubscribeApplied;
    },
    get UnsubscribeApplied() {
      return UnsubscribeApplied;
    },
    get SubscriptionError() {
      return SubscriptionError;
    },
    get TransactionUpdate() {
      return TransactionUpdate;
    },
    get OneOffQueryResult() {
      return OneOffQueryResult;
    },
    get ReducerResult() {
      return ReducerResult;
    },
    get ProcedureResult() {
      return ProcedureResult;
    }
  });
  var SingleTableRows = t.object("SingleTableRows", {
    table: t.string(),
    get rows() {
      return BsatnRowList;
    }
  });
  var Subscribe = t.object("Subscribe", {
    requestId: t.u32(),
    get querySetId() {
      return QuerySetId;
    },
    queryStrings: t.array(t.string())
  });
  var SubscribeApplied = t.object("SubscribeApplied", {
    requestId: t.u32(),
    get querySetId() {
      return QuerySetId;
    },
    get rows() {
      return QueryRows;
    }
  });
  var SubscriptionError = t.object("SubscriptionError", {
    requestId: t.option(t.u32()),
    get querySetId() {
      return QuerySetId;
    },
    error: t.string()
  });
  var TableUpdate = t.object("TableUpdate", {
    tableName: t.string(),
    get rows() {
      return t.array(TableUpdateRows);
    }
  });
  var TableUpdateRows = t.enum("TableUpdateRows", {
    get PersistentTable() {
      return PersistentTableRows;
    },
    get EventTable() {
      return EventTableRows;
    }
  });
  var TransactionUpdate = t.object("TransactionUpdate", {
    get querySets() {
      return t.array(QuerySetUpdate);
    }
  });
  var Unsubscribe = t.object("Unsubscribe", {
    requestId: t.u32(),
    get querySetId() {
      return QuerySetId;
    },
    get flags() {
      return UnsubscribeFlags;
    }
  });
  var UnsubscribeApplied = t.object("UnsubscribeApplied", {
    requestId: t.u32(),
    get querySetId() {
      return QuerySetId;
    },
    get rows() {
      return t.option(QueryRows);
    }
  });
  var UnsubscribeFlags = t.enum("UnsubscribeFlags", {
    Default: t.unit(),
    SendDroppedRows: t.unit()
  });
  var EventEmitter = (_j = class {
    constructor() {
      __privateAdd(this, _events, /* @__PURE__ */ new Map());
    }
    on(event, callback) {
      let callbacks = __privateGet(this, _events).get(event);
      if (!callbacks) {
        callbacks = /* @__PURE__ */ new Set();
        __privateGet(this, _events).set(event, callbacks);
      }
      callbacks.add(callback);
    }
    off(event, callback) {
      const callbacks = __privateGet(this, _events).get(event);
      if (!callbacks) {
        return;
      }
      callbacks.delete(callback);
    }
    emit(event, ...args) {
      const callbacks = __privateGet(this, _events).get(event);
      if (!callbacks) {
        return;
      }
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }, _events = new WeakMap(), _j);
  var LogLevelIdentifierIcon = {
    component: "📦",
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
    debug: "🐛",
    trace: "🔍"
  };
  var LogStyle = {
    component: "color: #fff; background-color: #8D6FDD; padding: 2px 5px; border-radius: 3px;",
    info: "color: #fff; background-color: #007bff; padding: 2px 5px; border-radius: 3px;",
    warn: "color: #fff; background-color: #ffc107; padding: 2px 5px; border-radius: 3px;",
    error: "color: #fff; background-color: #dc3545; padding: 2px 5px; border-radius: 3px;",
    debug: "color: #fff; background-color: #28a745; padding: 2px 5px; border-radius: 3px;",
    trace: "color: #fff; background-color: #17a2b8; padding: 2px 5px; border-radius: 3px;"
  };
  var LogTextStyle = {
    component: "color: #8D6FDD;",
    info: "color: #007bff;",
    warn: "color: #ffc107;",
    error: "color: #dc3545;",
    debug: "color: #28a745;",
    trace: "color: #17a2b8;"
  };
  var LogLevelRank = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  };
  var globalLogLevel = "info";
  var shouldLog = (level) => LogLevelRank[level] <= LogLevelRank[globalLogLevel];
  var resolveLazy = (v) => typeof v === "function" ? v() : v;
  var toHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  var ARRAY_TRUNCATION_THRESHOLD = 25;
  var ARRAY_PREVIEW_COUNT = 10;
  var SENSITIVE_KEYS = /* @__PURE__ */ new Set([
    "token",
    "authToken",
    "authorization",
    "accessToken",
    "refreshToken"
  ]);
  var stringify = (value) => stringify$1(value, (key, current) => {
    if (SENSITIVE_KEYS.has(key)) {
      return "[REDACTED]";
    }
    if (current && typeof current === "object" && "__identity__" in current && typeof current.__identity__ === "bigint") {
      return u256ToHexString(
        current.__identity__
      );
    }
    if (current && typeof current === "object" && "__connection_id__" in current && typeof current.__connection_id__ === "bigint") {
      return u128ToHexString(
        current.__connection_id__
      );
    }
    if (current instanceof Uint8Array) {
      if (current.length < 25) {
        return `0x${toHex(current)}`;
      }
      const head = current.subarray(0, 10);
      return `Uint8Array(len=${current.length}, head=0x${toHex(head)})`;
    }
    if (Array.isArray(current) && current.length >= ARRAY_TRUNCATION_THRESHOLD) {
      const head = stringify$1(current.slice(0, ARRAY_PREVIEW_COUNT));
      return `Array(len=${current.length}, head=${head ?? "[]"})`;
    }
    return current;
  });
  var stdbLogger = (level, message, ...args) => {
    if (!shouldLog(level)) {
      return;
    }
    const resolvedMessage = resolveLazy(message);
    const resolvedArgs = args.map(resolveLazy);
    console.log(
      `%c${LogLevelIdentifierIcon[level]} ${level.toUpperCase()}%c ${resolvedMessage}`,
      LogStyle[level],
      LogTextStyle[level],
      ...resolvedArgs
    );
  };
  var scalarCompare = (x, y) => {
    if (x === y) return 0;
    return x < y ? -1 : 1;
  };
  var TableCacheImpl = (_k = class {
    /**
     * @param name the table name
     * @param primaryKeyCol column index designated as `#[primarykey]`
     * @param primaryKey column name designated as `#[primarykey]`
     * @param entityClass the entityClass
     */
    constructor(tableDef) {
      __privateAdd(this, _TableCacheImpl_instances);
      __publicField(this, "hasPrimaryKey");
      __publicField(this, "rows");
      __publicField(this, "tableDef");
      __publicField(this, "emitter");
      __publicField(this, "applyOperations", (operations, ctx) => {
        const pendingCallbacks = [];
        if (this.tableDef.isEvent) {
          for (const op of operations) {
            if (op.type === "insert") {
              pendingCallbacks.push({
                type: "insert",
                table: this.tableDef.sourceName,
                cb: () => {
                  this.emitter.emit("insert", ctx, op.row);
                }
              });
            }
          }
          return pendingCallbacks;
        }
        if (this.hasPrimaryKey) {
          const insertMap = /* @__PURE__ */ new Map();
          const deleteMap = /* @__PURE__ */ new Map();
          for (const op of operations) {
            if (op.type === "insert") {
              const [_, prevCount] = insertMap.get(op.rowId) || [op, 0];
              insertMap.set(op.rowId, [op, prevCount + 1]);
            } else {
              const [_, prevCount] = deleteMap.get(op.rowId) || [op, 0];
              deleteMap.set(op.rowId, [op, prevCount + 1]);
            }
          }
          for (const [primaryKey, [insertOp, refCount]] of insertMap) {
            const deleteEntry = deleteMap.get(primaryKey);
            if (deleteEntry) {
              const [_, deleteCount] = deleteEntry;
              const refCountDelta = refCount - deleteCount;
              const maybeCb = this.update(
                ctx,
                primaryKey,
                insertOp.row,
                refCountDelta
              );
              if (maybeCb) {
                pendingCallbacks.push(maybeCb);
              }
              deleteMap.delete(primaryKey);
            } else {
              const maybeCb = this.insert(ctx, insertOp, refCount);
              if (maybeCb) {
                pendingCallbacks.push(maybeCb);
              }
            }
          }
          for (const [deleteOp, refCount] of deleteMap.values()) {
            const maybeCb = this.delete(ctx, deleteOp, refCount);
            if (maybeCb) {
              pendingCallbacks.push(maybeCb);
            }
          }
        } else {
          for (const op of operations) {
            if (op.type === "insert") {
              const maybeCb = this.insert(ctx, op);
              if (maybeCb) {
                pendingCallbacks.push(maybeCb);
              }
            } else {
              const maybeCb = this.delete(ctx, op);
              if (maybeCb) {
                pendingCallbacks.push(maybeCb);
              }
            }
          }
        }
        return pendingCallbacks;
      });
      __publicField(this, "update", (ctx, rowId, newRow, refCountDelta = 0) => {
        const existingEntry = this.rows.get(rowId);
        if (!existingEntry) {
          stdbLogger(
            "error",
            `Updating a row that was not present in the cache. Table: ${this.tableDef.sourceName}, RowId: ${rowId}`
          );
          return void 0;
        }
        const [oldRow, previousCount] = existingEntry;
        const refCount = Math.max(1, previousCount + refCountDelta);
        if (previousCount + refCountDelta <= 0) {
          stdbLogger(
            "error",
            `Negative reference count for in table ${this.tableDef.sourceName} row ${rowId} (${previousCount} + ${refCountDelta})`
          );
          return void 0;
        }
        this.rows.set(rowId, [newRow, refCount]);
        if (previousCount === 0) {
          stdbLogger(
            "error",
            `Updating a row id in table ${this.tableDef.sourceName} which was not present in the cache (rowId: ${rowId})`
          );
          return {
            type: "insert",
            table: this.tableDef.sourceName,
            cb: () => {
              this.emitter.emit("insert", ctx, newRow);
            }
          };
        }
        return {
          type: "update",
          table: this.tableDef.sourceName,
          cb: () => {
            this.emitter.emit("update", ctx, oldRow, newRow);
          }
        };
      });
      __publicField(this, "insert", (ctx, operation, count = 1) => {
        const [_, previousCount] = this.rows.get(operation.rowId) || [
          operation.row,
          0
        ];
        this.rows.set(operation.rowId, [operation.row, previousCount + count]);
        if (previousCount === 0) {
          return {
            type: "insert",
            table: this.tableDef.sourceName,
            cb: () => {
              this.emitter.emit("insert", ctx, operation.row);
            }
          };
        }
        return void 0;
      });
      __publicField(this, "delete", (ctx, operation, count = 1) => {
        const [_, previousCount] = this.rows.get(operation.rowId) || [
          operation.row,
          0
        ];
        if (previousCount === 0) {
          stdbLogger("warn", "Deleting a row that was not present in the cache");
          return void 0;
        }
        if (previousCount <= count) {
          this.rows.delete(operation.rowId);
          return {
            type: "delete",
            table: this.tableDef.sourceName,
            cb: () => {
              this.emitter.emit("delete", ctx, operation.row);
            }
          };
        }
        this.rows.set(operation.rowId, [operation.row, previousCount - count]);
        return void 0;
      });
      /**
       * Register a callback for when a row is newly inserted into the database.
       *
       * ```ts
       * ctx.db.user.onInsert((reducerEvent, user) => {
       *   if (reducerEvent) {
       *      console.log("New user on reducer", reducerEvent, user);
       *   } else {
       *      console.log("New user received during subscription update on insert", user);
       *  }
       * });
       * ```
       *
       * @param cb Callback to be called when a new row is inserted
       */
      __publicField(this, "onInsert", (cb) => {
        this.emitter.on("insert", cb);
      });
      /**
       * Register a callback for when a row is deleted from the database.
       *
       * ```ts
       * ctx.db.user.onDelete((reducerEvent, user) => {
       *   if (reducerEvent) {
       *      console.log("Deleted user on reducer", reducerEvent, user);
       *   } else {
       *      console.log("Deleted user received during subscription update on update", user);
       *  }
       * });
       * ```
       *
       * @param cb Callback to be called when a new row is inserted
       */
      __publicField(this, "onDelete", (cb) => {
        this.emitter.on("delete", cb);
      });
      /**
       * Register a callback for when a row is updated into the database.
       *
       * ```ts
       * ctx.db.user.onInsert((reducerEvent, oldUser, user) => {
       *   if (reducerEvent) {
       *      console.log("Updated user on reducer", reducerEvent, user);
       *   } else {
       *      console.log("Updated user received during subscription update on delete", user);
       *  }
       * });
       * ```
       *
       * @param cb Callback to be called when a new row is inserted
       */
      __publicField(this, "onUpdate", (cb) => {
        this.emitter.on("update", cb);
      });
      /**
       * Remove a callback for when a row is newly inserted into the database.
       *
       * @param cb Callback to be removed
       */
      __publicField(this, "removeOnInsert", (cb) => {
        this.emitter.off("insert", cb);
      });
      /**
       * Remove a callback for when a row is deleted from the database.
       *
       * @param cb Callback to be removed
       */
      __publicField(this, "removeOnDelete", (cb) => {
        this.emitter.off("delete", cb);
      });
      /**
       * Remove a callback for when a row is updated into the database.
       *
       * @param cb Callback to be removed
       */
      __publicField(this, "removeOnUpdate", (cb) => {
        this.emitter.off("update", cb);
      });
      this.tableDef = tableDef;
      this.rows = /* @__PURE__ */ new Map();
      this.emitter = new EventEmitter();
      this.hasPrimaryKey = Object.values(this.tableDef.columns).some(
        (col) => col.columnMetadata.isPrimaryKey === true
      );
      for (const idxDef of this.tableDef.resolvedIndexes) {
        const index = __privateMethod(this, _TableCacheImpl_instances, makeReadonlyIndex_fn).call(this, this.tableDef, idxDef);
        this[idxDef.name] = index;
      }
    }
    /**
     * @returns number of rows in the table
     */
    count() {
      return BigInt(this.rows.size);
    }
    /**
     * @returns The values of the rows in the table
     */
    iter() {
      function* generator(rows) {
        for (const [row] of rows.values()) {
          yield row;
        }
      }
      return generator(this.rows);
    }
    /**
     * Allows iteration over the rows in the table
     * @returns An iterator over the rows in the table
     */
    [Symbol.iterator]() {
      return this.iter();
    }
  }, _TableCacheImpl_instances = new WeakSet(), // TODO: this just scans the whole table; we should build proper index structures
  makeReadonlyIndex_fn = function(tableDef, idx) {
    if (idx.algorithm !== "btree") {
      throw new Error("Only btree indexes are supported in TableCacheImpl");
    }
    const columns = idx.columns;
    const getKey = (row) => columns.map((c) => row[c]);
    const matchRange = (row, rangeArg) => {
      const key = getKey(row);
      const arr = Array.isArray(rangeArg) ? rangeArg : [rangeArg];
      const prefixLen = Math.max(0, arr.length - 1);
      for (let i = 0; i < prefixLen; i++) {
        if (!deepEqual(key[i], arr[i])) return false;
      }
      const lastProvided = arr[arr.length - 1];
      const kLast = key[prefixLen];
      if (lastProvided && typeof lastProvided === "object" && "from" in lastProvided && "to" in lastProvided) {
        const from = lastProvided.from;
        const to = lastProvided.to;
        if (from.tag !== "unbounded") {
          const c = scalarCompare(kLast, from.value);
          if (c < 0) return false;
          if (c === 0 && from.tag === "excluded") return false;
        }
        if (to.tag !== "unbounded") {
          const c = scalarCompare(kLast, to.value);
          if (c > 0) return false;
          if (c === 0 && to.tag === "excluded") return false;
        }
        return true;
      } else {
        if (!deepEqual(kLast, lastProvided)) return false;
        return true;
      }
    };
    const isUnique = tableDef.constraints.some((constraint) => {
      if (constraint.constraint !== "unique") {
        return false;
      }
      return deepEqual(constraint.columns, idx.columns);
    });
    const self = this;
    if (isUnique) {
      const impl = {
        find: (colVal) => {
          const expected = Array.isArray(colVal) ? colVal : [colVal];
          for (const row of self.iter()) {
            if (deepEqual(getKey(row), expected)) return row;
          }
          return null;
        }
      };
      return impl;
    } else {
      const impl = {
        *filter(range) {
          for (const row of self.iter()) {
            if (matchRange(row, range)) yield row;
          }
        }
      };
      return impl;
    }
  }, _k);
  var TableMap = class {
    constructor() {
      __publicField(this, "map", /* @__PURE__ */ new Map());
    }
    get(key) {
      return this.map.get(key);
    }
    set(key, value) {
      this.map.set(key, value);
      return this;
    }
    has(key) {
      return this.map.has(key);
    }
    delete(key) {
      return this.map.delete(key);
    }
    // optional: iteration stays broadly typed (cannot express per-key relation here)
    keys() {
      return this.map.keys();
    }
    values() {
      return this.map.values();
    }
    entries() {
      return this.map.entries();
    }
    [Symbol.iterator]() {
      return this.entries();
    }
  };
  var ClientCache = class {
    constructor() {
      /**
       * The tables in the database.
       */
      __publicField(this, "tables", new TableMap());
    }
    /**
     * Returns the table with the given name.
     * - If SchemaDef is a concrete schema, `name` is constrained to known table names,
     *   and the return type matches that table.
     * - If SchemaDef is undefined, `name` is string and the return type is untyped.
     */
    getTable(name) {
      const table2 = this.tables.get(name);
      if (!table2) {
        console.error(
          "The table has not been registered for this client. Please register the table before using it. If you have registered global tables using the SpacetimeDBClient.registerTables() or `registerTable()` method, please make sure that is executed first!"
        );
        throw new Error(`Table ${String(name)} does not exist`);
      }
      return table2;
    }
    /**
     * Returns the table with the given name, creating it if needed.
     * - Typed mode: `tableTypeInfo.tableName` is constrained to known names and
     *   the return type matches that table.
     * - Untyped mode: accepts any string and returns an untyped TableCache.
     */
    getOrCreateTable(tableDef) {
      const name = tableDef.accessorName;
      const table2 = this.tables.get(name);
      if (table2) {
        return table2;
      }
      const newTable = new TableCacheImpl(
        tableDef
      );
      this.tables.set(name, newTable);
      return newTable;
    }
  };
  function comparePreReleases(a, b) {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const aPart = a[i];
      const bPart = b[i];
      if (aPart === bPart) continue;
      if (typeof aPart === "number" && typeof bPart === "number") {
        return aPart - bPart;
      }
      if (typeof aPart === "string" && typeof bPart === "string") {
        return aPart.localeCompare(bPart);
      }
      return typeof aPart === "string" ? 1 : -1;
    }
    return a.length - b.length;
  }
  var SemanticVersion = class _SemanticVersion {
    constructor(major, minor, patch, preRelease = null, buildInfo = null) {
      __publicField(this, "major");
      __publicField(this, "minor");
      __publicField(this, "patch");
      __publicField(this, "preRelease");
      __publicField(this, "buildInfo");
      this.major = major;
      this.minor = minor;
      this.patch = patch;
      this.preRelease = preRelease;
      this.buildInfo = buildInfo;
    }
    toString() {
      let versionString = `${this.major}.${this.minor}.${this.patch}`;
      if (this.preRelease) {
        versionString += `-${this.preRelease.join(".")}`;
      }
      if (this.buildInfo) {
        versionString += `+${this.buildInfo}`;
      }
      return versionString;
    }
    compare(other) {
      if (this.major !== other.major) {
        return this.major - other.major;
      }
      if (this.minor !== other.minor) {
        return this.minor - other.minor;
      }
      if (this.patch !== other.patch) {
        return this.patch - other.patch;
      }
      if (this.preRelease && other.preRelease) {
        return comparePreReleases(this.preRelease, other.preRelease);
      }
      if (this.preRelease) {
        return -1;
      }
      if (other.preRelease) {
        return -1;
      }
      return 0;
    }
    clone() {
      return new _SemanticVersion(
        this.major,
        this.minor,
        this.patch,
        this.preRelease ? [...this.preRelease] : null,
        this.buildInfo
      );
    }
    static parseVersionString(version) {
      const regex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/;
      const match = version.match(regex);
      if (!match) {
        throw new Error(`Invalid version string: ${version}`);
      }
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      const patch = parseInt(match[3], 10);
      const preRelease = match[4] ? match[4].split(".").map((id) => isNaN(Number(id)) ? id : Number(id)) : null;
      const buildInfo = match[5] || null;
      return new _SemanticVersion(major, minor, patch, preRelease, buildInfo);
    }
  };
  var _MINIMUM_CLI_VERSION = new SemanticVersion(
    1,
    4,
    0
  );
  function ensureMinimumVersionOrThrow(versionString) {
    if (versionString === void 0) {
      throw new Error(versionErrorMessage(versionString));
    }
    const version = SemanticVersion.parseVersionString(versionString);
    if (version.compare(_MINIMUM_CLI_VERSION) < 0) {
      throw new Error(versionErrorMessage(versionString));
    }
  }
  function versionErrorMessage(incompatibleVersion) {
    return `Module code was generated with an incompatible version of the spacetimedb cli (${incompatibleVersion}). Update the cli version to at least ${_MINIMUM_CLI_VERSION.toString()} and regenerate the bindings. You can upgrade to the latest cli version by running: spacetime version upgrade`;
  }
  async function decompress(buffer, type, chunkSize = 128 * 1024) {
    let offset = 0;
    const readableStream = new ReadableStream({
      pull(controller) {
        if (offset < buffer.length) {
          const chunk = buffer.subarray(
            offset,
            Math.min(offset + chunkSize, buffer.length)
          );
          controller.enqueue(chunk);
          offset += chunkSize;
        } else {
          controller.close();
        }
      }
    });
    const decompressionStream = new DecompressionStream(type);
    const decompressedStream = readableStream.pipeThrough(decompressionStream);
    const reader = decompressedStream.getReader();
    const chunks = [];
    let totalLength = 0;
    let result;
    while (!(result = await reader.read()).done) {
      chunks.push(result.value);
      totalLength += result.value.length;
    }
    const decompressedArray = new Uint8Array(totalLength);
    let chunkOffset = 0;
    for (const chunk of chunks) {
      decompressedArray.set(chunk, chunkOffset);
      chunkOffset += chunk.length;
    }
    return decompressedArray;
  }
  async function resolveWS() {
    if (typeof WebSocket !== "undefined") {
      return WebSocket;
    }
    const dynamicImport = new Function("m", "return import(m)");
    try {
      const { WebSocket: UndiciWS } = await dynamicImport("undici");
      return UndiciWS;
    } catch (err) {
      stdbLogger(
        "warn",
        "[spacetimedb-sdk] No global WebSocket found. On Node 18–21, please install `undici` (npm install undici) to enable WebSocket support."
      );
      throw err;
    }
  }
  async function openWebSocket({
    url,
    nameOrAddress,
    wsProtocol,
    authToken,
    compression,
    lightMode,
    confirmedReads
  }) {
    const headers = new Headers();
    const WS = await resolveWS();
    let temporaryAuthToken;
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
      const tokenUrl = new URL("v1/identity/websocket-token", url);
      tokenUrl.protocol = url.protocol === "wss:" ? "https:" : "http:";
      const response = await fetch(tokenUrl, { method: "POST", headers });
      if (response.ok) {
        const { token } = await response.json();
        temporaryAuthToken = token;
      } else {
        throw new Error(`Failed to verify token: ${response.statusText}`);
      }
    }
    const databaseUrl = new URL(`v1/database/${nameOrAddress}/subscribe`, url);
    if (temporaryAuthToken) {
      databaseUrl.searchParams.set("token", temporaryAuthToken);
    }
    databaseUrl.searchParams.set(
      "compression",
      { gzip: "Gzip", brotli: "Brotli", none: "None" }[compression] ?? "None"
    );
    if (lightMode) {
      databaseUrl.searchParams.set("light", "true");
    }
    if (confirmedReads !== void 0) {
      databaseUrl.searchParams.set("confirmed", confirmedReads.toString());
    }
    const ws = new WS(databaseUrl.toString(), wsProtocol);
    ws.binaryType = "arraybuffer";
    return ws;
  }
  var WebsocketDecompressAdapter = (_l = class {
    constructor(ws) {
      __privateAdd(this, __WebsocketDecompressAdapter_instances);
      __privateAdd(this, _ws);
      __privateSet(this, _ws, ws);
    }
    get protocol() {
      return __privateGet(this, _ws).protocol;
    }
    get readyState() {
      return __privateGet(this, _ws).readyState;
    }
    set onclose(handler) {
      __privateGet(this, _ws).onclose = handler;
    }
    set onopen(handler) {
      __privateGet(this, _ws).onopen = handler;
    }
    set onmessage(handler) {
      __privateGet(this, _ws).onmessage = async (msg) => {
        const data = await __privateMethod(this, __WebsocketDecompressAdapter_instances, decompress_fn).call(this, new Uint8Array(msg.data));
        handler({ data });
      };
    }
    set onerror(handler) {
      __privateGet(this, _ws).onerror = handler;
    }
    send(msg) {
      __privateGet(this, _ws).send(msg);
    }
    close() {
      __privateGet(this, _ws).close();
    }
    static async openWebSocket(args) {
      return new _l(await openWebSocket(args));
    }
  }, _ws = new WeakMap(), __WebsocketDecompressAdapter_instances = new WeakSet(), decompress_fn = async function(buffer) {
    const tag = buffer[0];
    const data = buffer.subarray(1);
    switch (tag) {
      case 0:
        return data;
      case 1:
        return await decompress(data, "brotli");
      case 2:
        return await decompress(data, "gzip");
      default:
        throw new Error(
          "Unexpected Compression Algorithm. Please use `gzip` or `none`"
        );
    }
  }, _l);
  var DbConnectionBuilder$1 = (_m = class {
    /**
     * Creates a new `DbConnectionBuilder` database client and set the initial parameters.
     *
     * Users are not expected to call this constructor directly. Instead, use the static method `DbConnection.builder()`.
     *
     * @param remoteModule The remote module to use to connect to the SpacetimeDB server.
     * @param dbConnectionConstructor The constructor to use to create a new `DbConnection`.
     */
    constructor(remoteModule, dbConnectionCtor) {
      __privateAdd(this, _uri);
      __privateAdd(this, _nameOrAddress);
      __privateAdd(this, _identity);
      __privateAdd(this, _token);
      __privateAdd(this, _emitter, new EventEmitter());
      __privateAdd(this, _compression, "gzip");
      __privateAdd(this, _lightMode, false);
      __privateAdd(this, _confirmedReads);
      __privateAdd(this, _createWSFn);
      this.remoteModule = remoteModule;
      this.dbConnectionCtor = dbConnectionCtor;
      __privateSet(this, _createWSFn, WebsocketDecompressAdapter.openWebSocket);
    }
    /**
     * Set the URI of the SpacetimeDB server to connect to.
     *
     * @param uri The URI of the SpacetimeDB server to connect to.
     *
     **/
    withUri(uri) {
      __privateSet(this, _uri, new URL(uri));
      return this;
    }
    /**
     * Set the name or Identity of the remote database to connect to.
     *
     * @param nameOrAddress
     *
     * @returns The `DbConnectionBuilder` instance.
     */
    withDatabaseName(nameOrAddress) {
      __privateSet(this, _nameOrAddress, nameOrAddress);
      return this;
    }
    /**
     * Set the identity of the client to connect to the database.
     *
     * @param token The credentials to use to authenticate with SpacetimeDB. This
     * is optional. You can store the token returned by the `onConnect` callback
     * to use in future connections.
     *
     * @returns The `DbConnectionBuilder` instance.
     */
    withToken(token) {
      __privateSet(this, _token, token);
      return this;
    }
    withWSFn(createWSFn) {
      __privateSet(this, _createWSFn, createWSFn);
      return this;
    }
    /**
     * Set the compression algorithm to use for the connection.
     *
     * @param compression The compression algorithm to use for the connection.
     */
    withCompression(compression) {
      if (compression === "brotli") {
        try {
          new DecompressionStream("brotli");
        } catch (e) {
          throw new TypeError(
            `Brotli compression is not supported by the runtime. Please choose a different compression method.`,
            { cause: e }
          );
        }
      }
      __privateSet(this, _compression, compression);
      return this;
    }
    /**
     * Sets the connection to operate in light mode.
     *
     * Light mode is a mode that reduces the amount of data sent over the network.
     *
     * @param lightMode The light mode for the connection.
     */
    withLightMode(lightMode) {
      __privateSet(this, _lightMode, lightMode);
      return this;
    }
    /**
     * Sets the connection to use confirmed reads.
     *
     * When enabled, the server will send query results only after they are
     * confirmed to be durable.
     *
     * What durable means depends on the server configuration: a single node
     * server may consider a transaction durable once it is `fsync`'ed to disk,
     * whereas a cluster may require that some number of replicas have
     * acknowledge that they have stored the transactions.
     *
     * Note that enabling confirmed reads will increase the latency between a
     * reducer call and the corresponding subscription update arriving at the
     * client.
     *
     * If this method is not called, not preference is sent to the server, and
     * the server will choose the default.
     *
     * @param confirmedReads `true` to enable confirmed reads, `false` to disable.
     */
    withConfirmedReads(confirmedReads) {
      __privateSet(this, _confirmedReads, confirmedReads);
      return this;
    }
    /**
     * Register a callback to be invoked upon authentication with the database.
     *
     * @param identity A unique identifier for a client connected to a database.
     * @param token The credentials to use to authenticate with SpacetimeDB.
     *
     * @returns The `DbConnectionBuilder` instance.
     *
     * The callback will be invoked with the `Identity` and private authentication `token` provided by the database to identify this connection.
     *
     * If credentials were supplied to connect, those passed to the callback will be equivalent to the ones used to connect.
     *
     * If the initial connection was anonymous, a new set of credentials will be generated by the database to identify this user.
     *
     * The credentials passed to the callback can be saved and used to authenticate the same user in future connections.
     *
     * @example
     *
     * ```ts
     * DbConnection.builder().onConnect((ctx, identity, token) => {
     *  console.log("Connected to SpacetimeDB with identity:", identity.toHexString());
     * });
     * ```
     */
    onConnect(callback) {
      __privateGet(this, _emitter).on("connect", callback);
      return this;
    }
    /**
     * Register a callback to be invoked upon an error.
     *
     * @example
     *
     * ```ts
     * DbConnection.builder().onConnectError((ctx, error) => {
     *   console.log("Error connecting to SpacetimeDB:", error);
     * });
     * ```
     */
    onConnectError(callback) {
      __privateGet(this, _emitter).on("connectError", callback);
      return this;
    }
    /**
     * Registers a callback to run when a {@link DbConnection} whose connection initially succeeded
     * is disconnected, either after a {@link DbConnection.disconnect()} call or due to an error.
     *
     * If the connection ended because of an error, the error is passed to the callback.
     *
     * The `callback` will be installed on the `DbConnection` created by `build`
     * before initiating the connection, ensuring there's no opportunity for the disconnect to happen
     * before the callback is installed.
     *
     * Note that this does not trigger if `build` fails
     * or in cases where {@link DbConnectionBuilder.onConnectError} would trigger.
     * This callback only triggers if the connection closes after `build` returns successfully
     * and {@link DbConnectionBuilder.onConnect} is invoked, i.e., after the initial connection
     * message is received.
     *
     * To simplify SDK implementation, at most one such callback can be registered.
     * Calling `onDisconnect` on the same `DbConnectionBuilder` multiple times throws an error.
     *
     * Unlike callbacks registered via {@link DbConnection},
     * no mechanism is provided to unregister the provided callback.
     * This is a concession to ergonomics; there's no clean place to return a `CallbackId` from this method
     * or from `build`.
     *
     * @param {function(error?: Error): void} callback - The callback to invoke upon disconnection.
     * @throws {Error} Throws an error if called multiple times on the same `DbConnectionBuilder`.
     */
    onDisconnect(callback) {
      __privateGet(this, _emitter).on("disconnect", callback);
      return this;
    }
    getUri() {
      var _a2;
      return ((_a2 = __privateGet(this, _uri)) == null ? void 0 : _a2.toString()) ?? "";
    }
    getModuleName() {
      return __privateGet(this, _nameOrAddress) ?? "";
    }
    /**
     * Builds a new `DbConnection` with the parameters set on this `DbConnectionBuilder` and attempts to connect to the SpacetimeDB server.
     *
     * @returns A new `DbConnection` with the parameters set on this `DbConnectionBuilder`.
     *
     * @example
     *
     * ```ts
     * const host = "http://localhost:3000";
     * const name_or_address = "database_name"
     * const auth_token = undefined;
     * DbConnection.builder().withUri(host).withDatabaseName(name_or_address).withToken(auth_token).build();
     * ```
     */
    build() {
      var _a2;
      if (!__privateGet(this, _uri)) {
        throw new Error("URI is required to connect to SpacetimeDB");
      }
      if (!__privateGet(this, _nameOrAddress)) {
        throw new Error(
          "Database name or address is required to connect to SpacetimeDB"
        );
      }
      ensureMinimumVersionOrThrow((_a2 = this.remoteModule.versionInfo) == null ? void 0 : _a2.cliVersion);
      return this.dbConnectionCtor({
        uri: __privateGet(this, _uri),
        nameOrAddress: __privateGet(this, _nameOrAddress),
        identity: __privateGet(this, _identity),
        token: __privateGet(this, _token),
        emitter: __privateGet(this, _emitter),
        compression: __privateGet(this, _compression),
        lightMode: __privateGet(this, _lightMode),
        confirmedReads: __privateGet(this, _confirmedReads),
        createWSFn: __privateGet(this, _createWSFn),
        remoteModule: this.remoteModule
      });
    }
  }, _uri = new WeakMap(), _nameOrAddress = new WeakMap(), _identity = new WeakMap(), _token = new WeakMap(), _emitter = new WeakMap(), _compression = new WeakMap(), _lightMode = new WeakMap(), _confirmedReads = new WeakMap(), _createWSFn = new WeakMap(), _m);
  var INTERNAL_REMOTE_MODULE = Symbol("INTERNAL_REMOTE_MODULE");
  var SubscriptionBuilderImpl = (_n = class {
    constructor(db) {
      __privateAdd(this, _onApplied);
      __privateAdd(this, _onError);
      this.db = db;
    }
    /**
     * Registers `callback` to run when this query is successfully added to our subscribed set,
     * I.e. when its `SubscriptionApplied` message is received.
     *
     * The database state exposed via the `&EventContext` argument
     * includes all the rows added to the client cache as a result of the new subscription.
     *
     * The event in the `&EventContext` argument is `Event::SubscribeApplied`.
     *
     * Multiple `on_applied` callbacks for the same query may coexist.
     * No mechanism for un-registering `on_applied` callbacks is exposed.
     *
     * @param cb - Callback to run when the subscription is applied.
     * @returns The current `SubscriptionBuilder` instance.
     */
    onApplied(cb) {
      __privateSet(this, _onApplied, cb);
      return this;
    }
    /**
     * Registers `callback` to run when this query either:
     * - Fails to be added to our subscribed set.
     * - Is unexpectedly removed from our subscribed set.
     *
     * If the subscription had previously started and has been unexpectedly removed,
     * the database state exposed via the `&EventContext` argument contains no rows
     * from any subscriptions removed within the same error event.
     * As proposed, it must therefore contain no rows.
     *
     * The event in the `&EventContext` argument is `Event::SubscribeError`,
     * containing a dynamic error object with a human-readable description of the error
     * for diagnostic purposes.
     *
     * Multiple `on_error` callbacks for the same query may coexist.
     * No mechanism for un-registering `on_error` callbacks is exposed.
     *
     * @param cb - Callback to run when there is an error in subscription.
     * @returns The current `SubscriptionBuilder` instance.
     */
    onError(cb) {
      __privateSet(this, _onError, cb);
      return this;
    }
    subscribe(query_sql) {
      var _a2, _b2;
      let queries;
      if (typeof query_sql === "function") {
        const tablesMap = (_b2 = (_a2 = this.db).getTablesMap) == null ? void 0 : _b2.call(_a2);
        const result = query_sql(tablesMap);
        queries = Array.isArray(result) ? result : [result];
      } else {
        queries = Array.isArray(query_sql) ? query_sql : [query_sql];
      }
      if (queries.length === 0) {
        throw new Error("Subscriptions must have at least one query");
      }
      const queryStrings = queries.map((q) => {
        if (typeof q === "string") return q;
        if (isRowTypedQuery(q)) return toSql(q);
        throw new Error("Subscriptions must be SQL strings or typed queries");
      });
      return new SubscriptionHandleImpl(
        this.db,
        queryStrings,
        __privateGet(this, _onApplied),
        __privateGet(this, _onError)
      );
    }
    /**
     * Subscribes to all rows from all tables.
     *
     * This method is intended as a convenience
     * for applications where client-side memory use and network bandwidth are not concerns.
     * Applications where these resources are a constraint
     * should register more precise queries via `subscribe`
     * in order to replicate only the subset of data which the client needs to function.
     *
     * This method should not be combined with `subscribe` on the same `DbConnection`.
     * A connection may either `subscribe` to particular queries,
     * or `subscribeToAllTables`, but not both.
     * Attempting to call `subscribe`
     * on a `DbConnection` that has previously used `subscribeToAllTables`,
     * or vice versa, may misbehave in any number of ways,
     * including dropping subscriptions, corrupting the client cache, or throwing errors.
     */
    subscribeToAllTables() {
      const remoteModule = this.db[INTERNAL_REMOTE_MODULE]();
      const queries = Object.values(remoteModule.tables).map(
        (table2) => `SELECT * FROM ${table2.sourceName}`
      );
      this.subscribe(queries);
    }
  }, _onApplied = new WeakMap(), _onError = new WeakMap(), _n);
  var SubscriptionManager = class {
    constructor() {
      __publicField(this, "subscriptions", /* @__PURE__ */ new Map());
    }
  };
  var SubscriptionHandleImpl = (_o = class {
    constructor(db, querySql, onApplied, onError) {
      __privateAdd(this, _querySetId);
      __privateAdd(this, _unsubscribeCalled, false);
      __privateAdd(this, _endedState, false);
      __privateAdd(this, _activeState, false);
      __privateAdd(this, _emitter2, new EventEmitter());
      this.db = db;
      __privateGet(this, _emitter2).on(
        "applied",
        (ctx) => {
          __privateSet(this, _activeState, true);
          if (onApplied) {
            onApplied(ctx);
          }
        }
      );
      __privateGet(this, _emitter2).on(
        "error",
        (ctx, error) => {
          __privateSet(this, _activeState, false);
          __privateSet(this, _endedState, true);
          if (onError) {
            onError(ctx, error);
          }
        }
      );
      __privateSet(this, _querySetId, this.db.registerSubscription(
        this,
        __privateGet(this, _emitter2),
        querySql
      ));
    }
    /**
     * Consumes self and issues an `Unsubscribe` message,
     * removing this query from the client's set of subscribed queries.
     * It is only valid to call this method if `is_active()` is `true`.
     */
    unsubscribe() {
      if (__privateGet(this, _unsubscribeCalled)) {
        throw new Error("Unsubscribe has already been called");
      }
      __privateSet(this, _unsubscribeCalled, true);
      this.db.unregisterSubscription(__privateGet(this, _querySetId));
      __privateGet(this, _emitter2).on(
        "end",
        (_ctx) => {
          __privateSet(this, _endedState, true);
          __privateSet(this, _activeState, false);
        }
      );
    }
    /**
     * Unsubscribes and also registers a callback to run upon success.
     * I.e. when an `UnsubscribeApplied` message is received.
     *
     * If `Unsubscribe` returns an error,
     * or if the `on_error` callback(s) are invoked before this subscription would end normally,
     * the `on_end` callback is not invoked.
     *
     * @param onEnd - Callback to run upon successful unsubscribe.
     */
    unsubscribeThen(onEnd) {
      if (__privateGet(this, _endedState)) {
        throw new Error("Subscription has already ended");
      }
      if (__privateGet(this, _unsubscribeCalled)) {
        throw new Error("Unsubscribe has already been called");
      }
      __privateSet(this, _unsubscribeCalled, true);
      this.db.unregisterSubscription(__privateGet(this, _querySetId));
      __privateGet(this, _emitter2).on(
        "end",
        (ctx) => {
          __privateSet(this, _endedState, true);
          __privateSet(this, _activeState, false);
          onEnd(ctx);
        }
      );
    }
    /**
     * True if this `SubscriptionHandle` has ended,
     * either due to an error or a call to `unsubscribe`.
     *
     * This is initially false, and becomes true when either the `on_end` or `on_error` callback is invoked.
     * A subscription which has not yet been applied is not active, but is also not ended.
     */
    isEnded() {
      return __privateGet(this, _endedState);
    }
    /**
     * True if this `SubscriptionHandle` is active, meaning it has been successfully applied
     * and has not since ended, either due to an error or a complete `unsubscribe` request-response pair.
     *
     * This corresponds exactly to the interval bounded at the start by the `on_applied` callback
     * and at the end by either the `on_end` or `on_error` callback.
     */
    isActive() {
      return __privateGet(this, _activeState);
    }
  }, _querySetId = new WeakMap(), _unsubscribeCalled = new WeakMap(), _endedState = new WeakMap(), _activeState = new WeakMap(), _emitter2 = new WeakMap(), _o);
  var V2_WS_PROTOCOL = "v2.bsatn.spacetimedb";
  var V3_WS_PROTOCOL = "v3.bsatn.spacetimedb";
  var PREFERRED_WS_PROTOCOLS = [V3_WS_PROTOCOL, V2_WS_PROTOCOL];
  function normalizeWsProtocol(protocol) {
    if (protocol === V3_WS_PROTOCOL) {
      return V3_WS_PROTOCOL;
    }
    if (protocol === "" || protocol === V2_WS_PROTOCOL) {
      return V2_WS_PROTOCOL;
    }
    stdbLogger(
      "warn",
      `Unexpected websocket subprotocol "${protocol}", falling back to ${V2_WS_PROTOCOL}.`
    );
    return V2_WS_PROTOCOL;
  }
  var EMPTY_V3_PAYLOAD_ERR = "v3 websocket payloads must contain at least one message";
  function ensureMessages(messages) {
    if (messages.length === 0) {
      throw new RangeError(EMPTY_V3_PAYLOAD_ERR);
    }
  }
  function ensureMessageCount(messages, messageCount) {
    ensureMessages(messages);
    if (messageCount < 1 || messageCount > messages.length) {
      throw new RangeError(
        `v3 websocket payload requested ${messageCount} messages from ${messages.length}`
      );
    }
  }
  function concatenateMessagesV3(writer, messages, messageCount = messages.length) {
    ensureMessageCount(messages, messageCount);
    writer.clear();
    for (let i = 0; i < messageCount; i++) {
      writer.writeBytes(messages[i]);
    }
    return writer.getBuffer();
  }
  function countClientMessagesForV3Frame(messages, maxFrameBytes) {
    ensureMessages(messages);
    const firstMessage = messages[0];
    if (firstMessage.length > maxFrameBytes) {
      return 1;
    }
    let count = 1;
    let frameSize = firstMessage.length;
    while (count < messages.length) {
      const nextMessage = messages[count];
      const nextFrameSize = frameSize + nextMessage.length;
      if (nextFrameSize > maxFrameBytes) {
        break;
      }
      frameSize = nextFrameSize;
      count += 1;
    }
    return count;
  }
  function encodeClientMessagesV3(writer, messages, messageCount = messages.length) {
    return concatenateMessagesV3(writer, messages, messageCount);
  }
  function forEachServerMessageV3(reader, data, visit) {
    reader.reset(data);
    if (reader.remaining === 0) {
      throw new RangeError(EMPTY_V3_PAYLOAD_ERR);
    }
    let count = 0;
    while (reader.remaining > 0) {
      visit(ServerMessage.deserialize(reader));
      count += 1;
    }
    return count;
  }
  var TEXT_ENCODER = new TextEncoder();
  function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  function getClientMessageVariantTag(name) {
    if (ClientMessage.algebraicType.tag !== "Sum") {
      throw new TypeError("ClientMessage must be a sum type");
    }
    const tag = ClientMessage.algebraicType.value.variants.findIndex(
      (variant) => variant.name === name
    );
    if (tag === -1) {
      throw new RangeError(`Unknown ClientMessage variant: ${name}`);
    }
    return tag;
  }
  var CLIENT_MESSAGE_CALL_REDUCER_TAG = getClientMessageVariantTag("CallReducer");
  var CLIENT_MESSAGE_CALL_PROCEDURE_TAG = getClientMessageVariantTag("CallProcedure");
  var MAX_V3_OUTBOUND_FRAME_BYTES = 256 * 1024;
  var WS_READY_STATE_CLOSING = 2;
  var WS_READY_STATE_CLOSED = 3;
  var DbConnectionImpl = (_p = class {
    constructor({
      uri,
      nameOrAddress,
      identity,
      token,
      emitter,
      remoteModule,
      createWSFn,
      compression,
      lightMode,
      confirmedReads
    }) {
      __privateAdd(this, _DbConnectionImpl_instances);
      /**
       * Whether or not the connection is active.
       */
      __publicField(this, "isActive", false);
      /**
       * Whether `disconnect()` has been called on this connection.
       * Once requested, the connection will not be reused: managed environments
       * (such as the React `SpacetimeDBProvider`) use this to avoid reconnecting
       * after an intentional disconnect.
       */
      __publicField(this, "isDisconnectRequested", false);
      /**
       * This connection's public identity.
       */
      __publicField(this, "identity");
      /**
       * This connection's private authentication token.
       */
      __publicField(this, "token");
      /**
       * The accessor field to access the tables in the database and associated
       * callback functions.
       */
      __publicField(this, "db");
      /**
       * The accessor field to access the reducers in the database.
       */
      __publicField(this, "reducers");
      /**
       * The accessor field to access the procedures in the database.
       */
      __publicField(this, "procedures");
      /**
       * The `ConnectionId` of the connection to to the database.
       */
      __publicField(this, "connectionId", ConnectionId.random());
      __privateAdd(this, _connectionIdHex, this.connectionId.toHexString());
      // These fields are meant to be strictly private.
      __privateAdd(this, _queryId, 0);
      __privateAdd(this, _requestId, 0);
      __privateAdd(this, _eventId, 0);
      __privateAdd(this, _emitter3);
      __privateAdd(this, _inboundQueue, []);
      __privateAdd(this, _inboundQueueOffset, 0);
      __privateAdd(this, _isDrainingInboundQueue, false);
      __privateAdd(this, _outboundQueue, []);
      __privateAdd(this, _isOutboundFlushScheduled, false);
      __privateAdd(this, _negotiatedWsProtocol, V2_WS_PROTOCOL);
      __privateAdd(this, _subscriptionManager, new SubscriptionManager());
      __privateAdd(this, _remoteModule);
      __privateAdd(this, _reducerCallbacks, /* @__PURE__ */ new Map());
      __privateAdd(this, _reducerCallInfo, /* @__PURE__ */ new Map());
      __privateAdd(this, _procedureCallbacks, /* @__PURE__ */ new Map());
      __privateAdd(this, _rowDeserializers);
      __privateAdd(this, _rowIdMetadata);
      __privateAdd(this, _reducerArgsSerializers);
      __privateAdd(this, _procedureSerializers);
      __privateAdd(this, _reducerNameBytes);
      __privateAdd(this, _procedureNameBytes);
      __privateAdd(this, _sourceNameToTableDef);
      __privateAdd(this, _messageReader, new BinaryReader(new Uint8Array()));
      __privateAdd(this, _rowListReader, new BinaryReader(new Uint8Array()));
      __privateAdd(this, _clientFrameEncoder, new BinaryWriter(1024));
      __privateAdd(this, _boundSubscriptionBuilder);
      __privateAdd(this, _boundDisconnect);
      // These fields are not part of the public API, but in a pinch you
      // could use JavaScript to access them by bypassing TypeScript's
      // private fields.
      // We use them in testing.
      __publicField(this, "clientCache");
      __publicField(this, "ws");
      __publicField(this, "wsPromise");
      __privateAdd(this, _getNextQueryId, () => {
        const queryId = __privateGet(this, _queryId);
        __privateSet(this, _queryId, __privateGet(this, _queryId) + 1);
        return queryId;
      });
      __privateAdd(this, _getNextRequestId, () => __privateWrapper(this, _requestId)._++);
      // NOTE: This is very important!!! This is the actual function that
      // gets called when you call `connection.subscriptionBuilder()`.
      // The `subscriptionBuilder` function which is generated, just shadows
      // this function in the type system, but not the actual implementation!
      // Do not remove this function, or shoot yourself in the foot please.
      // It's not clear what would be a better way to do this at this exact
      // moment.
      __publicField(this, "subscriptionBuilder", () => {
        return new SubscriptionBuilderImpl(this);
      });
      __privateAdd(this, _reducerArgsEncoder, new BinaryWriter(1024));
      __privateAdd(this, _clientMessageEncoder, new BinaryWriter(1024));
      stdbLogger("info", "Connecting to SpacetimeDB WS...");
      const url = new URL(uri.toString());
      if (!/^wss?:/.test(uri.protocol)) {
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      }
      this.identity = identity;
      this.token = token;
      __privateSet(this, _remoteModule, remoteModule);
      __privateSet(this, _emitter3, emitter);
      __privateSet(this, _boundSubscriptionBuilder, this.subscriptionBuilder.bind(this));
      __privateSet(this, _boundDisconnect, this.disconnect.bind(this));
      __privateSet(this, _rowDeserializers, /* @__PURE__ */ Object.create(null));
      __privateSet(this, _rowIdMetadata, /* @__PURE__ */ Object.create(null));
      __privateSet(this, _sourceNameToTableDef, /* @__PURE__ */ Object.create(null));
      for (const table2 of Object.values(remoteModule.tables)) {
        __privateGet(this, _rowDeserializers)[table2.sourceName] = ProductType.makeDeserializer(
          table2.rowType
        );
        __privateGet(this, _sourceNameToTableDef)[table2.sourceName] = table2;
        const primaryKeyColumn = Object.entries(table2.columns).find(
          ([, column]) => column.columnMetadata.isPrimaryKey
        );
        __privateGet(this, _rowIdMetadata)[table2.sourceName] = primaryKeyColumn ? {
          primaryKeyColName: primaryKeyColumn[0],
          primaryKeyColType: primaryKeyColumn[1].typeBuilder.algebraicType
        } : {};
      }
      __privateSet(this, _reducerArgsSerializers, /* @__PURE__ */ Object.create(null));
      __privateSet(this, _reducerNameBytes, /* @__PURE__ */ Object.create(null));
      for (const reducer of remoteModule.reducers) {
        __privateGet(this, _reducerArgsSerializers)[reducer.name] = {
          serialize: ProductType.makeSerializer(reducer.paramsType),
          deserialize: ProductType.makeDeserializer(reducer.paramsType)
        };
        __privateGet(this, _reducerNameBytes)[reducer.name] = TEXT_ENCODER.encode(reducer.name);
      }
      __privateSet(this, _procedureSerializers, /* @__PURE__ */ Object.create(null));
      __privateSet(this, _procedureNameBytes, /* @__PURE__ */ Object.create(null));
      for (const procedure of remoteModule.procedures) {
        __privateGet(this, _procedureSerializers)[procedure.name] = {
          serializeArgs: ProductType.makeSerializer(
            new ProductBuilder(procedure.params).algebraicType.value
          ),
          deserializeReturn: AlgebraicType.makeDeserializer(
            procedure.returnType.algebraicType
          )
        };
        __privateGet(this, _procedureNameBytes)[procedure.name] = TEXT_ENCODER.encode(
          procedure.name
        );
      }
      url.searchParams.set("connection_id", __privateGet(this, _connectionIdHex));
      this.clientCache = new ClientCache();
      this.db = __privateMethod(this, _DbConnectionImpl_instances, makeDbView_fn).call(this);
      this.reducers = __privateMethod(this, _DbConnectionImpl_instances, makeReducers_fn).call(this, remoteModule);
      this.procedures = __privateMethod(this, _DbConnectionImpl_instances, makeProcedures_fn).call(this, remoteModule);
      this.wsPromise = createWSFn({
        url,
        nameOrAddress,
        wsProtocol: [...PREFERRED_WS_PROTOCOLS],
        authToken: token,
        compression,
        lightMode,
        confirmedReads
      }).then((v) => {
        this.ws = v;
        this.ws.onclose = () => {
          this.isActive = false;
          __privateGet(this, _emitter3).emit("disconnect", this);
        };
        this.ws.onerror = (e) => {
          this.isActive = false;
          __privateGet(this, _emitter3).emit("connectError", this, e);
        };
        this.ws.onopen = __privateMethod(this, _DbConnectionImpl_instances, handleOnOpen_fn).bind(this);
        this.ws.onmessage = __privateMethod(this, _DbConnectionImpl_instances, handleOnMessage_fn).bind(this);
        return v;
      }).catch((e) => {
        stdbLogger("error", "Error connecting to SpacetimeDB WS");
        __privateGet(this, _emitter3).emit("connectError", this, e);
        return void 0;
      });
    }
    /**
     * Whether the underlying websocket has entered `CLOSING` (2) or `CLOSED`
     * (3). This becomes true even when the browser never delivered an
     * `onclose` event, for example if the socket was torn down while the tab was
     * frozen or the machine was asleep. The `ConnectionManager` uses this to detect
     * such "zombie" connections when the page resumes and to force a reconnect.
     *
     * Returns false while the socket is still `CONNECTING`/`OPEN`, or before
     * the socket has been created.
     */
    get isSocketClosed() {
      const ws = this.ws;
      if (!ws) {
        return false;
      }
      return ws.readyState === WS_READY_STATE_CLOSING || ws.readyState === WS_READY_STATE_CLOSED;
    }
    /** @internal */
    [INTERNAL_REMOTE_MODULE]() {
      return __privateGet(this, _remoteModule);
    }
    getTablesMap() {
      return makeQueryBuilder({ tables: __privateGet(this, _remoteModule).tables });
    }
    registerSubscription(handle, handleEmitter, querySql) {
      const querySetId = __privateGet(this, _getNextQueryId).call(this);
      __privateGet(this, _subscriptionManager).subscriptions.set(querySetId, {
        handle,
        emitter: handleEmitter
      });
      const requestId = __privateGet(this, _getNextRequestId).call(this);
      __privateMethod(this, _DbConnectionImpl_instances, sendMessage_fn).call(this, ClientMessage.Subscribe({
        queryStrings: querySql,
        querySetId: { id: querySetId },
        requestId
      }));
      return querySetId;
    }
    unregisterSubscription(querySetId) {
      const requestId = __privateGet(this, _getNextRequestId).call(this);
      __privateMethod(this, _DbConnectionImpl_instances, sendMessage_fn).call(this, ClientMessage.Unsubscribe({
        querySetId: { id: querySetId },
        requestId,
        flags: UnsubscribeFlags.SendDroppedRows
      }));
    }
    /**
     * Call a reducer on your SpacetimeDB module.
     *
     * @param reducerName The name of the reducer to call
     * @param argsSerializer The arguments to pass to the reducer
     */
    callReducer(reducerName, argsBuffer, reducerArgs) {
      const encodedReducerName = __privateGet(this, _reducerNameBytes)[reducerName];
      if (encodedReducerName) {
        return __privateMethod(this, _DbConnectionImpl_instances, callReducerWithEncodedName_fn).call(this, reducerName, encodedReducerName, argsBuffer, reducerArgs);
      }
      return __privateMethod(this, _DbConnectionImpl_instances, callReducerGeneric_fn).call(this, reducerName, argsBuffer, reducerArgs);
    }
    /**
     * Call a reducer on your SpacetimeDB module with typed arguments.
     * @param reducerSchema The schema of the reducer to call
     * @param callReducerFlags The flags for the reducer call
     * @param params The arguments to pass to the reducer
     */
    callReducerWithParams(reducerName, _paramsType, params) {
      const writer = __privateGet(this, _reducerArgsEncoder);
      writer.clear();
      __privateGet(this, _reducerArgsSerializers)[reducerName].serialize(writer, params);
      const argsBuffer = writer.getBuffer();
      return this.callReducer(reducerName, argsBuffer, params);
    }
    /**
     * Call a reducer on your SpacetimeDB module.
     *
     * @param procedureName The name of the reducer to call
     * @param argsBuffer The arguments to pass to the reducer
     */
    callProcedure(procedureName, argsBuffer) {
      const encodedProcedureName = __privateGet(this, _procedureNameBytes)[procedureName];
      if (encodedProcedureName) {
        return __privateMethod(this, _DbConnectionImpl_instances, callProcedureWithEncodedName_fn).call(this, procedureName, encodedProcedureName, argsBuffer);
      }
      return __privateMethod(this, _DbConnectionImpl_instances, callProcedureGeneric_fn).call(this, procedureName, argsBuffer);
    }
    /**
     * Call a reducer on your SpacetimeDB module with typed arguments.
     * @param reducerSchema The schema of the reducer to call
     * @param callReducerFlags The flags for the reducer call
     * @param params The arguments to pass to the reducer
     */
    callProcedureWithParams(procedureName, _paramsType, params, _returnType) {
      const writer = new BinaryWriter(1024);
      const { serializeArgs, deserializeReturn } = __privateGet(this, _procedureSerializers)[procedureName];
      serializeArgs(writer, params);
      const argsBuffer = writer.getBuffer();
      return this.callProcedure(procedureName, argsBuffer).then((returnBuf) => {
        return deserializeReturn(new BinaryReader(returnBuf));
      });
    }
    /**
     * Close the current connection.
     *
     * @example
     *
     * ```ts
     * const connection = DbConnection.builder().build();
     * connection.disconnect()
     * ```
     */
    disconnect() {
      this.isDisconnectRequested = true;
      this.wsPromise.then((ws) => ws == null ? void 0 : ws.close());
    }
    on(eventName, callback) {
      __privateGet(this, _emitter3).on(eventName, callback);
    }
    off(eventName, callback) {
      __privateGet(this, _emitter3).off(eventName, callback);
    }
    onConnect(callback) {
      __privateGet(this, _emitter3).on("connect", callback);
    }
    onDisconnect(callback) {
      __privateGet(this, _emitter3).on("disconnect", callback);
    }
    onConnectError(callback) {
      __privateGet(this, _emitter3).on("connectError", callback);
    }
    removeOnConnect(callback) {
      __privateGet(this, _emitter3).off("connect", callback);
    }
    removeOnDisconnect(callback) {
      __privateGet(this, _emitter3).off("disconnect", callback);
    }
    removeOnConnectError(callback) {
      __privateGet(this, _emitter3).off("connectError", callback);
    }
  }, _connectionIdHex = new WeakMap(), _queryId = new WeakMap(), _requestId = new WeakMap(), _eventId = new WeakMap(), _emitter3 = new WeakMap(), _inboundQueue = new WeakMap(), _inboundQueueOffset = new WeakMap(), _isDrainingInboundQueue = new WeakMap(), _outboundQueue = new WeakMap(), _isOutboundFlushScheduled = new WeakMap(), _negotiatedWsProtocol = new WeakMap(), _subscriptionManager = new WeakMap(), _remoteModule = new WeakMap(), _reducerCallbacks = new WeakMap(), _reducerCallInfo = new WeakMap(), _procedureCallbacks = new WeakMap(), _rowDeserializers = new WeakMap(), _rowIdMetadata = new WeakMap(), _reducerArgsSerializers = new WeakMap(), _procedureSerializers = new WeakMap(), _reducerNameBytes = new WeakMap(), _procedureNameBytes = new WeakMap(), _sourceNameToTableDef = new WeakMap(), _messageReader = new WeakMap(), _rowListReader = new WeakMap(), _clientFrameEncoder = new WeakMap(), _boundSubscriptionBuilder = new WeakMap(), _boundDisconnect = new WeakMap(), _getNextQueryId = new WeakMap(), _getNextRequestId = new WeakMap(), _DbConnectionImpl_instances = new WeakSet(), makeDbView_fn = function() {
    const view = /* @__PURE__ */ Object.create(null);
    for (const tbl of Object.values(__privateGet(this, _sourceNameToTableDef))) {
      const key = tbl.accessorName;
      Object.defineProperty(view, key, {
        enumerable: true,
        configurable: false,
        get: () => this.clientCache.getOrCreateTable(tbl)
      });
    }
    return view;
  }, makeReducers_fn = function(def) {
    const out = {};
    for (const reducer of def.reducers) {
      const reducerName = reducer.name;
      const encodedReducerName = __privateGet(this, _reducerNameBytes)[reducerName];
      const key = reducer.accessorName;
      const { serialize: serializeArgs } = __privateGet(this, _reducerArgsSerializers)[reducerName];
      out[key] = (params) => {
        const writer = __privateGet(this, _reducerArgsEncoder);
        writer.clear();
        serializeArgs(writer, params);
        const argsBuffer = writer.getBuffer();
        return __privateMethod(this, _DbConnectionImpl_instances, callReducerWithEncodedName_fn).call(this, reducerName, encodedReducerName, argsBuffer, params);
      };
    }
    return out;
  }, makeProcedures_fn = function(def) {
    const out = {};
    const writer = new BinaryWriter(1024);
    for (const procedure of def.procedures) {
      const procedureName = procedure.name;
      const encodedProcedureName = __privateGet(this, _procedureNameBytes)[procedureName];
      const key = procedure.accessorName;
      const { serializeArgs, deserializeReturn } = __privateGet(this, _procedureSerializers)[procedureName];
      out[key] = (params) => {
        writer.clear();
        serializeArgs(writer, params);
        const argsBuffer = writer.getBuffer();
        return __privateMethod(this, _DbConnectionImpl_instances, callProcedureWithEncodedName_fn).call(this, procedureName, encodedProcedureName, argsBuffer).then((returnBuf) => {
          return deserializeReturn(new BinaryReader(returnBuf));
        });
      };
    }
    return out;
  }, makeEventContext_fn = function(event) {
    return {
      db: this.db,
      reducers: this.reducers,
      isActive: this.isActive,
      subscriptionBuilder: __privateGet(this, _boundSubscriptionBuilder),
      disconnect: __privateGet(this, _boundDisconnect),
      event
    };
  }, parseRowList_fn = function(type, tableName, rowList) {
    const buffer = rowList.rowsData;
    const reader = __privateGet(this, _rowListReader);
    reader.reset(buffer);
    const rows = [];
    const deserializeRow = __privateGet(this, _rowDeserializers)[tableName];
    const { primaryKeyColName, primaryKeyColType } = __privateGet(this, _rowIdMetadata)[tableName];
    let previousOffset = 0;
    while (reader.remaining > 0) {
      const row = deserializeRow(reader);
      let rowId = void 0;
      if (primaryKeyColName !== void 0 && primaryKeyColType !== void 0) {
        rowId = AlgebraicType.intoMapKey(
          primaryKeyColType,
          row[primaryKeyColName]
        );
      } else {
        const rowBytes = buffer.subarray(previousOffset, reader.offset);
        const asBase64 = base64JsExports.fromByteArray(rowBytes);
        rowId = asBase64;
      }
      previousOffset = reader.offset;
      rows.push({
        type,
        rowId,
        row
      });
    }
    return rows;
  }, // Take a bunch of table updates and ensure that there is at most one update per table.
  mergeTableUpdates_fn = function(updates) {
    const merged = /* @__PURE__ */ new Map();
    for (const update of updates) {
      const ops = merged.get(update.tableName);
      if (ops) {
        for (const op of update.operations) ops.push(op);
      } else {
        merged.set(update.tableName, update.operations.slice());
      }
    }
    return Array.from(merged, ([tableName, operations]) => ({
      tableName,
      operations
    }));
  }, queryRowsToTableUpdates_fn = function(rows, opType) {
    const updates = [];
    for (const tableRows of rows.tables) {
      updates.push({
        tableName: tableRows.table,
        operations: __privateMethod(this, _DbConnectionImpl_instances, parseRowList_fn).call(this, opType, tableRows.table, tableRows.rows)
      });
    }
    return __privateMethod(this, _DbConnectionImpl_instances, mergeTableUpdates_fn).call(this, updates);
  }, tableUpdateRowsToOperations_fn = function(tableName, rows) {
    if (rows.tag === "PersistentTable") {
      const inserts = __privateMethod(this, _DbConnectionImpl_instances, parseRowList_fn).call(this, "insert", tableName, rows.value.inserts);
      const deletes = __privateMethod(this, _DbConnectionImpl_instances, parseRowList_fn).call(this, "delete", tableName, rows.value.deletes);
      return inserts.concat(deletes);
    }
    if (rows.tag === "EventTable") {
      return __privateMethod(this, _DbConnectionImpl_instances, parseRowList_fn).call(this, "insert", tableName, rows.value.events);
    }
    return [];
  }, querySetUpdateToTableUpdates_fn = function(querySetUpdate) {
    const updates = [];
    for (const tableUpdate of querySetUpdate.tables) {
      let operations = [];
      for (const rows of tableUpdate.rows) {
        operations = operations.concat(
          __privateMethod(this, _DbConnectionImpl_instances, tableUpdateRowsToOperations_fn).call(this, tableUpdate.tableName, rows)
        );
      }
      updates.push({
        tableName: tableUpdate.tableName,
        operations
      });
    }
    return __privateMethod(this, _DbConnectionImpl_instances, mergeTableUpdates_fn).call(this, updates);
  }, flushOutboundQueue_fn = function(wsResolved) {
    if (__privateGet(this, _negotiatedWsProtocol) === V3_WS_PROTOCOL) {
      __privateMethod(this, _DbConnectionImpl_instances, flushOutboundQueueV3_fn).call(this, wsResolved);
      return;
    }
    __privateMethod(this, _DbConnectionImpl_instances, flushOutboundQueueV2_fn).call(this, wsResolved);
  }, flushOutboundQueueV2_fn = function(wsResolved) {
    const pending = __privateGet(this, _outboundQueue).splice(0);
    for (const message of pending) {
      wsResolved.send(message);
    }
  }, flushOutboundQueueV3_fn = function(wsResolved) {
    if (__privateGet(this, _outboundQueue).length === 0) {
      return;
    }
    const batchSize = countClientMessagesForV3Frame(
      __privateGet(this, _outboundQueue),
      MAX_V3_OUTBOUND_FRAME_BYTES
    );
    wsResolved.send(
      encodeClientMessagesV3(
        __privateGet(this, _clientFrameEncoder),
        __privateGet(this, _outboundQueue),
        batchSize
      )
    );
    if (batchSize === __privateGet(this, _outboundQueue).length) {
      __privateGet(this, _outboundQueue).length = 0;
      return;
    }
    __privateGet(this, _outboundQueue).copyWithin(0, batchSize);
    __privateGet(this, _outboundQueue).length -= batchSize;
    if (__privateGet(this, _outboundQueue).length > 0) {
      __privateMethod(this, _DbConnectionImpl_instances, scheduleDeferredOutboundFlush_fn).call(this);
    }
  }, scheduleOutboundFlush_fn = function() {
    __privateMethod(this, _DbConnectionImpl_instances, scheduleOutboundFlushWith_fn).call(this, "microtask");
  }, scheduleDeferredOutboundFlush_fn = function() {
    __privateMethod(this, _DbConnectionImpl_instances, scheduleOutboundFlushWith_fn).call(this, "next-task");
  }, scheduleOutboundFlushWith_fn = function(schedule) {
    if (__privateGet(this, _isOutboundFlushScheduled)) {
      return;
    }
    __privateSet(this, _isOutboundFlushScheduled, true);
    const flush = () => {
      __privateSet(this, _isOutboundFlushScheduled, false);
      if (this.ws && this.isActive) {
        __privateMethod(this, _DbConnectionImpl_instances, flushOutboundQueue_fn).call(this, this.ws);
      }
    };
    if (schedule === "next-task") {
      setTimeout(flush, 0);
    } else {
      queueMicrotask(flush);
    }
  }, _reducerArgsEncoder = new WeakMap(), _clientMessageEncoder = new WeakMap(), sendEncodedMessage_fn = function(encoded, describe) {
    stdbLogger("trace", describe);
    if (this.ws && this.isActive) {
      if (__privateGet(this, _negotiatedWsProtocol) === V2_WS_PROTOCOL) {
        if (__privateGet(this, _outboundQueue).length) __privateMethod(this, _DbConnectionImpl_instances, flushOutboundQueue_fn).call(this, this.ws);
        this.ws.send(encoded);
        return;
      }
      __privateGet(this, _outboundQueue).push(encoded.slice());
      __privateMethod(this, _DbConnectionImpl_instances, scheduleOutboundFlush_fn).call(this);
    } else {
      __privateGet(this, _outboundQueue).push(encoded.slice());
    }
  }, sendMessage_fn = function(message) {
    const writer = __privateGet(this, _clientMessageEncoder);
    writer.clear();
    ClientMessage.serialize(writer, message);
    const encoded = writer.getBuffer();
    const isLive = !!(this.ws && this.isActive);
    __privateMethod(this, _DbConnectionImpl_instances, sendEncodedMessage_fn).call(this, encoded, () => isLive ? `Sending message to server: ${stringify(message)}` : `Queuing message to server: ${stringify(message)}`);
  }, sendCallReducerMessage_fn = function(requestId, reducerNameBytes, argsBuffer) {
    const writer = __privateGet(this, _clientMessageEncoder);
    writer.clear();
    writer.writeByte(CLIENT_MESSAGE_CALL_REDUCER_TAG);
    writer.writeU32(requestId);
    writer.writeU8(0);
    writer.writeUInt8Array(reducerNameBytes);
    writer.writeUInt8Array(argsBuffer);
    const encoded = writer.getBuffer();
    __privateMethod(this, _DbConnectionImpl_instances, sendEncodedMessage_fn).call(this, encoded, () => `Sending reducer call message to server: requestId=${requestId}`);
  }, sendCallProcedureMessage_fn = function(requestId, procedureNameBytes, argsBuffer) {
    const writer = __privateGet(this, _clientMessageEncoder);
    writer.clear();
    writer.writeByte(CLIENT_MESSAGE_CALL_PROCEDURE_TAG);
    writer.writeU32(requestId);
    writer.writeU8(0);
    writer.writeUInt8Array(procedureNameBytes);
    writer.writeUInt8Array(argsBuffer);
    const encoded = writer.getBuffer();
    __privateMethod(this, _DbConnectionImpl_instances, sendEncodedMessage_fn).call(this, encoded, () => `Sending procedure call message to server: requestId=${requestId}`);
  }, setConnectionId_fn = function(connectionId) {
    this.connectionId = connectionId;
    __privateSet(this, _connectionIdHex, connectionId.toHexString());
  }, nextEventId_fn = function() {
    __privateSet(this, _eventId, __privateGet(this, _eventId) + 1);
    return `${__privateGet(this, _connectionIdHex)}:${__privateGet(this, _eventId)}`;
  }, /**
   * Handles WebSocket onOpen event.
   */
  handleOnOpen_fn = function() {
    if (this.ws) {
      __privateSet(this, _negotiatedWsProtocol, normalizeWsProtocol(this.ws.protocol));
    }
    this.isActive = true;
    if (this.ws) {
      __privateMethod(this, _DbConnectionImpl_instances, flushOutboundQueue_fn).call(this, this.ws);
    }
  }, applyTableUpdates_fn = function(tableUpdates, eventContext) {
    const pendingCallbacks = [];
    for (const tableUpdate of tableUpdates) {
      const tableName = tableUpdate.tableName;
      const tableDef = __privateGet(this, _sourceNameToTableDef)[tableName];
      const table2 = this.clientCache.getOrCreateTable(tableDef);
      const newCallbacks = table2.applyOperations(
        tableUpdate.operations,
        eventContext
      );
      for (const callback of newCallbacks) {
        pendingCallbacks.push(callback);
      }
    }
    return pendingCallbacks;
  }, applyTransactionUpdates_fn = function(eventContext, tu) {
    const allUpdates = [];
    for (const querySetUpdate of tu.querySets) {
      const tableUpdates = __privateMethod(this, _DbConnectionImpl_instances, querySetUpdateToTableUpdates_fn).call(this, querySetUpdate);
      for (const update of tableUpdates) {
        allUpdates.push(update);
      }
    }
    return __privateMethod(this, _DbConnectionImpl_instances, applyTableUpdates_fn).call(this, __privateMethod(this, _DbConnectionImpl_instances, mergeTableUpdates_fn).call(this, allUpdates), eventContext);
  }, dispatchPendingCallbacks_fn = function(callbacks) {
    stdbLogger(
      "trace",
      () => `Calling ${callbacks.length} triggered row callbacks`
    );
    for (const callback of callbacks) {
      callback.cb();
    }
  }, processServerMessage_fn = function(serverMessage) {
    stdbLogger(
      "trace",
      () => `Processing server message: ${stringify(serverMessage)}`
    );
    switch (serverMessage.tag) {
      case "InitialConnection": {
        this.identity = serverMessage.value.identity;
        if (!this.token && serverMessage.value.token) {
          this.token = serverMessage.value.token;
        }
        __privateMethod(this, _DbConnectionImpl_instances, setConnectionId_fn).call(this, serverMessage.value.connectionId);
        __privateGet(this, _emitter3).emit("connect", this, this.identity, this.token);
        break;
      }
      case "SubscribeApplied": {
        const querySetId = serverMessage.value.querySetId.id;
        const subscription = __privateGet(this, _subscriptionManager).subscriptions.get(querySetId);
        if (!subscription) {
          stdbLogger(
            "error",
            `Received SubscribeApplied for unknown querySetId ${querySetId}.`
          );
          return;
        }
        const event = {
          id: __privateMethod(this, _DbConnectionImpl_instances, nextEventId_fn).call(this),
          tag: "SubscribeApplied"
        };
        const eventContext = __privateMethod(this, _DbConnectionImpl_instances, makeEventContext_fn).call(this, event);
        const tableUpdates = __privateMethod(this, _DbConnectionImpl_instances, queryRowsToTableUpdates_fn).call(this, serverMessage.value.rows, "insert");
        const callbacks = __privateMethod(this, _DbConnectionImpl_instances, applyTableUpdates_fn).call(this, tableUpdates, eventContext);
        const { event: _, ...subscriptionEventContext } = eventContext;
        subscription.emitter.emit("applied", subscriptionEventContext);
        __privateMethod(this, _DbConnectionImpl_instances, dispatchPendingCallbacks_fn).call(this, callbacks);
        break;
      }
      case "UnsubscribeApplied": {
        const querySetId = serverMessage.value.querySetId.id;
        const subscription = __privateGet(this, _subscriptionManager).subscriptions.get(querySetId);
        if (!subscription) {
          stdbLogger(
            "error",
            `Received UnsubscribeApplied for unknown querySetId ${querySetId}.`
          );
          return;
        }
        const event = {
          id: __privateMethod(this, _DbConnectionImpl_instances, nextEventId_fn).call(this),
          tag: "UnsubscribeApplied"
        };
        const eventContext = __privateMethod(this, _DbConnectionImpl_instances, makeEventContext_fn).call(this, event);
        const tableUpdates = serverMessage.value.rows ? __privateMethod(this, _DbConnectionImpl_instances, queryRowsToTableUpdates_fn).call(this, serverMessage.value.rows, "delete") : [];
        const callbacks = __privateMethod(this, _DbConnectionImpl_instances, applyTableUpdates_fn).call(this, tableUpdates, eventContext);
        const { event: _, ...subscriptionEventContext } = eventContext;
        subscription.emitter.emit("end", subscriptionEventContext);
        __privateGet(this, _subscriptionManager).subscriptions.delete(querySetId);
        __privateMethod(this, _DbConnectionImpl_instances, dispatchPendingCallbacks_fn).call(this, callbacks);
        break;
      }
      case "SubscriptionError": {
        const querySetId = serverMessage.value.querySetId.id;
        const requestId = serverMessage.value.requestId;
        const error = Error(serverMessage.value.error);
        const event = {
          id: __privateMethod(this, _DbConnectionImpl_instances, nextEventId_fn).call(this),
          tag: "Error",
          value: error
        };
        const eventContext = __privateMethod(this, _DbConnectionImpl_instances, makeEventContext_fn).call(this, event);
        const errorContext = {
          ...eventContext,
          event: error
        };
        if (requestId == null) {
          stdbLogger(
            "error",
            `Disconnecting due to error for a previously applied subscription: ${serverMessage.value.error}`
          );
          this.disconnect();
          break;
        }
        const subscription = __privateGet(this, _subscriptionManager).subscriptions.get(querySetId);
        if (subscription) {
          subscription.emitter.emit("error", errorContext, error);
          __privateGet(this, _subscriptionManager).subscriptions.delete(querySetId);
        } else {
          stdbLogger(
            "error",
            `Received SubscriptionError for unknown querySetId ${querySetId}:`,
            error
          );
        }
        break;
      }
      case "TransactionUpdate": {
        const event = {
          id: __privateMethod(this, _DbConnectionImpl_instances, nextEventId_fn).call(this),
          tag: "Transaction"
        };
        const eventContext = __privateMethod(this, _DbConnectionImpl_instances, makeEventContext_fn).call(this, event);
        const callbacks = __privateMethod(this, _DbConnectionImpl_instances, applyTransactionUpdates_fn).call(this, eventContext, serverMessage.value);
        __privateMethod(this, _DbConnectionImpl_instances, dispatchPendingCallbacks_fn).call(this, callbacks);
        break;
      }
      case "ReducerResult": {
        const { requestId, result } = serverMessage.value;
        if (result.tag === "Ok") {
          const reducerInfo = __privateGet(this, _reducerCallInfo).get(requestId);
          const eventId = __privateMethod(this, _DbConnectionImpl_instances, nextEventId_fn).call(this);
          const event = reducerInfo ? {
            id: eventId,
            tag: "Reducer",
            value: {
              timestamp: serverMessage.value.timestamp,
              outcome: result,
              reducer: {
                name: reducerInfo.name,
                args: reducerInfo.args
              }
            }
          } : {
            id: eventId,
            tag: "Transaction"
          };
          const eventContext = __privateMethod(this, _DbConnectionImpl_instances, makeEventContext_fn).call(this, event);
          const callbacks = __privateMethod(this, _DbConnectionImpl_instances, applyTransactionUpdates_fn).call(this, eventContext, result.value.transactionUpdate);
          __privateMethod(this, _DbConnectionImpl_instances, dispatchPendingCallbacks_fn).call(this, callbacks);
        }
        __privateGet(this, _reducerCallInfo).delete(requestId);
        const cb = __privateGet(this, _reducerCallbacks).get(requestId);
        __privateGet(this, _reducerCallbacks).delete(requestId);
        cb == null ? void 0 : cb(result);
        break;
      }
      case "ProcedureResult": {
        const { status, requestId } = serverMessage.value;
        const result = status.tag === "Returned" ? { tag: "Ok", value: status.value } : { tag: "Err", value: status.value };
        const cb = __privateGet(this, _procedureCallbacks).get(requestId);
        __privateGet(this, _procedureCallbacks).delete(requestId);
        cb == null ? void 0 : cb(result);
        break;
      }
      case "OneOffQueryResult": {
        stdbLogger(
          "warn",
          "Received OneOffQueryResult but SDK does not expose one-off query APIs yet."
        );
        break;
      }
    }
  }, processV2Message_fn = function(data) {
    const reader = __privateGet(this, _messageReader);
    reader.reset(data);
    __privateMethod(this, _DbConnectionImpl_instances, processServerMessage_fn).call(this, ServerMessage.deserialize(reader));
  }, processMessage_fn = function(data) {
    if (__privateGet(this, _negotiatedWsProtocol) !== V3_WS_PROTOCOL) {
      __privateMethod(this, _DbConnectionImpl_instances, processV2Message_fn).call(this, data);
      return;
    }
    const messageCount = forEachServerMessageV3(
      __privateGet(this, _messageReader),
      data,
      (serverMessage) => {
        __privateMethod(this, _DbConnectionImpl_instances, processServerMessage_fn).call(this, serverMessage);
      }
    );
    stdbLogger(
      "trace",
      () => `Processing server v3 payload with ${messageCount} message(s)`
    );
  }, /**
   * Handles WebSocket onMessage event.
   * @param wsMessage MessageEvent object.
   */
  handleOnMessage_fn = function(wsMessage) {
    __privateGet(this, _inboundQueue).push(wsMessage.data);
    if (__privateGet(this, _isDrainingInboundQueue)) {
      return;
    }
    __privateSet(this, _isDrainingInboundQueue, true);
    try {
      while (__privateGet(this, _inboundQueueOffset) < __privateGet(this, _inboundQueue).length) {
        const data = __privateGet(this, _inboundQueue)[__privateGet(this, _inboundQueueOffset)];
        __privateSet(this, _inboundQueueOffset, __privateGet(this, _inboundQueueOffset) + 1);
        if (data) {
          __privateMethod(this, _DbConnectionImpl_instances, processMessage_fn).call(this, data);
        }
      }
    } finally {
      if (__privateGet(this, _inboundQueueOffset) >= __privateGet(this, _inboundQueue).length) {
        __privateGet(this, _inboundQueue).length = 0;
      } else if (__privateGet(this, _inboundQueueOffset) > 0) {
        __privateSet(this, _inboundQueue, __privateGet(this, _inboundQueue).slice(__privateGet(this, _inboundQueueOffset)));
      }
      __privateSet(this, _inboundQueueOffset, 0);
      __privateSet(this, _isDrainingInboundQueue, false);
    }
  }, callReducerWithEncodedName_fn = function(reducerName, encodedReducerName, argsBuffer, reducerArgs) {
    const { promise, resolve, reject } = createDeferred();
    const requestId = __privateGet(this, _getNextRequestId).call(this);
    __privateMethod(this, _DbConnectionImpl_instances, sendCallReducerMessage_fn).call(this, requestId, encodedReducerName, argsBuffer);
    if (reducerArgs) {
      __privateGet(this, _reducerCallInfo).set(requestId, {
        name: reducerName,
        args: reducerArgs
      });
    }
    __privateGet(this, _reducerCallbacks).set(requestId, (result) => {
      if (result.tag === "Ok" || result.tag === "OkEmpty") {
        resolve();
      } else {
        if (result.tag === "Err") {
          const reader = new BinaryReader(result.value);
          const errorString = reader.readString();
          reject(new SenderError(errorString));
        } else if (result.tag === "InternalError") {
          reject(new InternalError(result.value));
        } else {
          reject(new Error("Unexpected reducer result"));
        }
      }
    });
    return promise;
  }, callReducerGeneric_fn = function(reducerName, argsBuffer, reducerArgs) {
    const { promise, resolve, reject } = createDeferred();
    const requestId = __privateGet(this, _getNextRequestId).call(this);
    const message = ClientMessage.CallReducer({
      reducer: reducerName,
      args: argsBuffer,
      requestId,
      flags: 0
    });
    __privateMethod(this, _DbConnectionImpl_instances, sendMessage_fn).call(this, message);
    if (reducerArgs) {
      __privateGet(this, _reducerCallInfo).set(requestId, {
        name: reducerName,
        args: reducerArgs
      });
    }
    __privateGet(this, _reducerCallbacks).set(requestId, (result) => {
      if (result.tag === "Ok" || result.tag === "OkEmpty") {
        resolve();
      } else {
        if (result.tag === "Err") {
          const reader = new BinaryReader(result.value);
          const errorString = reader.readString();
          reject(new SenderError(errorString));
        } else if (result.tag === "InternalError") {
          reject(new InternalError(result.value));
        } else {
          reject(new Error("Unexpected reducer result"));
        }
      }
    });
    return promise;
  }, callProcedureWithEncodedName_fn = function(procedureName, encodedProcedureName, argsBuffer) {
    const { promise, resolve, reject } = createDeferred();
    const requestId = __privateGet(this, _getNextRequestId).call(this);
    __privateMethod(this, _DbConnectionImpl_instances, sendCallProcedureMessage_fn).call(this, requestId, encodedProcedureName, argsBuffer);
    __privateGet(this, _procedureCallbacks).set(requestId, (result) => {
      if (result.tag === "Ok") {
        resolve(result.value);
      } else {
        reject(result.value);
      }
    });
    return promise;
  }, callProcedureGeneric_fn = function(procedureName, argsBuffer) {
    const { promise, resolve, reject } = createDeferred();
    const requestId = __privateGet(this, _getNextRequestId).call(this);
    const message = ClientMessage.CallProcedure({
      procedure: procedureName,
      args: argsBuffer,
      requestId,
      // reserved for future use - 0 is the only valid value
      flags: 0
    });
    __privateMethod(this, _DbConnectionImpl_instances, sendMessage_fn).call(this, message);
    __privateGet(this, _procedureCallbacks).set(requestId, (result) => {
      if (result.tag === "Ok") {
        resolve(result.value);
      } else {
        reject(result.value);
      }
    });
    return promise;
  }, _p);
  function tablesToSchema(ctx, tables2) {
    const tableDefs = /* @__PURE__ */ Object.create(null);
    for (const [accName, schema2] of Object.entries(tables2)) {
      tableDefs[accName] = tableToSchema(
        accName,
        schema2,
        schema2.tableDef(ctx, accName)
      );
    }
    return {
      tables: tableDefs
    };
  }
  function tableToSchema(accName, schema2, tableDef) {
    const getColName = (i) => schema2.rowType.algebraicType.value.elements[i].name;
    const resolvedIndexes = tableDef.indexes.map(
      (idx) => {
        const accessorName = idx.accessorName;
        if (typeof accessorName !== "string" || accessorName.length === 0) {
          throw new TypeError(
            `Index '${idx.sourceName ?? "<unknown>"}' on table '${tableDef.sourceName}' is missing accessor name`
          );
        }
        const columnIds = idx.algorithm.tag === "Direct" ? [idx.algorithm.value] : idx.algorithm.value;
        const unique = tableDef.constraints.some(
          (c) => c.data.tag === "Unique" && c.data.value.columns.every((col) => columnIds.includes(col))
        );
        const algorithm = {
          BTree: "btree",
          Hash: "hash",
          Direct: "direct"
        }[idx.algorithm.tag];
        return {
          name: accessorName,
          unique,
          algorithm,
          columns: columnIds.map(getColName)
        };
      }
    );
    return {
      // For client,`schama.tableName` will always be there as canonical name.
      // For module, if explicit name is not provided via `name`, accessor name will
      // be used, it is stored as alias in database, hence works in query builder.
      sourceName: schema2.tableName || accName,
      accessorName: accName,
      columns: schema2.rowType.row,
      // typed as T[i]['rowType']['row'] under TablesToSchema<T>
      rowType: schema2.rowSpacetimeType,
      // Keep declarative indexes in their original shape for type-level consumers.
      indexes: schema2.idxs,
      constraints: tableDef.constraints.map((c) => ({
        name: c.sourceName,
        constraint: "unique",
        columns: c.data.value.columns.map(getColName)
      })),
      // Expose resolved runtime indexes separately so runtime users don't have to
      // reinterpret `indexes` with unsafe casts.
      resolvedIndexes,
      tableDef,
      ...tableDef.isEvent ? { isEvent: true } : {}
    };
  }
  var ModuleContext = (_q = class {
    constructor() {
      __privateAdd(this, _ModuleContext_instances);
      __privateAdd(this, _compoundTypes, /* @__PURE__ */ new Map());
      /**
       * The global module definition that gets populated by calls to `reducer()` and lifecycle hooks.
       */
      __privateAdd(this, _moduleDef, {
        typespace: { types: [] },
        tables: [],
        reducers: [],
        types: [],
        rowLevelSecurity: [],
        schedules: [],
        procedures: [],
        views: [],
        viewPrimaryKeys: [],
        lifeCycleReducers: [],
        httpHandlers: [],
        httpRoutes: [],
        caseConversionPolicy: { tag: "SnakeCase" },
        explicitNames: {
          entries: []
        }
      });
    }
    get moduleDef() {
      return __privateGet(this, _moduleDef);
    }
    rawModuleDefV10() {
      const sections = [];
      const push = (s) => {
        if (s) sections.push(s);
      };
      const module = __privateGet(this, _moduleDef);
      push(module.typespace && { tag: "Typespace", value: module.typespace });
      push(module.types && { tag: "Types", value: module.types });
      push(module.tables && { tag: "Tables", value: module.tables });
      push(module.reducers && { tag: "Reducers", value: module.reducers });
      push(module.procedures && { tag: "Procedures", value: module.procedures });
      push(module.views && { tag: "Views", value: module.views });
      push(
        module.viewPrimaryKeys && {
          tag: "ViewPrimaryKeys",
          value: module.viewPrimaryKeys
        }
      );
      push(module.schedules && { tag: "Schedules", value: module.schedules });
      push(
        module.lifeCycleReducers && {
          tag: "LifeCycleReducers",
          value: module.lifeCycleReducers
        }
      );
      push(
        module.httpHandlers && {
          tag: "HttpHandlers",
          value: module.httpHandlers
        }
      );
      push(
        module.httpRoutes && {
          tag: "HttpRoutes",
          value: module.httpRoutes
        }
      );
      push(
        module.rowLevelSecurity && {
          tag: "RowLevelSecurity",
          value: module.rowLevelSecurity
        }
      );
      push(
        module.explicitNames && {
          tag: "ExplicitNames",
          value: module.explicitNames
        }
      );
      push(
        module.caseConversionPolicy && {
          tag: "CaseConversionPolicy",
          value: module.caseConversionPolicy
        }
      );
      return { sections };
    }
    /**
     * Set the case conversion policy for this module.
     * Called by the settings mechanism.
     */
    setCaseConversionPolicy(policy) {
      __privateGet(this, _moduleDef).caseConversionPolicy = policy;
    }
    get typespace() {
      return __privateGet(this, _moduleDef).typespace;
    }
    /**
     * Resolves the actual type of a TypeBuilder by following its references until it reaches a non-ref type.
     * @param typespace The typespace to resolve types against.
     * @param typeBuilder The TypeBuilder to resolve.
     * @returns The resolved algebraic type.
     */
    resolveType(typeBuilder) {
      let ty = typeBuilder.algebraicType;
      while (ty.tag === "Ref") {
        ty = this.typespace.types[ty.value];
      }
      return ty;
    }
    /**
     * Adds a type to the module definition's typespace as a `Ref` if it is a named compound type (Product or Sum).
     * Otherwise, returns the type as is.
     * @param name
     * @param ty
     * @returns
     */
    registerTypesRecursively(typeBuilder) {
      if (typeBuilder instanceof ProductBuilder && !isUnit(typeBuilder) || typeBuilder instanceof SumBuilder || typeBuilder instanceof RowBuilder) {
        return __privateMethod(this, _ModuleContext_instances, registerCompoundTypeRecursively_fn).call(this, typeBuilder);
      } else if (typeBuilder instanceof OptionBuilder) {
        return new OptionBuilder(
          this.registerTypesRecursively(typeBuilder.value)
        );
      } else if (typeBuilder instanceof ResultBuilder) {
        return new ResultBuilder(
          this.registerTypesRecursively(typeBuilder.ok),
          this.registerTypesRecursively(typeBuilder.err)
        );
      } else if (typeBuilder instanceof ArrayBuilder) {
        return new ArrayBuilder(
          this.registerTypesRecursively(typeBuilder.element)
        );
      } else {
        return typeBuilder;
      }
    }
  }, _compoundTypes = new WeakMap(), _moduleDef = new WeakMap(), _ModuleContext_instances = new WeakSet(), registerCompoundTypeRecursively_fn = function(typeBuilder) {
    const ty = typeBuilder.algebraicType;
    const name = typeBuilder.typeName;
    if (name === void 0) {
      throw new Error(
        `Missing type name for ${typeBuilder.constructor.name ?? "TypeBuilder"} ${JSON.stringify(typeBuilder)}`
      );
    }
    let r = __privateGet(this, _compoundTypes).get(ty);
    if (r != null) {
      return r;
    }
    const newTy = typeBuilder instanceof RowBuilder || typeBuilder instanceof ProductBuilder ? {
      tag: "Product",
      value: { elements: [] }
    } : {
      tag: "Sum",
      value: { variants: [] }
    };
    r = new RefBuilder(__privateGet(this, _moduleDef).typespace.types.length);
    __privateGet(this, _moduleDef).typespace.types.push(newTy);
    __privateGet(this, _compoundTypes).set(ty, r);
    if (typeBuilder instanceof RowBuilder) {
      for (const [name2, elem] of Object.entries(typeBuilder.row)) {
        newTy.value.elements.push({
          name: name2,
          algebraicType: this.registerTypesRecursively(elem.typeBuilder).algebraicType
        });
      }
    } else if (typeBuilder instanceof ProductBuilder) {
      for (const [name2, elem] of Object.entries(typeBuilder.elements)) {
        newTy.value.elements.push({
          name: name2,
          algebraicType: this.registerTypesRecursively(elem).algebraicType
        });
      }
    } else if (typeBuilder instanceof SumBuilder) {
      for (const [name2, variant] of Object.entries(typeBuilder.variants)) {
        newTy.value.variants.push({
          name: name2,
          algebraicType: this.registerTypesRecursively(variant).algebraicType
        });
      }
    }
    __privateGet(this, _moduleDef).types.push({
      sourceName: splitName(name),
      ty: r.ref,
      customOrdering: true
    });
    return r;
  }, _q);
  function isUnit(typeBuilder) {
    return typeBuilder.typeName == null && typeBuilder.algebraicType.value.elements.length === 0;
  }
  function splitName(name) {
    const scope = name.split(".");
    return { sourceName: scope.pop(), scope };
  }
  var Tables = class {
    constructor(schemaType) {
      this.schemaType = schemaType;
    }
  };
  function schema(tables2) {
    const ctx = new ModuleContext();
    return new Tables(tablesToSchema(ctx, tables2));
  }
  function convertToAccessorMap(arr) {
    return Object.fromEntries(
      arr.map((v) => [v.accessorName, v])
    );
  }
  var AlgebraicType2 = t.enum("AlgebraicType", {
    Ref: t.u32(),
    get Sum() {
      return SumType2;
    },
    get Product() {
      return ProductType2;
    },
    get Array() {
      return AlgebraicType2;
    },
    String: t.unit(),
    Bool: t.unit(),
    I8: t.unit(),
    U8: t.unit(),
    I16: t.unit(),
    U16: t.unit(),
    I32: t.unit(),
    U32: t.unit(),
    I64: t.unit(),
    U64: t.unit(),
    I128: t.unit(),
    U128: t.unit(),
    I256: t.unit(),
    U256: t.unit(),
    F32: t.unit(),
    F64: t.unit()
  });
  var CaseConversionPolicy = t.enum("CaseConversionPolicy", {
    None: t.unit(),
    SnakeCase: t.unit()
  });
  var ExplicitNameEntry = t.enum("ExplicitNameEntry", {
    get Table() {
      return NameMapping;
    },
    get Function() {
      return NameMapping;
    },
    get Index() {
      return NameMapping;
    }
  });
  var ExplicitNames = t.object("ExplicitNames", {
    get entries() {
      return t.array(ExplicitNameEntry);
    }
  });
  var FunctionVisibility = t.enum("FunctionVisibility", {
    Private: t.unit(),
    ClientCallable: t.unit()
  });
  var HttpHeaderPair = t.object("HttpHeaderPair", {
    name: t.string(),
    value: t.byteArray()
  });
  var HttpHeaders = t.object("HttpHeaders", {
    get entries() {
      return t.array(HttpHeaderPair);
    }
  });
  var HttpMethod = t.enum("HttpMethod", {
    Get: t.unit(),
    Head: t.unit(),
    Post: t.unit(),
    Put: t.unit(),
    Delete: t.unit(),
    Connect: t.unit(),
    Options: t.unit(),
    Trace: t.unit(),
    Patch: t.unit(),
    Extension: t.string()
  });
  t.object("HttpRequest", {
    get method() {
      return HttpMethod;
    },
    get headers() {
      return HttpHeaders;
    },
    timeout: t.option(t.timeDuration()),
    uri: t.string(),
    get version() {
      return HttpVersion;
    }
  });
  t.object("HttpResponse", {
    get headers() {
      return HttpHeaders;
    },
    get version() {
      return HttpVersion;
    },
    code: t.u16()
  });
  var HttpVersion = t.enum("HttpVersion", {
    Http09: t.unit(),
    Http10: t.unit(),
    Http11: t.unit(),
    Http2: t.unit(),
    Http3: t.unit()
  });
  var IndexType = t.enum("IndexType", {
    BTree: t.unit(),
    Hash: t.unit()
  });
  var Lifecycle = t.enum("Lifecycle", {
    Init: t.unit(),
    OnConnect: t.unit(),
    OnDisconnect: t.unit()
  });
  var MethodOrAny = t.enum("MethodOrAny", {
    Any: t.unit(),
    get Method() {
      return HttpMethod;
    }
  });
  var MiscModuleExport = t.enum("MiscModuleExport", {
    get TypeAlias() {
      return TypeAlias;
    }
  });
  var NameMapping = t.object("NameMapping", {
    sourceName: t.string(),
    canonicalName: t.string()
  });
  var ProductType2 = t.object("ProductType", {
    get elements() {
      return t.array(ProductTypeElement);
    }
  });
  var ProductTypeElement = t.object("ProductTypeElement", {
    name: t.option(t.string()),
    get algebraicType() {
      return AlgebraicType2;
    }
  });
  var RawColumnDefV8 = t.object("RawColumnDefV8", {
    colName: t.string(),
    get colType() {
      return AlgebraicType2;
    }
  });
  var RawColumnDefaultValueV10 = t.object("RawColumnDefaultValueV10", {
    colId: t.u16(),
    value: t.byteArray()
  });
  var RawColumnDefaultValueV9 = t.object("RawColumnDefaultValueV9", {
    table: t.string(),
    colId: t.u16(),
    value: t.byteArray()
  });
  var RawConstraintDataV9 = t.enum("RawConstraintDataV9", {
    get Unique() {
      return RawUniqueConstraintDataV9;
    }
  });
  var RawConstraintDefV10 = t.object("RawConstraintDefV10", {
    sourceName: t.option(t.string()),
    get data() {
      return RawConstraintDataV9;
    }
  });
  var RawConstraintDefV8 = t.object("RawConstraintDefV8", {
    constraintName: t.string(),
    constraints: t.u8(),
    columns: t.array(t.u16())
  });
  var RawConstraintDefV9 = t.object("RawConstraintDefV9", {
    name: t.option(t.string()),
    get data() {
      return RawConstraintDataV9;
    }
  });
  var RawHttpHandlerDefV10 = t.object("RawHttpHandlerDefV10", {
    sourceName: t.string()
  });
  var RawHttpRouteDefV10 = t.object("RawHttpRouteDefV10", {
    handlerFunction: t.string(),
    get method() {
      return MethodOrAny;
    },
    path: t.string()
  });
  var RawIndexAlgorithm = t.enum("RawIndexAlgorithm", {
    BTree: t.array(t.u16()),
    Hash: t.array(t.u16()),
    Direct: t.u16()
  });
  var RawIndexDefV10 = t.object("RawIndexDefV10", {
    sourceName: t.option(t.string()),
    accessorName: t.option(t.string()),
    get algorithm() {
      return RawIndexAlgorithm;
    }
  });
  var RawIndexDefV8 = t.object("RawIndexDefV8", {
    indexName: t.string(),
    isUnique: t.bool(),
    get indexType() {
      return IndexType;
    },
    columns: t.array(t.u16())
  });
  var RawIndexDefV9 = t.object("RawIndexDefV9", {
    name: t.option(t.string()),
    accessorName: t.option(t.string()),
    get algorithm() {
      return RawIndexAlgorithm;
    }
  });
  var RawLifeCycleReducerDefV10 = t.object(
    "RawLifeCycleReducerDefV10",
    {
      get lifecycleSpec() {
        return Lifecycle;
      },
      functionName: t.string()
    }
  );
  var RawMiscModuleExportV9 = t.enum("RawMiscModuleExportV9", {
    get ColumnDefaultValue() {
      return RawColumnDefaultValueV9;
    },
    get Procedure() {
      return RawProcedureDefV9;
    },
    get View() {
      return RawViewDefV9;
    }
  });
  t.enum("RawModuleDef", {
    get V8BackCompat() {
      return RawModuleDefV8;
    },
    get V9() {
      return RawModuleDefV9;
    },
    get V10() {
      return RawModuleDefV10;
    }
  });
  var RawModuleDefV10 = t.object("RawModuleDefV10", {
    get sections() {
      return t.array(RawModuleDefV10Section);
    }
  });
  var RawModuleDefV10Section = t.enum("RawModuleDefV10Section", {
    get Typespace() {
      return Typespace;
    },
    get Types() {
      return t.array(RawTypeDefV10);
    },
    get Tables() {
      return t.array(RawTableDefV10);
    },
    get Reducers() {
      return t.array(RawReducerDefV10);
    },
    get Procedures() {
      return t.array(RawProcedureDefV10);
    },
    get Views() {
      return t.array(RawViewDefV10);
    },
    get Schedules() {
      return t.array(RawScheduleDefV10);
    },
    get LifeCycleReducers() {
      return t.array(RawLifeCycleReducerDefV10);
    },
    get RowLevelSecurity() {
      return t.array(RawRowLevelSecurityDefV9);
    },
    get CaseConversionPolicy() {
      return CaseConversionPolicy;
    },
    get ExplicitNames() {
      return ExplicitNames;
    },
    get HttpHandlers() {
      return t.array(RawHttpHandlerDefV10);
    },
    get HttpRoutes() {
      return t.array(RawHttpRouteDefV10);
    },
    get ViewPrimaryKeys() {
      return t.array(RawViewPrimaryKeyDefV10);
    }
  });
  var RawModuleDefV8 = t.object("RawModuleDefV8", {
    get typespace() {
      return Typespace;
    },
    get tables() {
      return t.array(TableDesc);
    },
    get reducers() {
      return t.array(ReducerDef);
    },
    get miscExports() {
      return t.array(MiscModuleExport);
    }
  });
  var RawModuleDefV9 = t.object("RawModuleDefV9", {
    get typespace() {
      return Typespace;
    },
    get tables() {
      return t.array(RawTableDefV9);
    },
    get reducers() {
      return t.array(RawReducerDefV9);
    },
    get types() {
      return t.array(RawTypeDefV9);
    },
    get miscExports() {
      return t.array(RawMiscModuleExportV9);
    },
    get rowLevelSecurity() {
      return t.array(RawRowLevelSecurityDefV9);
    }
  });
  var RawProcedureDefV10 = t.object("RawProcedureDefV10", {
    sourceName: t.string(),
    get params() {
      return ProductType2;
    },
    get returnType() {
      return AlgebraicType2;
    },
    get visibility() {
      return FunctionVisibility;
    }
  });
  var RawProcedureDefV9 = t.object("RawProcedureDefV9", {
    name: t.string(),
    get params() {
      return ProductType2;
    },
    get returnType() {
      return AlgebraicType2;
    }
  });
  var RawReducerDefV10 = t.object("RawReducerDefV10", {
    sourceName: t.string(),
    get params() {
      return ProductType2;
    },
    get visibility() {
      return FunctionVisibility;
    },
    get okReturnType() {
      return AlgebraicType2;
    },
    get errReturnType() {
      return AlgebraicType2;
    }
  });
  var RawReducerDefV9 = t.object("RawReducerDefV9", {
    name: t.string(),
    get params() {
      return ProductType2;
    },
    get lifecycle() {
      return t.option(Lifecycle);
    }
  });
  var RawRowLevelSecurityDefV9 = t.object("RawRowLevelSecurityDefV9", {
    sql: t.string()
  });
  var RawScheduleDefV10 = t.object("RawScheduleDefV10", {
    sourceName: t.option(t.string()),
    tableName: t.string(),
    scheduleAtCol: t.u16(),
    functionName: t.string()
  });
  var RawScheduleDefV9 = t.object("RawScheduleDefV9", {
    name: t.option(t.string()),
    reducerName: t.string(),
    scheduledAtColumn: t.u16()
  });
  var RawScopedTypeNameV10 = t.object("RawScopedTypeNameV10", {
    scope: t.array(t.string()),
    sourceName: t.string()
  });
  var RawScopedTypeNameV9 = t.object("RawScopedTypeNameV9", {
    scope: t.array(t.string()),
    name: t.string()
  });
  var RawSequenceDefV10 = t.object("RawSequenceDefV10", {
    sourceName: t.option(t.string()),
    column: t.u16(),
    start: t.option(t.i128()),
    minValue: t.option(t.i128()),
    maxValue: t.option(t.i128()),
    increment: t.i128()
  });
  var RawSequenceDefV8 = t.object("RawSequenceDefV8", {
    sequenceName: t.string(),
    colPos: t.u16(),
    increment: t.i128(),
    start: t.option(t.i128()),
    minValue: t.option(t.i128()),
    maxValue: t.option(t.i128()),
    allocated: t.i128()
  });
  var RawSequenceDefV9 = t.object("RawSequenceDefV9", {
    name: t.option(t.string()),
    column: t.u16(),
    start: t.option(t.i128()),
    minValue: t.option(t.i128()),
    maxValue: t.option(t.i128()),
    increment: t.i128()
  });
  var RawTableDefV10 = t.object("RawTableDefV10", {
    sourceName: t.string(),
    productTypeRef: t.u32(),
    primaryKey: t.array(t.u16()),
    get indexes() {
      return t.array(RawIndexDefV10);
    },
    get constraints() {
      return t.array(RawConstraintDefV10);
    },
    get sequences() {
      return t.array(RawSequenceDefV10);
    },
    get tableType() {
      return TableType;
    },
    get tableAccess() {
      return TableAccess;
    },
    get defaultValues() {
      return t.array(RawColumnDefaultValueV10);
    },
    isEvent: t.bool()
  });
  var RawTableDefV8 = t.object("RawTableDefV8", {
    tableName: t.string(),
    get columns() {
      return t.array(RawColumnDefV8);
    },
    get indexes() {
      return t.array(RawIndexDefV8);
    },
    get constraints() {
      return t.array(RawConstraintDefV8);
    },
    get sequences() {
      return t.array(RawSequenceDefV8);
    },
    tableType: t.string(),
    tableAccess: t.string(),
    scheduled: t.option(t.string())
  });
  var RawTableDefV9 = t.object("RawTableDefV9", {
    name: t.string(),
    productTypeRef: t.u32(),
    primaryKey: t.array(t.u16()),
    get indexes() {
      return t.array(RawIndexDefV9);
    },
    get constraints() {
      return t.array(RawConstraintDefV9);
    },
    get sequences() {
      return t.array(RawSequenceDefV9);
    },
    get schedule() {
      return t.option(RawScheduleDefV9);
    },
    get tableType() {
      return TableType;
    },
    get tableAccess() {
      return TableAccess;
    }
  });
  var RawTypeDefV10 = t.object("RawTypeDefV10", {
    get sourceName() {
      return RawScopedTypeNameV10;
    },
    ty: t.u32(),
    customOrdering: t.bool()
  });
  var RawTypeDefV9 = t.object("RawTypeDefV9", {
    get name() {
      return RawScopedTypeNameV9;
    },
    ty: t.u32(),
    customOrdering: t.bool()
  });
  var RawUniqueConstraintDataV9 = t.object(
    "RawUniqueConstraintDataV9",
    {
      columns: t.array(t.u16())
    }
  );
  var RawViewDefV10 = t.object("RawViewDefV10", {
    sourceName: t.string(),
    index: t.u32(),
    isPublic: t.bool(),
    isAnonymous: t.bool(),
    get params() {
      return ProductType2;
    },
    get returnType() {
      return AlgebraicType2;
    }
  });
  var RawViewDefV9 = t.object("RawViewDefV9", {
    name: t.string(),
    index: t.u32(),
    isPublic: t.bool(),
    isAnonymous: t.bool(),
    get params() {
      return ProductType2;
    },
    get returnType() {
      return AlgebraicType2;
    }
  });
  var RawViewPrimaryKeyDefV10 = t.object("RawViewPrimaryKeyDefV10", {
    viewSourceName: t.string(),
    columns: t.array(t.string())
  });
  var ReducerDef = t.object("ReducerDef", {
    name: t.string(),
    get args() {
      return t.array(ProductTypeElement);
    }
  });
  var SumType2 = t.object("SumType", {
    get variants() {
      return t.array(SumTypeVariant);
    }
  });
  var SumTypeVariant = t.object("SumTypeVariant", {
    name: t.option(t.string()),
    get algebraicType() {
      return AlgebraicType2;
    }
  });
  var TableAccess = t.enum("TableAccess", {
    Public: t.unit(),
    Private: t.unit()
  });
  var TableDesc = t.object("TableDesc", {
    get schema() {
      return RawTableDefV8;
    },
    data: t.u32()
  });
  var TableType = t.enum("TableType", {
    System: t.unit(),
    User: t.unit()
  });
  var TypeAlias = t.object("TypeAlias", {
    name: t.string(),
    ty: t.u32()
  });
  var Typespace = t.object("Typespace", {
    get types() {
      return t.array(AlgebraicType2);
    }
  });
  t.enum("ViewResultHeader", {
    RowData: t.unit(),
    RawSql: t.string()
  });
  function table(opts, row, ..._) {
    const {
      name,
      public: isPublic = false,
      indexes: userIndexes = [],
      scheduled,
      event: isEvent = false
    } = opts;
    const colIds = /* @__PURE__ */ new Map();
    const colNameList = [];
    if (!(row instanceof RowBuilder)) {
      row = new RowBuilder(row);
    }
    row.algebraicType.value.elements.forEach((elem, i) => {
      colIds.set(elem.name, i);
      colNameList.push(elem.name);
    });
    const pk = [];
    const indexes = [];
    const constraints = [];
    const sequences = [];
    let scheduleAtCol;
    const defaultValues = [];
    for (const [name2, builder] of Object.entries(row.row)) {
      const meta = builder.columnMetadata;
      if (meta.isPrimaryKey) {
        pk.push(colIds.get(name2));
      }
      const isUnique = meta.isUnique || meta.isPrimaryKey;
      if (meta.indexType || isUnique) {
        const algo = meta.indexType ?? "btree";
        const id = colIds.get(name2);
        let algorithm;
        switch (algo) {
          case "btree":
            algorithm = RawIndexAlgorithm.BTree([id]);
            break;
          case "hash":
            algorithm = RawIndexAlgorithm.Hash([id]);
            break;
          case "direct":
            algorithm = RawIndexAlgorithm.Direct(id);
            break;
        }
        indexes.push({
          sourceName: void 0,
          // Unnamed indexes will be assigned a globally unique name
          accessorName: name2,
          algorithm
        });
      }
      if (isUnique) {
        constraints.push({
          sourceName: void 0,
          data: { tag: "Unique", value: { columns: [colIds.get(name2)] } }
        });
      }
      if (meta.isAutoIncrement) {
        sequences.push({
          sourceName: void 0,
          start: void 0,
          minValue: void 0,
          maxValue: void 0,
          column: colIds.get(name2),
          increment: 1n
        });
      }
      if (Object.prototype.hasOwnProperty.call(meta, "defaultValue")) {
        const writer = new BinaryWriter(16);
        builder.serialize(writer, meta.defaultValue);
        defaultValues.push({
          colId: colIds.get(name2),
          value: writer.getBuffer()
        });
      }
      const algebraicType = builder.typeBuilder.algebraicType;
      if (schedule_at_default.isScheduleAt(algebraicType)) {
        scheduleAtCol = colIds.get(name2);
      }
    }
    for (const indexOpts of userIndexes ?? []) {
      const accessor = indexOpts.accessor;
      if (typeof accessor !== "string" || accessor.length === 0) {
        const tableLabel = name ?? "<unnamed>";
        const indexLabel = indexOpts.name ?? "<unnamed>";
        throw new TypeError(
          `Index '${indexLabel}' on table '${tableLabel}' must define a non-empty 'accessor'`
        );
      }
      let algorithm;
      switch (indexOpts.algorithm) {
        case "btree":
          algorithm = {
            tag: "BTree",
            value: indexOpts.columns.map((c) => colIds.get(c))
          };
          break;
        case "hash":
          algorithm = {
            tag: "Hash",
            value: indexOpts.columns.map((c) => colIds.get(c))
          };
          break;
        case "direct":
          algorithm = { tag: "Direct", value: colIds.get(indexOpts.column) };
          break;
      }
      indexes.push({
        sourceName: void 0,
        accessorName: accessor,
        algorithm,
        canonicalName: indexOpts.name
      });
    }
    for (const constraintOpts of opts.constraints ?? []) {
      if (constraintOpts.constraint === "unique") {
        const data = {
          tag: "Unique",
          value: { columns: constraintOpts.columns.map((c) => colIds.get(c)) }
        };
        constraints.push({ sourceName: constraintOpts.name, data });
        continue;
      }
    }
    const productType = row.algebraicType.value;
    const schedule = scheduled && scheduleAtCol !== void 0 ? { scheduleAtCol, reducer: scheduled } : void 0;
    return {
      rowType: row,
      tableName: name,
      rowSpacetimeType: productType,
      tableDef: (ctx, accName) => {
        const tableName = name ?? accName;
        if (row.typeName === void 0) {
          row.typeName = toPascalCase(tableName);
        }
        for (const index of indexes) {
          const cols = index.algorithm.tag === "Direct" ? [index.algorithm.value] : index.algorithm.value;
          const colS = cols.map((i) => colNameList[i]).join("_");
          const sourceName = index.sourceName = `${accName}_${colS}_idx_${index.algorithm.tag.toLowerCase()}`;
          const { canonicalName } = index;
          if (canonicalName !== void 0) {
            ctx.moduleDef.explicitNames.entries.push(
              ExplicitNameEntry.Index({ sourceName, canonicalName })
            );
          }
        }
        return {
          sourceName: accName,
          productTypeRef: ctx.registerTypesRecursively(row).ref,
          primaryKey: pk,
          indexes,
          constraints,
          sequences,
          tableType: { tag: "User" },
          tableAccess: { tag: isPublic ? "Public" : "Private" },
          defaultValues,
          isEvent
        };
      },
      // Preserve the declared index options as runtime data so `tableToSchema`
      // can expose them without type-smuggling.
      idxs: userIndexes,
      constraints,
      scheduleAtCol,
      schedule
    };
  }
  var Reducers = class {
    constructor(handles) {
      __publicField(this, "reducersType");
      this.reducersType = reducersToSchema(handles);
    }
  };
  function reducersToSchema(reducers2) {
    const mapped = reducers2.map((r) => {
      const paramsRow = r.params.row;
      return {
        name: r.reducerName,
        // Prefer the schema's own accessorName if present at runtime; otherwise derive it.
        accessorName: r.accessorName,
        params: paramsRow,
        paramsType: r.paramsSpacetimeType
      };
    });
    const result = { reducers: mapped };
    return result;
  }
  function reducers(...args) {
    const handles = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return new Reducers(handles);
  }
  function reducerSchema(name, params) {
    const paramType = {
      elements: Object.entries(params).map(([n, c]) => ({
        name: n,
        algebraicType: "typeBuilder" in c ? c.typeBuilder.algebraicType : c.algebraicType
      }))
    };
    return {
      reducerName: name,
      accessorName: toCamelCase(name),
      params: new RowBuilder(params),
      paramsSpacetimeType: paramType,
      reducerDef: {
        name,
        params: paramType,
        lifecycle: void 0
      }
    };
  }
  function procedures(...args) {
    const procedures2 = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return { procedures: procedures2 };
  }
  const AcceptDuelReducer = {
    id: t.u64()
  };
  const HeartbeatReducer = {};
  const MoveReducer = {
    inputX: t.f32(),
    inputY: t.f32()
  };
  const MoveV2Reducer = {
    inputX: t.f32(),
    inputY: t.f32(),
    sequence: t.u32()
  };
  const PulseDuelReducer = {};
  const RequestDuelReducer = {};
  const ResetPlayerProgressReducer = {};
  const SavePlayerProgressReducer = {
    maxHp: t.f32(),
    damage: t.f32(),
    attackRate: t.f32(),
    projectileSpeed: t.f32(),
    projectileCount: t.u32(),
    attackRange: t.f32(),
    armor: t.f32(),
    regen: t.f32(),
    speed: t.f32(),
    bootsCollected: t.bool()
  };
  const SendChatMessageReducer = {
    message: t.string()
  };
  const SetDisplayNameReducer = {
    displayName: t.string()
  };
  const SetSpeedReducer = {
    speed: t.f32()
  };
  const SyncPositionReducer = {
    x: t.f64(),
    y: t.f64(),
    facing: t.f64(),
    sequence: t.u32()
  };
  const ChatMessageRow = t.row({
    id: t.u64().primaryKey(),
    sender: t.identity(),
    senderName: t.string().name("sender_name"),
    message: t.string(),
    sentAt: t.timestamp().name("sent_at")
  });
  const DuelRow = t.row({
    id: t.u64().primaryKey(),
    challenger: t.identity(),
    opponent: t.identity(),
    status: t.string(),
    createdAt: t.timestamp().name("created_at"),
    startedAt: t.timestamp().name("started_at"),
    endsAtMicros: t.u64().name("ends_at_micros"),
    lastResolvedAt: t.timestamp().name("last_resolved_at"),
    challengerOriginX: t.f64().name("challenger_origin_x"),
    challengerOriginY: t.f64().name("challenger_origin_y"),
    opponentOriginX: t.f64().name("opponent_origin_x"),
    opponentOriginY: t.f64().name("opponent_origin_y"),
    challengerHp: t.f32().name("challenger_hp"),
    challengerMaxHp: t.f32().name("challenger_max_hp"),
    challengerDamage: t.f32().name("challenger_damage"),
    challengerArmor: t.f32().name("challenger_armor"),
    challengerAttackRate: t.f32().name("challenger_attack_rate"),
    opponentHp: t.f32().name("opponent_hp"),
    opponentMaxHp: t.f32().name("opponent_max_hp"),
    opponentDamage: t.f32().name("opponent_damage"),
    opponentArmor: t.f32().name("opponent_armor"),
    opponentAttackRate: t.f32().name("opponent_attack_rate")
  });
  const PlayerRow = t.row({
    identity: t.identity().primaryKey(),
    x: t.f64(),
    y: t.f64(),
    facing: t.f64(),
    hp: t.f32(),
    maxHp: t.f32().name("max_hp"),
    speed: t.f32(),
    moving: t.bool(),
    lastInputAt: t.timestamp().name("last_input_at"),
    lastInputSequence: t.u32().name("last_input_sequence")
  });
  const PlayerProfileRow = t.row({
    identity: t.identity().primaryKey(),
    displayName: t.string().name("display_name")
  });
  const PlayerProgressRow = t.row({
    identity: t.identity().primaryKey(),
    maxHp: t.f32().name("max_hp"),
    damage: t.f32(),
    attackRate: t.f32().name("attack_rate"),
    projectileSpeed: t.f32().name("projectile_speed"),
    projectileCount: t.u32().name("projectile_count"),
    attackRange: t.f32().name("attack_range"),
    armor: t.f32(),
    regen: t.f32(),
    speed: t.f32(),
    bootsCollected: t.bool().name("boots_collected")
  });
  const tablesSchema = schema({
    chatMessage: table({
      name: "chat_message",
      indexes: [
        { accessor: "id", name: "chat_message_id_idx_btree", algorithm: "btree", columns: [
          "id"
        ] }
      ],
      constraints: [
        { name: "chat_message_id_key", constraint: "unique", columns: ["id"] }
      ]
    }, ChatMessageRow),
    duel: table({
      name: "duel",
      indexes: [
        { accessor: "id", name: "duel_id_idx_btree", algorithm: "btree", columns: [
          "id"
        ] }
      ],
      constraints: [
        { name: "duel_id_key", constraint: "unique", columns: ["id"] }
      ]
    }, DuelRow),
    player: table({
      name: "player",
      indexes: [
        { accessor: "identity", name: "player_identity_idx_btree", algorithm: "btree", columns: [
          "identity"
        ] }
      ],
      constraints: [
        { name: "player_identity_key", constraint: "unique", columns: ["identity"] }
      ]
    }, PlayerRow),
    playerProfile: table({
      name: "player_profile",
      indexes: [
        { accessor: "identity", name: "player_profile_identity_idx_btree", algorithm: "btree", columns: [
          "identity"
        ] }
      ],
      constraints: [
        { name: "player_profile_identity_key", constraint: "unique", columns: ["identity"] }
      ]
    }, PlayerProfileRow),
    playerProgress: table({
      name: "player_progress",
      indexes: [
        { accessor: "identity", name: "player_progress_identity_idx_btree", algorithm: "btree", columns: [
          "identity"
        ] }
      ],
      constraints: [
        { name: "player_progress_identity_key", constraint: "unique", columns: ["identity"] }
      ]
    }, PlayerProgressRow)
  });
  const reducersSchema = reducers(
    reducerSchema("accept_duel", AcceptDuelReducer),
    reducerSchema("heartbeat", HeartbeatReducer),
    reducerSchema("move", MoveReducer),
    reducerSchema("move_v_2", MoveV2Reducer),
    reducerSchema("pulse_duel", PulseDuelReducer),
    reducerSchema("request_duel", RequestDuelReducer),
    reducerSchema("reset_player_progress", ResetPlayerProgressReducer),
    reducerSchema("save_player_progress", SavePlayerProgressReducer),
    reducerSchema("send_chat_message", SendChatMessageReducer),
    reducerSchema("set_display_name", SetDisplayNameReducer),
    reducerSchema("set_speed", SetSpeedReducer),
    reducerSchema("sync_position", SyncPositionReducer)
  );
  const proceduresSchema = procedures();
  const REMOTE_MODULE = {
    versionInfo: {
      cliVersion: "2.7.1"
    },
    tables: tablesSchema.schemaType.tables,
    reducers: reducersSchema.reducersType.reducers,
    ...proceduresSchema
  };
  const tables = makeQueryBuilder(tablesSchema.schemaType);
  convertToAccessorMap(reducersSchema.reducersType.reducers);
  convertToAccessorMap(proceduresSchema.procedures);
  class SubscriptionBuilder extends SubscriptionBuilderImpl {
  }
  class DbConnectionBuilder extends DbConnectionBuilder$1 {
  }
  const _DbConnection = class _DbConnection extends DbConnectionImpl {
    constructor() {
      super(...arguments);
      this.subscriptionBuilder = () => {
        return new SubscriptionBuilder(this);
      };
    }
  };
  _DbConnection.builder = () => {
    return new DbConnectionBuilder(REMOTE_MODULE, (config) => new _DbConnection(config));
  };
  let DbConnection = _DbConnection;
  const MOVEMENT_HZ = 24;
  const MOVEMENT_INTERVAL_MS = 1e3 / MOVEMENT_HZ;
  const MOVEMENT_STEP_SECONDS = 1 / MOVEMENT_HZ;
  const REMOTE_PREDICTION_SECONDS = MOVEMENT_STEP_SECONDS;
  const runtime = window;
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const defaultHost = isLocalHost ? "ws://localhost:3000" : "wss://maincloud.spacetimedb.com";
  const host = runtime.WILDWOOD_SPACETIMEDB_HOST ?? defaultHost;
  const databaseName = runtime.WILDWOOD_SPACETIMEDB_DB_NAME ?? "wildwood-coop";
  const tokenKey = `${host}/${databaseName}/auth_token`;
  const players = /* @__PURE__ */ new Map();
  const profiles = /* @__PURE__ */ new Map();
  const chatMessages = [];
  const duels = /* @__PURE__ */ new Map();
  let connection = null;
  let localIdentity = "";
  let lastMovementSentAt = 0;
  let lastInputX = 0;
  let lastInputY = 0;
  let nextInputSequence = 0;
  const pendingInputs = [];
  let heartbeatTimer = null;
  let localState = null;
  let localDisplayName = "";
  let localProgress = null;
  let lastSpeedSent = null;
  let positionSyncPendingSequence = null;
  let lastDuelPulseAt = 0;
  let onChange = null;
  function upsertPlayer(row) {
    const id = row.identity.toHexString();
    if (id === localIdentity) {
      localState = {
        x: row.x,
        y: row.y,
        speed: row.speed,
        moving: row.moving,
        lastInputSequence: row.lastInputSequence
      };
      if (positionSyncPendingSequence !== null && row.lastInputSequence >= positionSyncPendingSequence) {
        positionSyncPendingSequence = null;
      }
      onChange == null ? void 0 : onChange();
      return;
    }
    const existing = players.get(id);
    if (existing) {
      existing.targetX = row.x;
      existing.targetY = row.y;
      existing.targetFacing = row.facing;
      existing.speed = row.speed;
      existing.moving = row.moving;
      existing.hp = row.hp;
      existing.maxHp = row.maxHp;
    } else {
      players.set(id, {
        id,
        name: profiles.get(id) ?? "PLAYER",
        x: row.x,
        y: row.y,
        speed: row.speed,
        facing: row.facing,
        moving: row.moving,
        hp: row.hp,
        maxHp: row.maxHp,
        targetX: row.x,
        targetY: row.y,
        targetFacing: row.facing
      });
    }
    onChange == null ? void 0 : onChange();
  }
  function upsertProfile(row) {
    const id = row.identity.toHexString();
    profiles.set(id, row.displayName);
    if (id === localIdentity) localDisplayName = row.displayName;
    const player = players.get(id);
    if (player) player.name = row.displayName;
    onChange == null ? void 0 : onChange();
  }
  function upsertProgress(row) {
    if (row.identity.toHexString() !== localIdentity) return;
    localProgress = {
      maxHp: row.maxHp,
      damage: row.damage,
      attackRate: row.attackRate,
      projectileSpeed: row.projectileSpeed,
      projectileCount: row.projectileCount,
      attackRange: row.attackRange,
      armor: row.armor,
      regen: row.regen,
      speed: row.speed,
      bootsCollected: row.bootsCollected
    };
    onChange == null ? void 0 : onChange();
  }
  function upsertChatMessage(row) {
    if (chatMessages.some((message) => message.id === row.id)) return;
    chatMessages.push({
      id: row.id,
      sender: row.sender.toHexString(),
      senderName: row.senderName,
      message: row.message,
      sentAtMs: Number(row.sentAt.microsSinceUnixEpoch / 1000n)
    });
    chatMessages.sort((a, b) => a.id < b.id ? -1 : 1);
    while (chatMessages.length > 100) chatMessages.shift();
    onChange == null ? void 0 : onChange();
  }
  function upsertDuel(row) {
    duels.set(row.id, {
      id: row.id,
      challenger: row.challenger.toHexString(),
      opponent: row.opponent.toHexString(),
      status: row.status,
      createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1000n),
      startedAtMs: Number(row.startedAt.microsSinceUnixEpoch / 1000n),
      endsAtMs: Number(row.endsAtMicros / 1000n),
      challengerHp: row.challengerHp,
      challengerMaxHp: row.challengerMaxHp,
      opponentHp: row.opponentHp,
      opponentMaxHp: row.opponentMaxHp
    });
    onChange == null ? void 0 : onChange();
  }
  function removeDuel(row) {
    duels.delete(row.id);
    onChange == null ? void 0 : onChange();
  }
  function removePlayer(row) {
    players.delete(row.identity.toHexString());
    onChange == null ? void 0 : onChange();
  }
  function connect() {
    connection = DbConnection.builder().withUri(host).withDatabaseName(databaseName).withToken(localStorage.getItem(tokenKey) || void 0).onConnect((conn, identity, token) => {
      connection = conn;
      localIdentity = identity.toHexString();
      lastInputX = 0;
      lastInputY = 0;
      nextInputSequence = 0;
      pendingInputs.length = 0;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      positionSyncPendingSequence = null;
      lastDuelPulseAt = 0;
      localStorage.setItem(tokenKey, token);
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        connection == null ? void 0 : connection.reducers.heartbeat({});
      }, 5e3);
      conn.db.player.onInsert((_ctx, row) => upsertPlayer(row));
      conn.db.player.onUpdate((_ctx, _oldRow, row) => upsertPlayer(row));
      conn.db.player.onDelete((_ctx, row) => removePlayer(row));
      conn.db.playerProfile.onInsert((_ctx, row) => upsertProfile(row));
      conn.db.playerProfile.onUpdate((_ctx, _oldRow, row) => upsertProfile(row));
      conn.db.playerProgress.onInsert((_ctx, row) => upsertProgress(row));
      conn.db.playerProgress.onUpdate((_ctx, _oldRow, row) => upsertProgress(row));
      conn.db.chatMessage.onInsert((_ctx, row) => upsertChatMessage(row));
      conn.db.duel.onInsert((_ctx, row) => upsertDuel(row));
      conn.db.duel.onUpdate((_ctx, _oldRow, row) => upsertDuel(row));
      conn.db.duel.onDelete((_ctx, row) => removeDuel(row));
      conn.subscriptionBuilder().onApplied(() => {
        for (const row of conn.db.playerProfile.iter()) upsertProfile(row);
        for (const row of conn.db.playerProgress.iter()) upsertProgress(row);
        for (const row of conn.db.player.iter()) upsertPlayer(row);
        for (const row of conn.db.chatMessage.iter()) upsertChatMessage(row);
        for (const row of conn.db.duel.iter()) upsertDuel(row);
        onChange == null ? void 0 : onChange();
      }).onError((ctx) => {
        console.error("Wildwood SpacetimeDB subscription error:", ctx.event);
      }).subscribe([tables.player, tables.playerProfile, tables.playerProgress, tables.chatMessage, tables.duel]);
      onChange == null ? void 0 : onChange();
    }).onDisconnect((_ctx, error) => {
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      connection = null;
      localIdentity = "";
      lastInputX = 0;
      lastInputY = 0;
      nextInputSequence = 0;
      pendingInputs.length = 0;
      localState = null;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      positionSyncPendingSequence = null;
      lastDuelPulseAt = 0;
      players.clear();
      profiles.clear();
      chatMessages.length = 0;
      duels.clear();
      if (error) console.warn("Wildwood SpacetimeDB disconnected:", error);
      onChange == null ? void 0 : onChange();
    }).onConnectError((_ctx, error) => {
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      connection = null;
      lastInputX = 0;
      lastInputY = 0;
      nextInputSequence = 0;
      pendingInputs.length = 0;
      localState = null;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      positionSyncPendingSequence = null;
      lastDuelPulseAt = 0;
      console.warn("Wildwood SpacetimeDB unavailable:", error.message);
      onChange == null ? void 0 : onChange();
    }).build();
  }
  const wildwoodCoop = {
    host,
    databaseName,
    connect,
    setOnChange(callback) {
      onChange = callback;
    },
    isConnected() {
      return connection !== null;
    },
    localIdentity() {
      return localIdentity;
    },
    localState() {
      return localState;
    },
    localDisplayName() {
      return localDisplayName;
    },
    setDisplayName(displayName) {
      if (!connection) return;
      connection.reducers.setDisplayName({ displayName });
    },
    savedProgress() {
      return localProgress ? { ...localProgress } : null;
    },
    saveProgress(progress) {
      if (!connection) return;
      connection.reducers.savePlayerProgress(progress);
    },
    resetProgress() {
      if (!connection) return;
      connection.reducers.resetPlayerProgress({});
    },
    chatMessages() {
      return chatMessages.slice();
    },
    sendChatMessage(message) {
      if (!connection) return;
      connection.reducers.sendChatMessage({ message });
    },
    localDuel() {
      for (const duel of duels.values()) {
        if (duel.challenger === localIdentity || duel.opponent === localIdentity) return { ...duel };
      }
      return null;
    },
    requestDuel() {
      if (!connection) return;
      connection.reducers.requestDuel({});
    },
    acceptDuel(id) {
      if (!connection) return;
      connection.reducers.acceptDuel({ id });
    },
    pulseDuel() {
      if (!connection) return;
      const now = performance.now();
      if (now - lastDuelPulseAt < 500) return;
      lastDuelPulseAt = now;
      connection.reducers.pulseDuel({});
    },
    syncSpeed(speed) {
      if (!connection || !Number.isFinite(speed) || speed === lastSpeedSent) return;
      lastSpeedSent = speed;
      connection.reducers.setSpeed({ speed });
    },
    syncPosition(x, y, facing) {
      if (!connection || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return;
      pendingInputs.length = 0;
      lastInputX = 0;
      lastInputY = 0;
      lastMovementSentAt = 0;
      const sequence = ++nextInputSequence;
      positionSyncPendingSequence = sequence;
      connection.reducers.syncPosition({ x, y, facing, sequence });
    },
    sendMovement(inputX, inputY) {
      if (!connection) return;
      const now = performance.now();
      const changed = Math.abs(inputX - lastInputX) > 0.01 || Math.abs(inputY - lastInputY) > 0.01;
      const hasInput = Math.abs(inputX) + Math.abs(inputY) > 0.01;
      if (!changed && !hasInput) return;
      if (now - lastMovementSentAt < MOVEMENT_INTERVAL_MS) return;
      lastMovementSentAt = now;
      lastInputX = inputX;
      lastInputY = inputY;
      const sequence = ++nextInputSequence;
      pendingInputs.push({ sequence, inputX, inputY });
      connection.reducers.moveV2({ inputX, inputY, sequence });
    },
    reconcileLocal(x, y, dt = 1 / 60) {
      if (!connection || !localState || positionSyncPendingSequence !== null) return { x, y };
      const firstPendingInput = pendingInputs[0];
      if (!localState.moving && firstPendingInput && Math.hypot(firstPendingInput.inputX, firstPendingInput.inputY) >= 0.01) {
        return { x, y };
      }
      while (pendingInputs.length > 0 && pendingInputs[0].sequence <= localState.lastInputSequence) {
        pendingInputs.shift();
      }
      let targetX = localState.x;
      let targetY = localState.y;
      for (const input of pendingInputs) {
        const inputLength = Math.hypot(input.inputX, input.inputY);
        if (inputLength < 0.01) continue;
        targetX += input.inputX / inputLength * localState.speed * MOVEMENT_STEP_SECONDS;
        targetY += input.inputY / inputLength * localState.speed * MOVEMENT_STEP_SECONDS;
      }
      const errorX = targetX - x;
      const errorY = targetY - y;
      if (Math.hypot(errorX, errorY) > 100) return { x: targetX, y: targetY };
      const correction = 1 - Math.pow(1e-6, Math.min(0.1, Math.max(0, dt)));
      return {
        x: x + errorX * correction,
        y: y + errorY * correction
      };
    },
    remotePlayers(dt = 1 / 60) {
      const smoothing = 1 - Math.pow(1e-6, Math.min(0.1, Math.max(0, dt)));
      const result = [];
      for (const player of players.values()) {
        if (player.id === localIdentity) continue;
        const prediction = player.moving ? player.speed * REMOTE_PREDICTION_SECONDS : 0;
        const desiredX = player.targetX + Math.cos(player.targetFacing) * prediction;
        const desiredY = player.targetY + Math.sin(player.targetFacing) * prediction;
        player.x += (desiredX - player.x) * smoothing;
        player.y += (desiredY - player.y) * smoothing;
        player.facing += Math.atan2(
          Math.sin(player.targetFacing - player.facing),
          Math.cos(player.targetFacing - player.facing)
        ) * smoothing;
        result.push(player);
      }
      return result;
    },
    remotePlayerCount() {
      let count = 0;
      for (const player of players.values()) {
        if (player.id !== localIdentity) count += 1;
      }
      return count;
    }
  };
  runtime.wildwoodCoop = wildwoodCoop;
  wildwoodCoop.connect();
  exports.default = wildwoodCoop;
  exports.wildwoodCoop = wildwoodCoop;
  Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
  return exports;
})({});

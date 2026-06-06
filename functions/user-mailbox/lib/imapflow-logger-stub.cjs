'use strict';

/** No-op logger — imapflow loads ./logger at import time even when `logger: false`. */
const noop = () => {};
const stub = {
  level: 'silent',
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  silent: noop,
  child() {
    return stub;
  },
};

module.exports = stub;

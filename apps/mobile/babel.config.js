"use strict";

module.exports = function configureMobileBabel(api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
  };
};

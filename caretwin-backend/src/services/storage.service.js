const provider = process.env.STORAGE_PROVIDER === undefined ? "local" : process.env.STORAGE_PROVIDER;

if (provider === "local") {
  module.exports = require("./storage.local");
} else if (provider === "s3") {
  module.exports = require("./storage.s3");
} else {
  throw new Error('STORAGE_PROVIDER must be either "local" or "s3"');
}
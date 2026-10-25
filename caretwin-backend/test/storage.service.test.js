const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const storageServicePath = path.resolve(__dirname, "../src/services/storage.service.js");
const localAdapter = { adapter: "local" };
const s3Adapter = { adapter: "s3" };

function loadStorage(provider) {
  const previousProvider = process.env.STORAGE_PROVIDER;
  const originalLoad = Module._load;
  delete require.cache[storageServicePath];

  if (provider === undefined) delete process.env.STORAGE_PROVIDER;
  else process.env.STORAGE_PROVIDER = provider;

  Module._load = function (request, parent, isMain) {
    if (parent?.filename === storageServicePath && request === "./storage.local") {
      return localAdapter;
    }
    if (parent?.filename === storageServicePath && request === "./storage.s3") {
      return s3Adapter;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(storageServicePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[storageServicePath];
    if (previousProvider === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = previousProvider;
  }
}

test("storage service defaults to the local adapter", () => {
  assert.equal(loadStorage(undefined), localAdapter);
});

test('storage service selects the S3 adapter when STORAGE_PROVIDER is "s3"', () => {
  assert.equal(loadStorage("s3"), s3Adapter);
});

test("storage service rejects unsupported providers", () => {
  for (const provider of ["remote", ""]) {
    assert.throws(
      () => loadStorage(provider),
      /STORAGE_PROVIDER must be either "local" or "s3"/
    );
  }
});

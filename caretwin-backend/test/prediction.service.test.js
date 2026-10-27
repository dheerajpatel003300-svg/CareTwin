const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../src/services/prediction.service");

async function withPredictionService(overrides, callback) {
  const envNames = ["ML_SERVICE_TIMEOUT_MS", "ML_SERVICE_URL", "ML_SERVICE_API_KEY"];
  const previousEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  const previousFetch = global.fetch;
  const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");

  for (const name of envNames) {
    if (Object.hasOwn(overrides, name)) {
      if (overrides[name] === undefined) delete process.env[name];
      else process.env[name] = overrides[name];
    }
  }

  delete require.cache[servicePath];
  try {
    return await callback(require(servicePath));
  } finally {
    delete require.cache[servicePath];
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    global.fetch = previousFetch;
    Object.defineProperty(AbortSignal, "timeout", timeoutDescriptor);
  }
}

async function assertPredictionTimeout(environment, expectedTimeout) {
  await withPredictionService(
    { ML_SERVICE_URL: "https://ml.example", ...environment },
    async (service) => {
      let actualTimeout;
      Object.defineProperty(AbortSignal, "timeout", {
        configurable: true,
        writable: true,
        value: (milliseconds) => {
          actualTimeout = milliseconds;
          return {};
        },
      });
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ fields: [] }),
      });

      await service.getSchema();
      assert.equal(actualTimeout, expectedTimeout);
    },
  );
}

test("prediction requests default to a 60000 ms timeout", async () => {
  await assertPredictionTimeout({ ML_SERVICE_TIMEOUT_MS: undefined }, 60000);
});

test("prediction requests use the configured timeout", async () => {
  await assertPredictionTimeout({ ML_SERVICE_TIMEOUT_MS: "25000" }, 25000);
});

test("prediction request timeout is clamped to the supported range", async () => {
  await assertPredictionTimeout({ ML_SERVICE_TIMEOUT_MS: "1000" }, 5000);
  await assertPredictionTimeout({ ML_SERVICE_TIMEOUT_MS: "180000" }, 120000);
});

test("ML service warm-up is skipped when its URL is unset", async () => {
  await withPredictionService({ ML_SERVICE_URL: undefined }, async (service) => {
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return {};
    };

    service.warmUpMlService();
    await new Promise(setImmediate);
    assert.equal(fetchCalled, false);
  });
});

test("ML service warm-up runs at most once within four minutes", async () => {
  await withPredictionService(
    { ML_SERVICE_URL: "https://ml.example", ML_SERVICE_API_KEY: "test-key" },
    async (service) => {
      let now = 1000;
      const originalNow = Date.now;
      Date.now = () => now;
      let requestCount = 0;
      let requestOptions;
      let timeout;
      Object.defineProperty(AbortSignal, "timeout", {
        configurable: true,
        writable: true,
        value: (milliseconds) => {
          timeout = milliseconds;
          return {};
        },
      });
      global.fetch = (url, options) => {
        requestCount += 1;
        requestOptions = { url, options };
        return new Promise(() => {});
      };

      try {
        assert.equal(service.warmUpMlService(), undefined);
        now += 239999;
        service.warmUpMlService();
        assert.equal(requestCount, 1);

        now += 1;
        service.warmUpMlService();
        assert.equal(requestCount, 2);
        assert.equal(requestOptions.url.endsWith("/health"), true);
        assert.equal(requestOptions.options.method, "GET");
        assert.equal("headers" in requestOptions.options, false);
        assert.equal(timeout, 65000);
      } finally {
        Date.now = originalNow;
      }
    },
  );
});

test("ML service warm-up swallows rejected fetches", async () => {
  await withPredictionService({ ML_SERVICE_URL: "https://ml.example" }, async (service) => {
    global.fetch = async () => {
      throw new Error("unavailable");
    };

    assert.doesNotThrow(() => service.warmUpMlService());
    await new Promise(setImmediate);
  });
});

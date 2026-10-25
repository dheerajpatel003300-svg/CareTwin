const test = require("node:test");
const assert = require("node:assert/strict");
const llm = require("../src/services/llm.service");

test("chat selects Groq when a Groq key is configured without an explicit provider", async () => {
  const original = {
    provider: process.env.LLM_PROVIDER,
    groqKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL,
    fetch: global.fetch,
  };

  process.env.LLM_PROVIDER = "";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_MODEL = "test-model";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "test-model");
    assert.match(body.messages[0].content, /untrusted_report_ocr/);
    assert.match(body.messages[0].content, /Hemoglobin 13\.1 g\/dL/);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Test reply" } }] }),
    };
  };

  try {
    const reply = await llm.generateReply({
      history: [],
      userMessage: "Hello",
      reportContext: "Hemoglobin 13.1 g/dL",
    });
    assert.equal(reply, "Test reply");
  } finally {
    if (original.provider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = original.provider;
    if (original.groqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = original.groqKey;
    if (original.groqModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = original.groqModel;
    global.fetch = original.fetch;
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { isHealthRelated } = require("../src/services/chatScope.service");
const chatService = require("../src/services/chat.service");
const llm = require("../src/services/llm.service");

test("recognizes health and medical questions", () => {
  assert.equal(isHealthRelated("What does this blood test mean?"), true);
  assert.equal(isHealthRelated("Can this medicine cause a headache?"), true);
  assert.equal(isHealthRelated("How can I improve my sleep?"), true);
});

test("rejects unrelated general-knowledge questions", () => {
  assert.equal(isHealthRelated("Who is the president of the US?"), false);
  assert.equal(isHealthRelated("Who won the football match?"), false);
  assert.equal(isHealthRelated("How do I write a JavaScript function?"), false);
});

test("declines non-health chat without calling the AI provider", async () => {
  const originalGenerateReply = llm.generateReply;
  llm.generateReply = async () => assert.fail("out-of-scope text must not reach the AI provider");

  const prisma = {
    chat: {
      findFirst: async () => ({ id: "chat-id", title: null }),
      update: async () => undefined,
    },
    chatMessage: {
      count: async () => 0,
      findMany: async () => [],
      create: async ({ data }) => ({
        id: `${data.sender}-id`,
        sender: data.sender,
        message: data.message,
        createdAt: data.createdAt,
      }),
    },
    $transaction: async (operations) => Promise.all(operations),
  };

  try {
    const result = await chatService.sendMessage(
      prisma,
      "user-id",
      "chat-id",
      "Who is the president of the US?",
    );
    assert.match(result.assistantMessage.message, /only help with health and medical topics/i);
  } finally {
    llm.generateReply = originalGenerateReply;
  }
});

test("provides current report OCR context to the model without saving it in chat messages", async () => {
  const originalGenerateReply = llm.generateReply;
  let modelRequest;
  llm.generateReply = async (input) => {
    modelRequest = input;
    return "The report shows a hemoglobin result.";
  };

  const prisma = {
    chat: {
      findFirst: async () => ({ id: "chat-id", title: null }),
      update: async () => undefined,
    },
    medicalRecord: {
      findMany: async () => [{
        id: "record-id",
        title: "Blood panel",
        recordType: "lab_report",
        recordDate: new Date("2026-10-20T00:00:00.000Z"),
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
        storageKey: "current-file",
      }],
    },
    recordOcrJob: {
      findMany: async () => [{
        recordId: "record-id",
        storageKey: "current-file",
        text: "Hemoglobin 13.1 g/dL",
      }],
    },
    chatMessage: {
      count: async () => 0,
      findMany: async () => [],
      create: async ({ data }) => ({
        id: `${data.sender}-id`,
        sender: data.sender,
        message: data.message,
        createdAt: data.createdAt,
      }),
    },
    $transaction: async (operations) => Promise.all(operations),
  };

  try {
    const result = await chatService.sendMessage(
      prisma,
      "user-id",
      "chat-id",
      "Can you explain my latest report?",
    );
    assert.match(modelRequest.reportContext, /Hemoglobin 13\.1 g\/dL/);
    assert.equal(result.userMessage.message, "Can you explain my latest report?");
    assert.doesNotMatch(result.userMessage.message, /Hemoglobin 13\.1/);
  } finally {
    llm.generateReply = originalGenerateReply;
  }
});

test("keeps report context available for report follow-up questions", async () => {
  const originalGenerateReply = llm.generateReply;
  let modelRequest;
  llm.generateReply = async (input) => {
    modelRequest = input;
    return "Please review the result with your clinician.";
  };

  const prisma = {
    chat: {
      findFirst: async () => ({ id: "chat-id", title: null }),
      update: async () => undefined,
    },
    medicalRecord: {
      findMany: async () => [{
        id: "record-id",
        title: "Blood panel",
        recordType: "lab_report",
        recordDate: new Date("2026-10-20T00:00:00.000Z"),
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
        storageKey: "current-file",
      }],
    },
    recordOcrJob: {
      findMany: async () => [{
        recordId: "record-id",
        storageKey: "current-file",
        text: "Hemoglobin 13.1 g/dL",
      }],
    },
    chatMessage: {
      count: async () => 0,
      findMany: async () => [{
        sender: "user",
        message: "Can you explain my latest report?",
      }],
      create: async ({ data }) => ({
        id: `${data.sender}-id`,
        sender: data.sender,
        message: data.message,
        createdAt: data.createdAt,
      }),
    },
    $transaction: async (operations) => Promise.all(operations),
  };

  try {
    await chatService.sendMessage(prisma, "user-id", "chat-id", "Is this value high?");
    assert.match(modelRequest.reportContext, /Hemoglobin 13\.1 g\/dL/);
    assert.equal(modelRequest.userMessage, "Is this value high?");
  } finally {
    llm.generateReply = originalGenerateReply;
  }
});

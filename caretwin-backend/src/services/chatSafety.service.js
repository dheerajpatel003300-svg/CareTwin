const { PATTERNS, REPLIES } = require("../data/chatSafety");

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns { id, kind, reply } for the first matching pattern, or null.
// Crisis patterns are listed first, so they take priority over general emergencies.
function checkEmergency(text) {
  const t = normalize(text);
  for (const p of PATTERNS) {
    if (p.re.test(t)) return { id: p.id, kind: p.kind, reply: REPLIES[p.kind] };
  }
  return null;
}

module.exports = { checkEmergency, normalize };
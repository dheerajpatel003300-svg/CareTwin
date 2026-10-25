const {
  URGENCY,
  EMERGENCY_RULES,
  RULES,
  GUIDANCE,
  SELF_HARM_GUIDANCE,
  DISCLAIMER,
} = require("../data/symptomRules");

const rank = (u) => URGENCY.indexOf(u); // lower index = more urgent
const moreUrgent = (a, b) => (rank(a) <= rank(b) ? a : b);
const escalate = (u) => URGENCY[Math.max(0, rank(u) - 1)];

function matches(rule, have) {
  if (rule.all) return rule.all.every((s) => have.has(s));
  if (rule.any) return rule.any.filter((s) => have.has(s)).length >= (rule.minMatch || 1);
  return false;
}

// Pure function: same input, same output. No database, no network.
function evaluate({ symptoms, severity, durationDays, age }) {
  const have = new Set(symptoms);

  // 1. Emergency rules always win.
  const emergency = EMERGENCY_RULES.find((r) => matches(r, have));
  if (emergency) {
    const selfHarm = emergency.id === "self_harm";
    return {
      urgency: "emergency",
      recommendedSpecialty: emergency.specialty,
      guidance: selfHarm ? SELF_HARM_GUIDANCE : GUIDANCE.emergency,
      matchedRules: [emergency.id],
      disclaimer: DISCLAIMER,
    };
  }

  // 2. Highest-urgency matching rule.
  let urgency = "self_care";
  let specialty = "General medicine";
  const matched = [];
  for (const rule of RULES) {
    if (!matches(rule, have)) continue;
    matched.push(rule.id);
    if (rank(rule.urgency) < rank(urgency) || matched.length === 1) {
      if (rank(rule.urgency) <= rank(urgency)) {
        urgency = rule.urgency;
        specialty = rule.specialty;
      }
    }
  }

  // 3. Modifiers only ever make the result MORE cautious.
  if (severity === "high") urgency = escalate(urgency);
  if (severity === "medium" && urgency === "self_care") urgency = "soon";
  if (durationDays >= 7) urgency = moreUrgent(urgency, "soon");
  if ((age !== undefined && age < 2) || (age !== undefined && age >= 75)) {
    urgency = escalate(urgency);
  }
  if (urgency === "emergency") urgency = "urgent"; // modifiers never claim an emergency on their own

  return {
    urgency,
    recommendedSpecialty: specialty,
    guidance: GUIDANCE[urgency],
    matchedRules: matched,
    disclaimer: DISCLAIMER,
  };
}

module.exports = { evaluate };

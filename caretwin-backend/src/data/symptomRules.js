// Reviewed-by-clinician status: NOT YET REVIEWED. Do not ship to real users before review.
// All medical content lives here. The engine in symptom.engine.js contains no medical logic.

// The fixed vocabulary. Clients may only send ids from this list.
const SYMPTOMS = {
  chest_pain: "Chest pain or pressure",
  shortness_of_breath: "Shortness of breath",
  fainting: "Fainting or loss of consciousness",
  confusion: "Sudden confusion",
  face_drooping: "Face drooping on one side",
  arm_weakness: "Weakness or numbness in an arm or leg",
  speech_difficulty: "Trouble speaking or understanding speech",
  severe_headache: "Sudden, severe headache",
  vision_changes: "Sudden vision changes",
  severe_bleeding: "Bleeding that will not stop",
  suicidal_thoughts: "Thoughts of harming yourself",
  fever: "Fever",
  cough: "Cough",
  sore_throat: "Sore throat",
  runny_nose: "Runny or blocked nose",
  headache: "Headache",
  nausea: "Nausea",
  vomiting: "Vomiting",
  diarrhea: "Diarrhea",
  abdominal_pain: "Abdominal pain",
  rash: "Skin rash",
  joint_pain: "Joint pain",
  back_pain: "Back pain",
  fatigue: "Unusual tiredness",
  dizziness: "Dizziness",
  frequent_urination: "Frequent or painful urination",
  anxiety: "Feeling anxious or low",
};

// Urgency levels, most to least urgent.
const URGENCY = ["emergency", "urgent", "soon", "self_care"];

// Emergency rules. If ALL symptoms in `all` are present (or ANY in `any`), the result is emergency.
const EMERGENCY_RULES = [
  { id: "cardiac", all: ["chest_pain", "shortness_of_breath"], specialty: "Emergency medicine" },
  { id: "chest_pain_alone", all: ["chest_pain"], specialty: "Emergency medicine" },
  { id: "stroke", any: ["face_drooping", "speech_difficulty", "arm_weakness"], specialty: "Emergency medicine" },
  { id: "severe_bleeding", all: ["severe_bleeding"], specialty: "Emergency medicine" },
  { id: "loss_of_consciousness", all: ["fainting"], specialty: "Emergency medicine" },
  { id: "thunderclap_headache", all: ["severe_headache"], specialty: "Emergency medicine" },
  { id: "sudden_confusion", all: ["confusion"], specialty: "Emergency medicine" },
  { id: "self_harm", all: ["suicidal_thoughts"], specialty: "Mental health crisis support" },
];

// Non-emergency rules, evaluated in order; the first match with the highest urgency wins.
// `all`: every listed symptom must be present. `minMatch`: at least N of `any` must be present.
const RULES = [
  { id: "breathing", all: ["shortness_of_breath"], urgency: "urgent", specialty: "Pulmonology / General medicine" },
  { id: "vision", all: ["vision_changes"], urgency: "urgent", specialty: "Ophthalmology" },
  { id: "dehydration_risk", all: ["vomiting", "diarrhea"], urgency: "urgent", specialty: "General medicine" },
  { id: "fever_abdominal", all: ["fever", "abdominal_pain"], urgency: "urgent", specialty: "General medicine" },
  { id: "respiratory_infection", any: ["cough", "sore_throat", "runny_nose", "fever"], minMatch: 2, urgency: "soon", specialty: "General medicine" },
  { id: "stomach", any: ["nausea", "vomiting", "diarrhea", "abdominal_pain"], minMatch: 1, urgency: "soon", specialty: "Gastroenterology" },
  { id: "skin", all: ["rash"], urgency: "soon", specialty: "Dermatology" },
  { id: "urinary", all: ["frequent_urination"], urgency: "soon", specialty: "General medicine / Urology" },
  { id: "musculoskeletal", any: ["joint_pain", "back_pain"], minMatch: 1, urgency: "soon", specialty: "Orthopedics" },
  { id: "mood", all: ["anxiety"], urgency: "soon", specialty: "Psychiatry / Counselling" },
  { id: "dizzy", any: ["dizziness", "fatigue", "headache"], minMatch: 1, urgency: "soon", specialty: "General medicine" },
];

const GUIDANCE = {
  emergency: "Your symptoms may need immediate medical attention. Call your local emergency number or go to the nearest emergency department now. Do not drive yourself.",
  urgent: "Please see a doctor today or visit an urgent care service. If your symptoms get worse, seek emergency care.",
  soon: "Consider booking an appointment with a doctor in the next few days. Seek urgent care if symptoms get worse.",
  self_care: "Your symptoms may ease with rest, fluids and over-the-counter care. See a doctor if they last more than a few days or get worse.",
};

const SELF_HARM_GUIDANCE =
  "You do not have to go through this alone. Please contact your local emergency number or a crisis helpline right now, or reach out to someone you trust and stay with them.";

const DISCLAIMER =
  "This is general information, not a medical diagnosis. It cannot replace a doctor. If you are worried about your health, contact a healthcare professional.";

module.exports = {
  SYMPTOMS,
  URGENCY,
  EMERGENCY_RULES,
  RULES,
  GUIDANCE,
  SELF_HARM_GUIDANCE,
  DISCLAIMER,
};
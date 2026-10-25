const { normalize } = require("./chatSafety.service");

const HEALTH_TERMS =
  /\b(health|medical|medicine|medication|drug|pill|tablet|dose|doctor|nurse|clinic|hospital|patient|disease|illness|condition|symptom|pain|ache|fever|cough|cold|flu|infection|allergy|allergic|injury|wound|bleeding|rash|swelling|nausea|vomit|diarrhea|constipation|headache|migraine|dizzy|dizziness|breathing|breathless|chest|heart|lung|blood|pressure|pulse|kidney|liver|stomach|brain|skin|bone|muscle|joint|throat|ear|eye|tooth|dental|pregnan|pregnancy|birth|menstrual|period|diabetes|cancer|asthma|depression|anxiety|mental|stress|therapy|therapist|suicid|self harm|sleep|nutrition|diet|food|exercise|fitness|weight|height|bmi|vaccine|vaccination|immunization|surgery|treatment|diagnos|prognos|prescription|lab|laboratory|test result|report|scan|x ray|xray|mri|ct scan|ultrasound|first aid|emergency|healthcare|wellness|hygiene|recover|recovery|side effect|interaction|overdose|poison|symptom|sick|unwell|painful|medical record|healthcare|fda)\b/;

function isHealthRelated(text) {
  return HEALTH_TERMS.test(normalize(text));
}

module.exports = { isHealthRelated };

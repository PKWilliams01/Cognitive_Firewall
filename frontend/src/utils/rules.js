// Strategy rules are stored as strings; "[HARD] " marks a system-critical rule.
const HARD_PREFIX = '[HARD] ';

export const parseRule = (raw, index = 0) => {
  const hard = raw.startsWith(HARD_PREFIX);
  return { id: `${index}-${raw}`, raw, hard, label: hard ? raw.slice(HARD_PREFIX.length) : raw };
};

export const parseRules = (list = []) => list.map(parseRule);

export const serializeRule = (label, hard) => (hard ? `${HARD_PREFIX}${label}` : label);

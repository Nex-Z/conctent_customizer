const MATCH_TYPES = ["exact", "contains", "wildcard", "regex"];

const defaultRuleShape = {
  id: "",
  name: "",
  urlPattern: "",
  matchType: "wildcard",
  enabled: true,
  ignoreCase: true,
  preloadMode: "hide",
  textReplacements: [],
  imageReplacements: []
};

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wildcardToRegExp = (pattern = "") => {
  const escaped = escapeRegex(pattern).replace(/\\\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
};

const matchesPattern = (
  targetValue = "",
  pattern = "",
  matchType = "wildcard",
  { caseSensitive = false } = {}
) => {
  if (!pattern) {
    return false;
  }

  switch (matchType) {
    case "exact":
      return (caseSensitive ? targetValue : targetValue.toLowerCase()) ===
        (caseSensitive ? pattern : pattern.toLowerCase());
    case "contains":
      return (caseSensitive ? targetValue : targetValue.toLowerCase()).includes(
        caseSensitive ? pattern : pattern.toLowerCase()
      );
    case "regex":
      try {
        const flags = caseSensitive ? "" : "i";
        return new RegExp(pattern, flags).test(targetValue);
      } catch (error) {
        console.warn("Invalid regex pattern", pattern, error);
        return false;
      }
    case "wildcard":
    default: {
      try {
        return wildcardToRegExp(pattern).test(targetValue);
      } catch (error) {
        console.warn("Invalid wildcard pattern", pattern, error);
        return false;
      }
    }
  }
};

const sanitizeRule = (rule = {}) => {
  const merged = {
    ...defaultRuleShape,
    ...rule
  };

  merged.matchType = MATCH_TYPES.includes(merged.matchType)
    ? merged.matchType
    : "wildcard";
  if (typeof merged.caseSensitive === "boolean" && typeof merged.ignoreCase !== "boolean") {
    merged.ignoreCase = !merged.caseSensitive;
  }
  merged.ignoreCase =
    typeof merged.ignoreCase === "boolean" ? merged.ignoreCase : true;
  merged.preloadMode = ["hide", "compile", "off"].includes(merged.preloadMode)
    ? merged.preloadMode
    : "hide";
  merged.textReplacements = Array.isArray(merged.textReplacements)
    ? merged.textReplacements
    : [];
  merged.imageReplacements = Array.isArray(merged.imageReplacements)
    ? merged.imageReplacements
    : [];

  return merged;
};

const doesUrlMatchRule = (url, rule) => {
  const candidate = sanitizeRule(rule);
  if (!candidate.enabled) {
    return false;
  }

  return matchesPattern(url, candidate.urlPattern, candidate.matchType, {
    caseSensitive: !candidate.ignoreCase
  });
};

const createRuleId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `rule_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;

const normalizeRules = (rules = []) =>
  Array.isArray(rules) ? rules.map(sanitizeRule) : [];

export {
  MATCH_TYPES,
  createRuleId,
  doesUrlMatchRule,
  matchesPattern,
  normalizeRules,
  sanitizeRule,
  wildcardToRegExp
};

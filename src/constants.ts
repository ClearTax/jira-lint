export const HIDDEN_MARKER = 'added_by_jira_lint';
export const MARKER_REGEX = new RegExp(HIDDEN_MARKER);

export const BOT_BRANCH_PATTERNS: RegExp[] = [
  /dependabot/
];

export const DEFAULT_BRANCH_PATTERNS:  RegExp[] = [
  /^master$/,
  /^production$/,
  /^gh-pages$/,
];

export const JIRA_REGEX_MATCHER = /\d+-(([A-Z]{1,10})|[a-z]{1,10})/g;

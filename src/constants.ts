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

/**
 * Regex for matching JIRA issue keys.
 * Regex picked from [this post](https://community.atlassian.com/t5/Bitbucket-questions/Regex-pattern-to-match-JIRA-issue-key/qaq-p/233319)
 * with one modification (allows lowercase prefix).
 */
export const JIRA_REGEX_MATCHER = /\d+-([A-Z]+|[a-z]+)(?!-?[a-zA-Z]{1,10})/g;

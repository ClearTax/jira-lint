/** Hidden marker to add to PR description. */
export const HIDDEN_MARKER = 'added_by_jira_lint';

/** Regex to check for the hidden marker in PR description to avoid adding jira-lint PR details
 * multiple times. */
export const MARKER_REGEX = new RegExp(HIDDEN_MARKER);

/**
 * Bot branch patters to avoid running jira-lint on.
 */
export const BOT_BRANCH_PATTERNS: RegExp[] = [/^dependabot/, /^all-contributors/];

/**
 * Default branch patterns to skip CI. Skip jira-lint when the HEAD ref matches one of these.
 */
export const DEFAULT_BRANCH_PATTERNS: RegExp[] = [
  /^main$/,
  /^master$/,
  /^production$/,
  /^gh-pages$/,
  /^release\/v(\d+\.)?(\d+\.)?(\d+)$/,
];

/**
 * Regex to match JIRA issue keys in branches.
 */
export const JIRA_BRANCH_REGEX_MATCHER = /^[A-Z]{1,10}\d*-\d+-/;

export const JIRA_COMMIT_REGEX_MATCHER = /\njira: [A-Z]{1,10}\d*-\d+$/;

/**
 * Default total maximum number of additions after which jira-lint will discourage the PR as it is
 * considered "too huge to review".
 */
export const DEFAULT_PR_ADDITIONS_THRESHOLD = 800;

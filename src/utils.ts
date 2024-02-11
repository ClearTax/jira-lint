import axios from 'axios';
import * as core from '@actions/core';
import similarity from 'string-similarity-js';

import {
  MARKER_REGEX,
  BOT_BRANCH_PATTERNS,
  DEFAULT_BRANCH_PATTERNS,
  JIRA_BRANCH_REGEX_MATCHER,
  JIRA_COMMIT_REGEX_MATCHER,
  HIDDEN_MARKER,
} from './constants';
import {
  JIRA,
  JIRADetails,
  JIRAClient,
  ValidateCommitMessagesResponse,
  ValidateCommitMessagesResponseItem,
  ListCommitsResponseData,
  AddLabelParameters,
  UpdatePullRequestParameters,
  CreateCommentParameters,
  ListCommitsParameters,
} from './types';
import {GitHub} from "@actions/github/lib/utils";

export const isBlank = (input: string): boolean => input.trim().length === 0;
export const isNotBlank = (input: string): boolean => !isBlank(input);

export const getJIRAIssueKey = (input: string): string => {
  const matches = input.match(JIRA_BRANCH_REGEX_MATCHER);
  const trimTrailingDash = (value: string): string => value.substring(0, value.length - 1);

  return matches?.length ? trimTrailingDash(matches[0]) : '';
};

export const LABELS = {
  HOTFIX_PRE_PROD: 'HOTFIX-PRE-PROD',
  HOTFIX_PROD: 'HOTFIX-PROD',
};

/** Return a hotfix label based on base branch type. */
export const getHotfixLabel = (baseBranch: string): string => {
  if (baseBranch.startsWith('release/v')) return LABELS.HOTFIX_PRE_PROD;
  if (baseBranch.startsWith('production')) return LABELS.HOTFIX_PROD;
  return '';
};

export const getJIRAClient = (baseURL: string, token: string): JIRAClient => {
  const client = axios.create({
    baseURL: `${baseURL}/rest/api/3`,
    timeout: 2000,
    headers: { Authorization: `Basic ${token}` },
  });

  const getIssue = async (id: string): Promise<JIRA.Issue> => {
    try {
      const response = await client.get<JIRA.Issue>(
        `/issue/${id}?fields=project,summary,issuetype,labels,status,customfield_10016`
      );
      return response.data;
    } catch (e) {
      throw e;
    }
  };

  const getTicketDetails = async (key: string): Promise<JIRADetails> => {
    try {
      const issue: JIRA.Issue = await getIssue(key);
      const {
        fields: {
          issuetype: type,
          project,
          summary,
          customfield_10016: estimate,
          labels: rawLabels,
          status: issueStatus,
        },
      } = issue;

      const labels = rawLabels.map((label) => ({
        name: label,
        url: `${baseURL}/issues?jql=${encodeURIComponent(
          `project = ${project.key} AND labels = ${label} ORDER BY created DESC`
        )}`,
      }));

      return {
        key,
        summary,
        url: `${baseURL}/browse/${key}`,
        status: issueStatus.name,
        type: {
          name: type.name,
          icon: type.iconUrl,
        },
        project: {
          name: project.name,
          url: `${baseURL}/browse/${project.key}`,
          key: project.key,
        },
        estimate: typeof estimate === 'string' || typeof estimate === 'number' ? estimate : 'N/A',
        labels,
      };
    } catch (e) {
      throw e;
    }
  };

  return {
    client,
    getTicketDetails,
    getIssue,
  };
};

/** Add the specified label to the PR. */
export const addLabels = async (client: InstanceType<typeof GitHub>, labelData: AddLabelParameters): Promise<void> => {
  try {
    await client.rest.issues.addLabels(labelData);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
    core.setFailed("Unknown error");
    process.exit(1);
  }
};

/** Update a PR details. */
export const updatePrDetails = async (client: InstanceType<typeof GitHub>, prData: UpdatePullRequestParameters): Promise<void> => {
  try {
    await client.rest.pulls.update(prData);
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
    core.setFailed("Unknown error");
    process.exit(1);
  }
};

/** Add a comment to a PR. */
export const addComment = async (client: InstanceType<typeof GitHub>, comment: CreateCommentParameters): Promise<void> => {
  try {
    await client.rest.issues.createComment(comment)
    //await client.issues.createComment(comment);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
    core.setFailed("Unknown error");
    process.exit(1);
  }
};

/** Get commit messages from a PR. */
export const getCommits = async (
  client: InstanceType<typeof GitHub>,
  payload: ListCommitsParameters
): Promise<ListCommitsResponseData> => {
  try {
    const commits = await client.rest.pulls.listCommits(payload);
    return commits.data
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
    core.setFailed("Unknown error");
    process.exit(1);
  }
};

/** Validate commit messages. */
export const validateCommitMessages = (
  commits: ListCommitsResponseData,
  jiraIssueKey: string
): ValidateCommitMessagesResponse => {
  const isMergeCommit = (message: string): boolean => /^Merge (branch|pull request)/i.test(message);
  const isRevertCommit = (message: string): boolean => /^Revert "/i.test(message);
  const results = commits.map((commit) => {
    const { message } = commit.commit;
    const hasCorrectJiraKey = message.match(new RegExp(`\njira: ${jiraIssueKey}`)) !== null;
    const hasAnyJiraKey = message.match(JIRA_COMMIT_REGEX_MATCHER) !== null;

    const validatedCommitMessage: ValidateCommitMessagesResponseItem = {
      ...commit,
      hasJiraKey: hasAnyJiraKey,
      valid: isDocCommit(commit) || hasCorrectJiraKey || isMergeCommit(message) || isRevertCommit(message),
    }

    return validatedCommitMessage
  });

  return {
    valid: results.every((commitResult) => commitResult.valid),
    results,
  };
};

export const isDocCommit = (commit: ListCommitsResponseData[0]): boolean => {
  return commit.commit.message.startsWith('docs:');
};

/** Validate PR title. */
export const validatePrTitle = (title: string, issueKey: string): boolean => {
  return title.startsWith(`${issueKey} `);
};

/** Get the comment body for pr with no JIRA id in the branch name. */
export const getNoIdPrTitleComment = (title: string): string => {
  return `<h3>❌ PR TITLE</h3><p> A JIRA Issue ID is missing from your PR title! 🦄</p>
<p>Your title: ${title}</p>
<hr />
<p>Please follow <a href="https://github.com/invitation-homes/technology-decisions/blob/main/0014-tracking-jira-issues-in-git.md">our standards</a> for PR titles.</p>
Valid sample PR titles:

  ‣ 'DDTS-112 Build new CMS'
  ‣ 'TTEF-2 Fix React Native bug'
  ‣ 'INTG-332 Add logging to external api'

<p><strong>💡 TIP:</strong> If you're certain the title is correct, try closing and reopening the pull request as a work-around. Sometimes the request data to the action gets cached.</p>
<p><strong>🤔 Why?</strong> So that it will automatically show up in the Development section of the Jira issue! 🚀</p>
  `;
};

/** Get a comment based on story title and PR title similarity. */
export const getPRTitleComment = (storyTitle: string, prTitle: string): string => {
  const matchRange: number = similarity(storyTitle, prTitle);
  if (matchRange < 0.2) {
    return `<p>
    Knock Knock! 🔍
  </p>
  <p>
    Just thought I'd let you know that your <em>PR title</em> and <em>story title</em> look <strong>quite different</strong>. PR titles
    that closely resemble the story title make it easier for reviewers to understand the context of the PR.
  </p>
  <blockquote>
    An easy-to-understand PR title a day makes the reviewer review away! 😛⚡️
  </blockquote>
  <table>
    <tr>
      <th>Story Title</th>
      <td>${storyTitle}</td>
    </tr>
    <tr>
        <th>PR Title</th>
        <td>${prTitle}</td>
      </tr>
  </table>
  <p>
    Check out this <a href="https://www.atlassian.com/blog/git/written-unwritten-guide-pull-requests">guide</a> to learn more about PR best-practices.
  </p>
  `;
  } else if (matchRange >= 0.2 && matchRange <= 0.4) {
    return `<p>
    Let's make that PR title a 💯 shall we? 💪
    </p>
    <p>
    Your <em>PR title</em> and <em>story title</em> look <strong>slightly different</strong>. Just checking in to know if it was intentional!
    </p>
    <table>
      <tr>
        <th>Story Title</th>
        <td>${storyTitle}</td>
      </tr>
      <tr>
          <th>PR Title</th>
          <td>${prTitle}</td>
        </tr>
    </table>
    <p>
      Check out this <a href="https://www.atlassian.com/blog/git/written-unwritten-guide-pull-requests">guide</a> to learn more about PR best-practices.
    </p>
    `;
  }
  return `<p>I'm a bot and I 👍 this PR title. 🤖</p>

  <img src="https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif" width="400" />`;
};

/**
 * Check if the PR is an automated one created by a bot or one matching ignore patterns supplied
 * via action metadata.
 *
 * @example shouldSkipBranchLint('dependabot') -> true
 * @example shouldSkipBranchLint('feature/update_123456789') -> false
 */
export const shouldSkipBranchLint = (branch: string, additionalIgnorePattern?: string): boolean => {
  if (BOT_BRANCH_PATTERNS.some((pattern) => pattern.test(branch))) {
    console.log(`You look like a bot 🤖 so we're letting you off the hook!`);
    return true;
  }

  if (DEFAULT_BRANCH_PATTERNS.some((pattern) => pattern.test(branch))) {
    console.log(`Ignoring check for default branch ${branch}`);
    return true;
  }

  const ignorePattern = new RegExp(additionalIgnorePattern || '');
  if (!!additionalIgnorePattern && ignorePattern.test(branch)) {
    console.log(
      `branch '${branch}' ignored as it matches the ignore pattern '${additionalIgnorePattern}' provided in skip-branches`
    );
    return true;
  }

  console.log(`branch '${branch}' does not match ignore pattern provided in 'skip-branches' option:`, ignorePattern);
  return false;
};

/**
 * Returns true if the body contains the hidden marker. Used to avoid adding
 * story details to the PR multiple times.
 *
 * @example shouldUpdatePRDescription('--\nadded_by_pr_lint\n') -> true
 * @example shouldUpdatePRDescription('# some description') -> false
 */
export const shouldUpdatePRDescription = (
  /** The PR description/body as a string. */
  body?: string
): boolean => typeof body === 'string' && !MARKER_REGEX.test(body);

/**
 * Get links to labels & remove spacing so the table works.
 */
export const getLabelsForDisplay = (labels: JIRADetails['labels']): string => {
  if (!labels || !labels.length) {
    return '-';
  }
  const markUp = labels.map((label) => `<a href="${label.url}" title="${label.name}">${label.name}</a>`).join(', ');
  return markUp.replace(/\s+/, ' ');
};

/** Get PR description with story/issue details. */
export const getPRDescription = (body = '', details: JIRADetails): string => {
  const displayKey = details.key.toUpperCase();

  return `
<details open>
  <summary><a href="${details.url}" title="${displayKey}" target="_blank">${displayKey}</a></summary>
  <br />
  <table>
    <tr>
      <th>Summary</th>
      <td>${details.summary}</td>
    </tr>
    <tr>
      <th>Type</th>
      <td>
        <img alt="${details.type.name}" src="${details.type.icon}" />
        ${details.type.name}
      </td>
    </tr>
    <tr>
      <th>Status</th>
      <td>${details.status}</td>
    </tr>
    <tr>
      <th>Points</th>
      <td>${details.estimate || 'N/A'}</td>
    </tr>
    <tr>
      <th>Labels</th>
      <td>${getLabelsForDisplay(details.labels)}</td>
    </tr>
  </table>
</details>
<!--
  do not remove this marker as it will break jira-lint's functionality.
  ${HIDDEN_MARKER}
-->

---

${body}`;
};

/** Check if a PR is considered "huge". */
export const isHumongousPR = (additions: number, threshold: number): boolean =>
  typeof additions === 'number' && additions > threshold;

/** Get the comment body for very huge PR. */
export const getHugePrComment = (
  /** Number of additions. */
  additions: number,
  /** Threshold of additions allowed. */
  threshold: number
): string =>
  `<p>This PR is too huge for one to review :broken_heart: </p>
  <img src="https://media.giphy.com/media/26tPskka6guetcHle/giphy.gif" width="400" />
    <table>
      <tr>
          <th>Additions</th>
          <td>${additions} :no_good_woman: </td>
      </tr>
      <tr>
          <th>Expected</th>
          <td>:arrow_down: ${threshold}</td>
        </tr>
    </table>
    <p>
    Consider breaking it down into multiple small PRs.
    </p>
    <p>
      Check out this <a href="https://www.atlassian.com/blog/git/written-unwritten-guide-pull-requests">guide</a> to learn more about PR best-practices.
    </p>
  `;

/** Get the comment body for pr with no JIRA id in the branch name. */
export const getNoIdComment = (branch: string): string => {
  return `<h3>❌ BRANCH NAME</h3><p> A JIRA Issue ID is missing from your branch name! 🦄</p>
<p>Your branch: ${branch}</p>
<hr />
<p>Please follow <a href="https://github.com/invitation-homes/technology-decisions/blob/main/0014-tracking-jira-issues-in-git.md">our standards</a> for branch naming.</p>
<p>Without the JIRA Issue ID in your branch name you would lose out on automatic updates to JIRA via SCM; some GitHub status checks might fail.</p>
Valid sample branch names:

  ‣ 'DDTS-112-build-new-cms'
  ‣ 'TTEF-2-fix-react-native-bug'
  ‣ 'INTG-332-add-logging-to-external-api'
`;
};

/** Get the comment body for pr with differnt JIRA ids in one or more commit messages. */
export const getDifferentIdCommitMessagesComment = (validationResponse: ValidateCommitMessagesResponse): string => {
  return `<h3>❌ COMMIT MESSAGE(S) - DIFFERENT JIRA KEYS</h3><p> A different JIRA Issue ID was used one or more of your commit messages! 🦄</p>
  <p>Commits with different IDs:</p>
  ${validationResponse.results
    .filter(({ valid, hasJiraKey }) => !valid && hasJiraKey)
    .map(
      (commit) => `‣ ${commit.sha} - ${commit.commit.message}
  `
    )}<hr />`;
};

/** Get the comment body for pr with no JIRA id in one or more commit messages. */
export const getNoIdCommitMessagesComment = (validationResponse: ValidateCommitMessagesResponse): string => {
  return `<h3>❌ COMMIT MESSAGE(S) - MISSING JIRA KEYS</h3>
<p> A JIRA Issue ID is missing from one or more of your commit messages! 🦄</p>
<p>Commits without IDs:</p>
  ${validationResponse.results
    .filter(({ valid }) => !valid)
    .filter(({ hasJiraKey }) => !hasJiraKey)
    .map(
      (commit) => `‣ ${commit.sha} - ${commit.commit.message}
  `
    )}
<hr />
<p>Please follow <a href="https://github.com/invitation-homes/technology-decisions/blob/main/0014-tracking-jira-issues-in-git.md">our standards</a> for commit messages.</p>
Example of a valid commit message:</p>
<pre>
<code>feat: build new CMS</code>
<br />
<code>jira: DDTS-112</code></pre>

<p>Refer to <a href="https://github.com/invitation-homes/technology-decisions/blob/main/0014-tracking-jira-issues-in-git.md" target="_blank">our standards</a> for more examples and information.</p>
`;
};

/** Check if jira issue status validation is enabled then compare the issue status will the allowed statuses. */
export const isIssueStatusValid = (
  shouldValidate: boolean,
  allowedIssueStatuses: string[],
  details: JIRADetails
): boolean => {
  if (!shouldValidate) {
    core.info('Skipping Jira issue status validation as shouldValidate is false');
    return true;
  }

  return allowedIssueStatuses.includes(details.status);
};

/** Get the comment body for very huge PR. */
export const getInvalidIssueStatusComment = (
  /** Number of additions. */
  issueStatus: string,
  /** Threshold of additions allowed. */
  allowedStatuses: string
): string =>
  `<p>:broken_heart: The detected issue is not in one of the allowed statuses :broken_heart: </p>    
   <table>
     <tr>
        <th>Detected Status</th>
        <td>${issueStatus}</td>
        <td>:x:</td>
     </tr>
     <tr>
        <th>Allowed Statuses</th>
        <td>${allowedStatuses}</td>
        <td>:heavy_check_mark:</td>
      </tr>
   </table>
   <p>Please ensure your jira story is in one of the allowed statuses</p>
  `;

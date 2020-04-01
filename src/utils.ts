import axios from 'axios';
import * as core from '@actions/core';
import * as github from '@actions/github';
import similarity from 'string-similarity';
import { IssuesAddLabelsParams, PullsUpdateParams, IssuesCreateCommentParams } from '@octokit/rest';
import {
  MARKER_REGEX,
  BOT_BRANCH_PATTERNS,
  DEFAULT_BRANCH_PATTERNS,
  JIRA_REGEX_MATCHER,
  HIDDEN_MARKER,
} from './constants';
import { JIRA, JIRADetails } from './types';

export const isBlank = (input: string) => input.trim().length === 0;
export const isNotBlank = (input: string) => !isBlank(input);

/**
 * Reverse a string
 */
export const reverseString = (input: string) =>
  input
    .split('')
    .reverse()
    .join('');

/**
 * Extract JIRA issue keys from a string
 * @param {string} input
 */
export const getJIRAIssueKeys = (input: string): string[] => {
  const matches = reverseString(input).toUpperCase().match(JIRA_REGEX_MATCHER);
  if (matches?.length) {
    return matches.map(reverseString).reverse();
  } else return [];
};

export const LABELS = {
  HOTFIX_PRE_PROD: 'HOTFIX-PRE-PROD',
  HOTFIX_PROD: 'HOTFIX-PROD',
};

/**
 * Return a hotfix label based on base branch type
 * @param {string} baseBranch
 */
export const getHotfixLabel = (baseBranch: string): string => {
  if (baseBranch.startsWith('release/v')) return LABELS.HOTFIX_PRE_PROD;
  if (baseBranch.startsWith('production')) return LABELS.HOTFIX_PROD;
  return '';
};

export const getJIRAClient = (baseURL: string, token: string) => {
  const client = axios.create({
    baseURL: `${baseURL}/rest/api/3`,
    timeout: 2000,
    headers: { Authorization: `Basic ${token}` },
  });

  /**
   * Get complete issue details
   */
  const getIssue = async (id: string): Promise<JIRA.Issue> => {
    try {
      const response = await client.get<JIRA.Issue>(
        `/issue/${id}?fields=project,summary,issuetype,labels,customfield_10016`
      );
      return response.data;
    } catch (e) {
      throw e;
    }
  };

  /**
   * Get required details to display in PR
   */
  const getTicketDetails = async (key: string) => {
    try {
      const issue: JIRA.Issue = await getIssue(key);
      const {
        fields: { issuetype: type, project, summary, customfield_10016: estimate, labels: rawLabels },
      } = issue;

      const labels = rawLabels.map(label => ({
        name: label,
        url: `${baseURL}/issues?jql=${encodeURIComponent(
          `project = ${project.key} AND labels = ${label} ORDER BY created DESC`
        )}`,
      }));

      return {
        key,
        summary,
        url: `${baseURL}/browse/${key}`,
        type: {
          name: type.name,
          icon: type.iconUrl,
        },
        project: {
          name: project.name,
          url: `${baseURL}/browse/${project.key}`,
          key: project.key,
        },
        estimate,
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

/**
 * Add the specified label to the PR
 * @param {github.GitHub} client
 * @param {IssuesAddLabelsParams} labelData
 */
export const addLabels = async (client: github.GitHub, labelData: IssuesAddLabelsParams) => {
  try {
    await client.issues.addLabels(labelData);
  } catch (error) {
    core.setFailed(error.message);
    process.exit(1);
  }
};

/**
 *  Update a PR details
 * @param {github.GitHub} client
 * @param {PullsUpdateParams} prData
 */
export const updatePrDetails = async (client: github.GitHub, prData: PullsUpdateParams) => {
  try {
    await client.pulls.update(prData);
  } catch (error) {
    core.setFailed(error.message);
    process.exit(1);
  }
};

/**
 *  Add a comment to a PR
 * @param {github.GitHub} client
 * @param {IssuesCreateCommentParams} comment
 */
export const addComment = async (client: github.GitHub, comment: IssuesCreateCommentParams) => {
  try {
    await client.issues.createComment(comment);
  } catch (error) {
    core.setFailed(error.message);
  }
};

/**
 *  Get a comment based on story title and PR title similarity
 */
export const getPRTitleComment = (storyTitle: string, prTitle: string, skipGifs: string): string => {
  const matchRange: number = similarity.compareTwoStrings(storyTitle, prTitle);
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

  let s = `<p>I'm a bot and I 👍 this PR title. 🤖</p>`;
  if (skipGifs !== 'true') {
    s += `
    
    <img src="https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif" width="400" />`;
  }
  return s
};

/**
 * Check if the PR is an automated one created by a bot or one matching ignore patterns supplied
 * via action metadata.
 * @param {string} branch
 * @example shouldSkipBranchLint('dependabot') -> true
 * @example shouldSkipBranchLint('feature/update_123456789') -> false
 */
export const shouldSkipBranchLint = (branch: string, additionalIgnorePattern?: string): boolean => {
  if (BOT_BRANCH_PATTERNS.some(pattern => pattern.test(branch))) {
    console.log(`You look like a bot 🤖 so we're letting you off the hook!`);
    return true;
  }

  if (DEFAULT_BRANCH_PATTERNS.some(pattern => pattern.test(branch))) {
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
  const markUp = labels.map(label => `<a href="${label.url}" title="${label.name}">${label.name}</a>`).join(', ');
  return markUp.replace(/\s+/, ' ');
}

/**
 * Get PR description with story/issue details
 */
export const getPRDescription = (body: string = '', details: JIRADetails): string => {
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

/**
 * Check if a PR is huge
 * @param {number} addtions
 * @return {boolean}
 */
export const isHumongousPR = (additions: number, threshold: number): boolean => additions > threshold;

/**
 * Get the comment body for very huge PR
 * @param {number} files
 * @param {number} addtions
 * @return {string}
 */
export const getHugePrComment = (additions: number, threshold: number, skipGifs: string): string => {
  let s = `<p>This PR is too huge for one to review :broken_heart: </p>`
  if (skipGifs !== 'true') {
    s += `
    <img src="https://media.giphy.com/media/26tPskka6guetcHle/giphy.gif" width="400" />`
  }
  s += `
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
  return s
};

/**
 * Get the comment body for pr with no JIRA id in the branch name
 * @param {string} branch
 * @return {string}
 */
export const getNoIdComment = (branch: string) => {
  return `<p> A JIRA Issue ID is missing from your branch name! 🦄</p>
<p>Your branch: ${branch}</p>
<p>If this is your first time contributing to this repository - welcome!</p>
<hr />
<p>Please refer to <a href="https://github.com/cleartax/jira-lint">jira-lint</a> to get started.
<p>Without the JIRA Issue ID in your branch name you would lose out on automatic updates to JIRA via SCM; some GitHub status checks might fail.</p>
Valid sample branch names:

  ‣ feature/shiny-new-feature--mojo-10'
  ‣ 'chore/changelogUpdate_mojo-123'
  ‣ 'bugfix/fix-some-strange-bug_GAL-2345'
`;
};

/**
 * Return true if skip-comments is set to false
 * @param {string} skipConfig
 */
export const shouldAddComments = (skipConfig: string) => skipConfig !== 'true';

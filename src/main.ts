import * as core from '@actions/core';
import * as github from '@actions/github';

import {
  addComment,
  addLabels,
  getHotfixLabel,
  getHugePrComment,
  getJIRAClient,
  getJIRAIssueKey,
  getNoIdComment,
  getPRDescription,
  getPRTitleComment,
  isDocCommit,
  isHumongousPR,
  isNotBlank,
  shouldSkipBranchLint,
  shouldUpdatePRDescription,
  updatePrDetails,
  isIssueStatusValid,
  getInvalidIssueStatusComment,
  getCommits,
  validateCommitMessages,
  getDifferentIdCommitMessagesComment,
  getNoIdCommitMessagesComment,
  validatePrTitle,
  getNoIdPrTitleComment,
} from './utils';
import {
  PullRequestParams,
  JIRADetails,
  JIRALintActionInputs,
  CreateCommentParameters,
  UpdatePullRequestParameters,
} from './types';
import { DEFAULT_PR_ADDITIONS_THRESHOLD } from './constants';

const getInputs = (): JIRALintActionInputs => {
  const JIRA_TOKEN: string = core.getInput('jira-token', { required: true });
  const JIRA_BASE_URL: string =
    core.getInput('jira-base-url', { required: false }) ?? 'https://invitationhomes.atlassian.net';
  const GITHUB_TOKEN: string = core.getInput('github-token', { required: true });
  const BRANCH_IGNORE_PATTERN: string = core.getInput('skip-branches', { required: false }) || '';
  const SKIP_COMMENTS: boolean = core.getInput('skip-comments', { required: false }) === 'true';
  const PR_THRESHOLD = parseInt(core.getInput('pr-threshold', { required: false }), 10);
  const VALIDATE_ISSUE_STATUS: boolean = core.getInput('validate_issue_status', { required: false }) === 'true';
  const ALLOWED_ISSUE_STATUSES: string = core.getInput('allowed_issue_statuses');

  return {
    JIRA_TOKEN,
    GITHUB_TOKEN,
    BRANCH_IGNORE_PATTERN,
    SKIP_COMMENTS,
    PR_THRESHOLD: isNaN(PR_THRESHOLD) ? DEFAULT_PR_ADDITIONS_THRESHOLD : PR_THRESHOLD,
    JIRA_BASE_URL: JIRA_BASE_URL.endsWith('/') ? JIRA_BASE_URL.replace(/\/$/, '') : JIRA_BASE_URL,
    VALIDATE_ISSUE_STATUS,
    ALLOWED_ISSUE_STATUSES,
  };
};

async function run(): Promise<void> {
  try {
    const {
      JIRA_TOKEN,
      JIRA_BASE_URL,
      GITHUB_TOKEN,
      BRANCH_IGNORE_PATTERN,
      SKIP_COMMENTS,
      PR_THRESHOLD,
      VALIDATE_ISSUE_STATUS,
      ALLOWED_ISSUE_STATUSES,
    } = getInputs();

    const defaultAdditionsCount = 800;
    const prThreshold: number = PR_THRESHOLD ? Number(PR_THRESHOLD) : defaultAdditionsCount;

    const {
      payload: {
        repository,
        organization: { login: owner },
        pull_request: pullRequest,
      },
    } = github.context;

    if (typeof repository === 'undefined') {
      throw new Error(`Missing 'repository' from github action context.`);
    }

    const { name: repo } = repository;

    const {
      base: { ref: baseBranch },
      head: { ref: headBranch },
      number: prNumber = 0,
      body: prBody = '',
      additions = 0,
      title = '',
    } = pullRequest as PullRequestParams;

    // common fields for both issue and comment
    const commonPayload = {
      owner,
      repo,
      issue_number: prNumber,
    };

    // github client with given token
    const client = github.getOctokit(GITHUB_TOKEN);

    if (!headBranch && !baseBranch) {
      const commentBody = 'jira-lint is unable to determine the head and base branch';
      const comment: CreateCommentParameters = {
        ...commonPayload,
        body: commentBody,
      };
      await addComment(client, comment);

      core.setFailed('Unable to get the head and base branch');
      process.exit(1);
    }

    console.log('Base branch -> ', baseBranch);
    console.log('Head branch -> ', headBranch);

    if (shouldSkipBranchLint(headBranch, BRANCH_IGNORE_PATTERN)) {
      process.exit(0);
    }

    // skip if only `docs:` commits
    // Get commits for pull request
    const prPayload = {
      owner,
      repo,
      pull_number: prNumber,
    };
    console.log('Fetching PR commits...');
    const commits = await getCommits(client, prPayload);
    console.log('Fetched PR commits');
    console.log({ commits });
    if (commits.every((c) => isDocCommit(c))) {
      const comment: CreateCommentParameters = {
        ...commonPayload,
        body: '🙌 Thanks for taking time to update docs!! 👏',
      };
      await addComment(client, comment);
      console.log('Skipping jira-lint - all commits start with "docs:"');
      process.exit(0);
    }

    const issueKey = getJIRAIssueKey(headBranch);
    if (!issueKey.length) {
      const comment: CreateCommentParameters = {
        ...commonPayload,
        body: getNoIdComment(headBranch),
      };
      await addComment(client, comment);

      core.setFailed('JIRA issue id is missing in your branch.');
      process.exit(1);
    }

    console.log(`JIRA key -> ${issueKey}`);

    const { getTicketDetails } = getJIRAClient(JIRA_BASE_URL, JIRA_TOKEN);
    const details: JIRADetails = await getTicketDetails(issueKey);
    if (details.key) {
      const podLabel = details?.project?.name || '';
      const hotfixLabel: string = getHotfixLabel(baseBranch);
      const typeLabel: string = details?.type?.name || '';
      const labels: string[] = [podLabel, hotfixLabel, typeLabel].filter(isNotBlank);
      console.log('Adding labels -> ', labels);

      await addLabels(client, {
        ...commonPayload,
        labels,
      });

      if (!isIssueStatusValid(VALIDATE_ISSUE_STATUS, ALLOWED_ISSUE_STATUSES.split(','), details)) {
        const invalidIssueStatusComment: CreateCommentParameters = {
          ...commonPayload,
          body: getInvalidIssueStatusComment(details.status, ALLOWED_ISSUE_STATUSES),
        };
        console.log('Adding comment for invalid issue status');
        await addComment(client, invalidIssueStatusComment);

        core.setFailed('The found jira issue does is not in acceptable statuses');
        process.exit(1);
      }

      if (shouldUpdatePRDescription(prBody)) {
        const prData: UpdatePullRequestParameters = {
          owner,
          repo,
          pull_number: prNumber,
          body: getPRDescription(prBody, details),
        };
        await updatePrDetails(client, prData);

        // add comment for PR title
        if (!SKIP_COMMENTS) {
          const prTitleComment: CreateCommentParameters = {
            ...commonPayload,
            body: getPRTitleComment(details.summary, title),
          };
          console.log('Adding comment for the PR title');
          addComment(client, prTitleComment);

          // add a comment if the PR is huge
          if (isHumongousPR(additions, prThreshold)) {
            const hugePrComment: CreateCommentParameters = {
              ...commonPayload,
              body: getHugePrComment(additions, prThreshold),
            };
            console.log('Adding comment for huge PR');
            addComment(client, hugePrComment);
          }
        }
      }

      const validatePrCommits = async (): Promise<void> => {
        // 1. Validate commit messages against Jira issue key
        const prCommitsValidationResults = validateCommitMessages(commits, issueKey);

        // 2. If there are invalid commit messages, post a comment to the PR and exit/fail
        if (!prCommitsValidationResults.valid) {
          const containsOtherJiraKeys = prCommitsValidationResults.results.some((r) => !r.valid && r.hasJiraKey);
          console.log(`Contains other jira keys in commits? "${containsOtherJiraKeys}"`);

          if (containsOtherJiraKeys) {
            const commitsWithDifferentJiraKeyComment = {
              ...commonPayload,
              body: getDifferentIdCommitMessagesComment(prCommitsValidationResults),
            };
            console.log('Adding comment for commits without Jira Issue Key');
            await addComment(client, commitsWithDifferentJiraKeyComment);
          }

          const commitsWithoutJiraKeys = prCommitsValidationResults.results.filter((commit) => !commit.hasJiraKey);
          if (commitsWithoutJiraKeys.length) {
            const commitsWithoutJiraKeyComment = {
              ...commonPayload,
              body: getNoIdCommitMessagesComment(prCommitsValidationResults),
            };
            console.log('Adding comment for commits without Jira Issue Key');
            await addComment(client, commitsWithoutJiraKeyComment);
          }

          core.setFailed(`One or more commits did not prepend the Jira Issue Key - ${issueKey}`);
          process.exit(1);
        }
      };
      await validatePrCommits();

      const validatePullRequestTitle = async (): Promise<void> => {
        console.log(`Validating PR Title "${title}" with Jira Issue Key "${issueKey}"`);
        if (!validatePrTitle(title, issueKey)) {
          const invalidPrTitleComment = {
            ...commonPayload,
            body: getNoIdPrTitleComment(title),
          };
          console.log('Adding comment for PR Title without Jira Issue Key');
          await addComment(client, invalidPrTitleComment);
          core.setFailed('PR title did not prepend the Jira Issue Key');
          process.exit(1);
        }
      };
      await validatePullRequestTitle();
    } else {
      const comment: CreateCommentParameters = {
        ...commonPayload,
        body: getNoIdComment(headBranch),
      };
      await addComment(client, comment);

      core.setFailed('Invalid JIRA key. Please create a branch with a valid JIRA issue key.');
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
    core.setFailed(`Unknown error: ${error}`);
    console.log({ error });
    process.exit(1);
  }
}

run();

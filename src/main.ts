import * as core from '@actions/core';
import * as github from '@actions/github';
import { PullsUpdateParams, IssuesCreateCommentParams } from '@octokit/rest';

import {
  getJIRAClient,
  getHotfixLabel,
  addLabels,
  shouldSkipBranchLint,
  updatePrDetails,
  getJIRAIssueKeys,
  getPRDescription,
  shouldUpdatePRDescription,
  addComment,
  getPRTitleComment,
  getHugePrComment,
  isHumongousPR,
  getNoIdComment,
  shouldAddComments,
  isNotBlank,
} from './utils';
import { PullRequestParams, JIRADetails } from './types';

const getInputs = () => {
  const JIRA_TOKEN: string = core.getInput('jira-token', { required: true });
  const JIRA_BASE_URL: string = core.getInput('jira-base-url', { required: true });
  const GITHUB_TOKEN: string = core.getInput('github-token', { required: true });
  const BRANCH_IGNORE_PATTERN: string = core.getInput('skip-branches', { required: false }) || '';
  const SKIP_COMMENTS: string = core.getInput('skip-comments', { required: false }) || 'false';
  const SKIP_GIFS: string = core.getInput('skip-gifs', { required: false }) || 'false';
  const PR_THRESHOLD: string = core.getInput('pr-threshold', { required: false }) || '';

  return {
    JIRA_TOKEN,
    GITHUB_TOKEN,
    BRANCH_IGNORE_PATTERN,
    SKIP_COMMENTS,
    SKIP_GIFS,
    PR_THRESHOLD,
    JIRA_BASE_URL: JIRA_BASE_URL.endsWith('/') ? JIRA_BASE_URL.replace(/\/$/, '') : JIRA_BASE_URL,
  };
};

async function run() {
  try {
    const { JIRA_TOKEN, JIRA_BASE_URL, GITHUB_TOKEN, BRANCH_IGNORE_PATTERN, SKIP_COMMENTS, SKIP_GIFS, PR_THRESHOLD } = getInputs();

    const defaultAdditionsCount = 800;
    const prThreshold: number = PR_THRESHOLD ? Number(PR_THRESHOLD) : defaultAdditionsCount;

    const {
      payload: {
        repository,
        organization: { login: owner },
        pull_request,
      },
    } = github.context;

    const repo: string = repository!.name;

    const {
      base: { ref: baseBranch },
      head: { ref: headBranch },
      number: prNumber = 0,
      body: prBody = '',
      additions = 0,
      title = '',
    } = pull_request as PullRequestParams;

    // common fields for both issue and comment
    const commonPayload = {
      owner,
      repo,
      issue_number: prNumber,
    };

    // github client with given token
    const client: github.GitHub = new github.GitHub(GITHUB_TOKEN);

    if (!headBranch && !baseBranch) {
      const commentBody = 'jira-lint is unable to determine the head and base branch';
      const comment: IssuesCreateCommentParams = {
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

    const issueKeys = getJIRAIssueKeys(headBranch);
    if (!issueKeys.length) {
      const comment: IssuesCreateCommentParams = {
        ...commonPayload,
        body: getNoIdComment(headBranch),
      };
      await addComment(client, comment);

      core.setFailed('JIRA issue id is missing in your branch.');
      process.exit(1);
    }

    // use the last match (end of the branch name)
    const issueKey = issueKeys[issueKeys.length - 1];
    console.log(`JIRA key -> ${issueKey}`)

    const { getTicketDetails } = getJIRAClient(JIRA_BASE_URL, JIRA_TOKEN);
    const details: JIRADetails = await getTicketDetails(issueKey);
    if (details.key) {
      const podLabel = details?.project?.name || '';
      const hotfixLabel: string = getHotfixLabel(baseBranch);
      const typeLabel: string = details?.type?.name || '';
      const labels: string[] = [podLabel, hotfixLabel, typeLabel].filter(isNotBlank);
      console.log('Adding lables -> ', labels);

      await addLabels(client, {
        ...commonPayload,
        labels,
      });

      if (shouldUpdatePRDescription(prBody)) {
        const prData: PullsUpdateParams = {
          owner,
          repo,
          pull_number: prNumber,
          body: getPRDescription(prBody, details),
        };
        await updatePrDetails(client, prData);

        // add comment for PR title
        if (shouldAddComments(SKIP_COMMENTS)) {
          const prTitleComment: IssuesCreateCommentParams = {
            ...commonPayload,
            body: getPRTitleComment(details.summary, title, SKIP_GIFS),
          };
          console.log('Adding comment for the PR title');
          addComment(client, prTitleComment);

          // add a comment if the PR is huge
          if (isHumongousPR(additions, prThreshold)) {
            const hugePrComment: IssuesCreateCommentParams = {
              ...commonPayload,
              body: getHugePrComment(additions, prThreshold, SKIP_GIFS),
            };
            console.log('Adding comment for huge PR');
            addComment(client, hugePrComment);
          }
        }
      }
    } else {
      const comment: IssuesCreateCommentParams = {
        ...commonPayload,
        body: getNoIdComment(headBranch),
      };
      await addComment(client, comment);

      core.setFailed('Invalid JIRA key. Please create a branch with a valid JIRA issue key.');
      process.exit(1);
    }
  } catch (error) {
    console.log({ error });
    core.setFailed(error.message);
    process.exit(1);
  }
}

run();

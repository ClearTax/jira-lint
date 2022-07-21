import * as core from '@actions/core';
import * as github from '@actions/github';
import { PullsUpdateParams, IssuesCreateCommentParams } from '@octokit/rest';

import {
  addComment,
  addLabels,
  getHotfixLabel,
  getHugePrComment,
  getJIRAClient,
  getJIRAIssueKeys,
  getNoIdComment,
  getPRDescription,
  getPRTitleComment,
  isHumongousPR,
  isNotBlank,
  shouldSkipBranchLint,
  shouldUpdatePRDescription,
  updatePrDetails,
  isIssueStatusValid,
  getInvalidIssueStatusComment,
  validateCommits,
  getJiraTicket,
} from './utils';
import { PullRequestParams, JIRADetails, JIRALintActionInputs } from './types';
import { DEFAULT_PR_ADDITIONS_THRESHOLD } from './constants';

const getInputs = (): JIRALintActionInputs => {
  const JIRA_TOKEN: string = core.getInput('jira-token', { required: true });
  const JIRA_BASE_URL: string = core.getInput('jira-base-url', { required: true });
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
      // eslint-disable-next-line @typescript-eslint/camelcase
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

    const {
      eventName,
      payload: { repository: ghrepo, pull_request: pr },
    } = github.context;
    let commitsToValidate = [];

    console.log('# Start PR case');
    if (eventName === 'pull_request') {
      const commitsListed = await client.pulls.listCommits({
        owner: ghrepo?.owner?.login ?? '',
        repo: ghrepo?.name ?? '',
        // eslint-disable-next-line @typescript-eslint/camelcase
        pull_number: pr?.number ?? 0,
      });

      const commits = commitsListed.data;
      for (const commit of commits) {
        commitsToValidate.push(commit.commit);
      }
    }

    console.log('# Start push case');
    if (eventName === 'push') {
      //Get the JSON webhook payload for the event that triggered the workflow
      const commits = github.context.payload.commits;
      commitsToValidate = commitsToValidate.concat(commits);
    }

    // Check messages
    let result = true;
    let jiraTicket = '';

    //Validate commits
    console.log('# Validate commits');
    const { getTicketDetails } = getJIRAClient(JIRA_BASE_URL, JIRA_TOKEN);
    for (const commit of commitsToValidate) {
      if (!validateCommits(commit.message)) {
        core.error(`Failed: "${commit.message}" Your commit messages should start with "[PRODUCT-XXXX]".`);
        result = false;
      } else {
        console.log(`"${commit.message}" is valid.`);
        jiraTicket = getJiraTicket(commit.message);
        try {
          const details: JIRADetails = await getTicketDetails(jiraTicket);
          console.log(`Ticket ${details.key} exist.`);
        } catch (error) {
          //If the ticket-id doesn´t exist, the Jira client raise an exception (404 request status)
          core.error(`Failed: The ticketid ${jiraTicket} doesn´t exist.`);
          result = false;
        }
      }
    }

    // Throw error in case of failed test
    if (!result) {
      core.setFailed('The commit message is not valid.');
      process.exit(1);
    }

    const issueKeys = getJIRAIssueKeys(jiraTicket);
    if (!issueKeys.length) {
      const comment: IssuesCreateCommentParams = {
        ...commonPayload,
        body: getNoIdComment(jiraTicket),
      };
      await addComment(client, comment);

      core.setFailed('JIRA issue id is missing in your branch.');
      process.exit(1);
    }

    // use the last match (end of the branch name)
    const issueKey = issueKeys[issueKeys.length - 1];
    console.log(`JIRA key -> ${issueKey}`);

    const details: JIRADetails = await getTicketDetails(issueKey);
    if (details.key) {
      const podLabel = details?.project?.name || '';
      const hotfixLabel: string = getHotfixLabel(baseBranch);
      const typeLabel: string = details?.type?.name || '';
      const labels: string[] = [podLabel, hotfixLabel, typeLabel].filter(isNotBlank);
      console.log('Three');
      console.log('Adding lables -> ', labels);

      await addLabels(client, {
        ...commonPayload,
        labels,
      });

      if (!isIssueStatusValid(VALIDATE_ISSUE_STATUS, ALLOWED_ISSUE_STATUSES.split(','), details)) {
        const invalidIssueStatusComment: IssuesCreateCommentParams = {
          ...commonPayload,
          body: getInvalidIssueStatusComment(details.status, ALLOWED_ISSUE_STATUSES),
        };
        console.log('Adding comment for invalid issue status');
        await addComment(client, invalidIssueStatusComment);

        core.setFailed('The found jira issue does is not in acceptable statuses');
        process.exit(1);
      }

      if (shouldUpdatePRDescription(prBody)) {
        const prData: PullsUpdateParams = {
          owner,
          repo,
          // eslint-disable-next-line @typescript-eslint/camelcase
          pull_number: prNumber,
          body: getPRDescription(prBody, details),
        };
        await updatePrDetails(client, prData);

        // add comment for PR title
        if (!SKIP_COMMENTS) {
          const prTitleComment: IssuesCreateCommentParams = {
            ...commonPayload,
            body: getPRTitleComment(details.summary, title),
          };
          console.log('Adding comment for the PR title');
          addComment(client, prTitleComment);

          // add a comment if the PR is huge
          if (isHumongousPR(additions, prThreshold)) {
            const hugePrComment: IssuesCreateCommentParams = {
              ...commonPayload,
              body: getHugePrComment(additions, prThreshold),
            };
            console.log('Adding comment for huge PR');
            addComment(client, hugePrComment);
          }
        }
      }
    } else {
      const comment: IssuesCreateCommentParams = {
        ...commonPayload,
        body: getNoIdComment(jiraTicket),
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

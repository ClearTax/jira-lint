import {GitHub} from "@actions/github/lib/utils";
import {Context} from "@actions/github/lib/context"
import {
    AddLabelParameters,
    CreateCommentParameters,
    JIRADetails,
    ListCommitsParameters,
    ListCommitsResponseData,
    ListCommitsResponseDataCommit,
    ValidateCommitMessagesResponse,
    ValidateCommitMessagesResponseItem
} from "./types";
import * as core from "@actions/core";

import {
    MARKER_REGEX,
    BOT_BRANCH_PATTERNS,
    DEFAULT_BRANCH_PATTERNS,
    JIRA_COMMIT_REGEX_MATCHER,
    HIDDEN_MARKER,
    LABELS
} from './constants';
import similarity from "string-similarity-js";

export const commonPayload = {
    owner: "",
    repo: "",
    issue_number: 0,
};

export const prPayload = {
    owner: "",
    repo: "",
    pull_number: 0,
};

function setCommonPayload(context: Context) {
    const repository = context.payload.repository
    if (typeof repository === 'undefined') {
        throw new Error(`Missing 'repository' from github action context.`);
    }

    const pullRequest = context.payload.pull_request
    if (typeof pullRequest === 'undefined') {
        throw new Error(`Missing 'pull request' from github action context.`);
    }

    commonPayload.repo = repository.name
    commonPayload.owner = repository.owner.login
    commonPayload.issue_number = pullRequest.number

    prPayload.repo = repository.name
    prPayload.owner = repository.owner.login
    prPayload.pull_number = pullRequest.number
}

function getBranches(context: Context): { headBranch: string, baseBranch: string } {
    const pullRequest = context.payload.pull_request
    if (typeof pullRequest === 'undefined') {
        throw new Error(`Missing 'pull request' from github action context.`);
    }
    const headBranch = pullRequest.head.ref
    const baseBranch = pullRequest.base.ref

    return {headBranch, baseBranch}
}

function getPrBody(context: Context) {
    const pullRequest = context.payload.pull_request
    if (typeof pullRequest === 'undefined') {
        throw new Error(`Missing 'pull request' from github action context.`);
    }

    return pullRequest.body
}

function getPrAdditions(context: Context): number {
    const pullRequest = context.payload.pull_request
    if (typeof pullRequest === 'undefined') {
        throw new Error(`Missing 'pull request' from github action context.`);
    }

    return pullRequest.additions ?? 0
}

function getPrTitle(context: Context): string {
    const pullRequest = context.payload.pull_request
    if (typeof pullRequest === 'undefined') {
        throw new Error(`Missing 'pull request' from github action context.`);
    }

    return pullRequest.title ?? ''
}

async function branchGuard(client: InstanceType<typeof GitHub>, headBranch: string, baseBranch: string) {
    const branchIgnorePattern = core.getInput('skip-branches', {required: false}) || '';
    if (shouldSkipBranchLint(headBranch, branchIgnorePattern)) {
        process.exit(0);
    }

    if (!headBranch && !baseBranch) {
        const comment = 'jira-lint is unable to determine the head and base branch';
        await addComment(client, comment)


        core.setFailed('Unable to get the head and base branch');
        process.exit(1);
    }

    console.log('Base branch -> ', baseBranch);
    console.log('Head branch -> ', headBranch);
}

const addComment = async (
    client: InstanceType<typeof GitHub>,
    body: string
): Promise<void> => {
    try {
        const comment: CreateCommentParameters = {
            ...commonPayload,
            body,
        };
        await client.rest.issues.createComment(comment);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        core.setFailed(`Unknown error: ${error}`);
        process.exit(1);
    }
};

async function docsOnlyGuard(client: InstanceType<typeof GitHub>, commits: ListCommitsResponseData) {
    console.log({commits});
    if (commits.every((c) => isDocCommit(c))) {
        await addComment(client, '🙌 Thanks for taking time to update docs!! 👏');
        console.log('Skipping jira-lint - all commits start with "docs:"');
        process.exit(0);
    }
}

/** Get commit messages from a PR. */
const getCommits = async (
    client: InstanceType<typeof GitHub>,
    payload: ListCommitsParameters
): Promise<ListCommitsResponseData> => {
    try {
        console.log('Fetching PR commits...');
        const commits = await client.rest.pulls.listCommits(payload);
        console.log('Fetched PR commits');
        return commits.data;
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        core.setFailed(`Unknown error: ${error}`);
        process.exit(1);
    }
};

const updatePrWithJiraDetails = async (
    client: InstanceType<typeof GitHub>,
    context: Context,
    details: JIRADetails
): Promise<void> => {
    try {
        const prBody = getPrBody(context)
        if (shouldUpdatePRDescription(prBody)) {
            const payload = {
                ...prPayload,
                body: getPRDescription(details, prBody),
            };
            await client.rest.pulls.update(payload);
        }
    } catch (error: unknown) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        core.setFailed(`Unknown error: ${error}`);
        process.exit(1);
    }
};

const getPRDescription = (details: JIRADetails, body = ''): string => {
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

${
        body
            ? `
---

${body}
`
            : ''
    }`;
};


async function jiraKeyBranchGuard(client: InstanceType<typeof GitHub>, issueKey: string, headBranch: string) {
    if (!issueKey.length) {
        const comment = getNoIdComment(headBranch)
        await addComment(client, comment);

        core.setFailed('JIRA issue id is missing in your branch.');
        process.exit(1);
    }

    console.log(`JIRA key -> ${issueKey}`);
    return issueKey
}

async function invalidJiraKeyGuard(client: InstanceType<typeof GitHub>, details: JIRADetails, headBranch: string) {
    if (!details.key) {
        const comment = getNoIdComment(headBranch)
        await addComment(client, comment);

        core.setFailed('Invalid JIRA key. Please create a branch with a valid JIRA issue key.');
        process.exit(1);
    }
}

async function addGithubLabels(client: InstanceType<typeof GitHub>, details: JIRADetails, baseBranch: string) {
    const podLabel = details?.project?.name || '';
    const hotfixLabel: string = getHotfixLabel(baseBranch);
    const typeLabel: string = details?.type?.name || '';
    const labels: string[] = [podLabel, hotfixLabel, typeLabel].filter(isNotBlank);
    console.log('Adding labels -> ', labels);

    await addLabels(client, {
        ...commonPayload,
        labels,
    });
}

const addLabels = async (client: InstanceType<typeof GitHub>, labelData: AddLabelParameters): Promise<void> => {
    try {
        await client.rest.issues.addLabels(labelData);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        core.setFailed(`Unknown error: ${error}`);
        process.exit(1);
    }
};

async function issueStatusGuard(client: InstanceType<typeof GitHub>, details: JIRADetails) {
    const validateIssueStatus = core.getInput('validate_issue_status', {required: false}) === 'true';
    const allowedIssueStatuses = core.getInput('allowed_issue_statuses');
    if (!isIssueStatusValid(validateIssueStatus, allowedIssueStatuses.split(','), details)) {
        const invalidIssueStatusComment = getInvalidIssueStatusComment(details.status, allowedIssueStatuses)
        console.log('Adding comment for invalid issue status');
        await addComment(client, invalidIssueStatusComment);

        core.setFailed('The found jira issue does is not in acceptable statuses');
        process.exit(1);
    }
}

async function addSkippableComments(client: InstanceType<typeof GitHub>, context: Context, details: JIRADetails) {
    const skipComments = core.getInput('skip-comments', {required: false}) === 'true';
    if (!skipComments) {
        await addPrTitleComment(client, context, details)
        await addLargePrComment(client, context)
    }
}

async function addPrTitleComment(client: InstanceType<typeof GitHub>, context: Context, details: JIRADetails) {
    const title = getPrTitle(context)
    const comment = getPRTitleComment(details.summary, title)

    console.log('Adding comment for the PR title');
    await addComment(client, comment);
}

function getInputThreshold() {
    const defaultAdditionsCount = 800;
    const inputPrThreshold = parseInt(core.getInput('pr-threshold', {required: false}), 10);
    return isNaN(inputPrThreshold) ? defaultAdditionsCount : inputPrThreshold
}

async function addLargePrComment(client: InstanceType<typeof GitHub>, context: Context) {
    const prThreshold = getInputThreshold()
    const additions = getPrAdditions(context)
    if (isHumongousPR(additions, prThreshold)) {
        const hugePrComment = getHugePrComment(additions, prThreshold)
        console.log('Adding comment for huge PR');
        await addComment(client, hugePrComment);
    }
}

const validatePrCommits = async (client: InstanceType<typeof GitHub>, issueKey: string, commits: ListCommitsResponseData): Promise<void> => {
    // 1. Validate commit messages against Jira issue key
    const prCommitsValidationResults = validateCommitMessages(commits, issueKey);

    // 2. If there are invalid commit messages, post a comment to the PR and exit/fail
    if (!prCommitsValidationResults.valid) {
        const containsOtherJiraKeys = prCommitsValidationResults.results.some((r) => !r.valid && r.hasJiraKey);
        console.log(`Contains other jira keys in commits? "${containsOtherJiraKeys}"`);

        if (containsOtherJiraKeys) {
            const commitsWithDifferentJiraKeyComment = getDifferentIdCommitMessagesComment(prCommitsValidationResults)
            console.log('Adding comment for commits without Jira Issue Key');
            await addComment(client, commitsWithDifferentJiraKeyComment);
        }

        const commitsWithoutJiraKeys = prCommitsValidationResults.results.filter((commit) => !commit.hasJiraKey);
        if (commitsWithoutJiraKeys.length) {
            const commitsWithoutJiraKeyComment = getNoIdCommitMessagesComment(prCommitsValidationResults)
            console.log('Adding comment for commits without Jira Issue Key');
            await addComment(client, commitsWithoutJiraKeyComment);
        }

        core.setFailed(`One or more commits did not prepend the Jira Issue Key - ${issueKey}`);
        process.exit(1);
    }
};

const validateCommitMessages = (
    commits: ListCommitsResponseData,
    issueKey: string
): ValidateCommitMessagesResponse => {

    const results = commits.map((commit) => validateCommitMessage(commit, issueKey));

    return {
        valid: results.every((commitResult) => commitResult.valid),
        results,
    };
};

function validateCommitMessage(commit: ListCommitsResponseDataCommit, issueKey: string) {
    const isMergeCommit = (message: string): boolean => /^Merge (branch|pull request)/i.test(message);
    const isRevertCommit = (message: string): boolean => /^Revert "/i.test(message);

    const {message} = commit.commit;
    const hasCorrectJiraKey = message.match(new RegExp(`\njira: ${issueKey}`)) !== null;
    const hasAnyJiraKey = message.match(JIRA_COMMIT_REGEX_MATCHER) !== null;

    const validatedCommitMessage: ValidateCommitMessagesResponseItem = {
        ...commit,
        hasJiraKey: hasAnyJiraKey,
        valid: isDocCommit(commit) || hasCorrectJiraKey || isMergeCommit(message) || isRevertCommit(message),
    };

    return validatedCommitMessage;
}

const validatePullRequestTitle = async (client: InstanceType<typeof GitHub>, context: Context, issueKey: string): Promise<void> => {
    const title = getPrTitle(context)
    console.log(`Validating PR Title "${title}" with Jira Issue Key "${issueKey}"`);
    if (!validatePrTitle(title, issueKey)) {
        const invalidPrTitleComment = getNoIdPrTitleComment(title)
        console.log('Adding comment for PR Title without Jira Issue Key');
        await addComment(client, invalidPrTitleComment);
        core.setFailed('PR title did not prepend the Jira Issue Key');
        process.exit(1);
    }
};

const isDocCommit = (commit: ListCommitsResponseData[0]): boolean => {
    return commit.commit.message.startsWith('docs:');
};

/**
 * Returns true if the body contains the hidden marker. Used to avoid adding
 * story details to the PR multiple times.
 *
 * @example shouldUpdatePRDescription('--\nadded_by_pr_lint\n') -> true
 * @example shouldUpdatePRDescription('# some description') -> false
 */
const shouldUpdatePRDescription = (
    /** The PR description/body as a string. */
    body?: string
): boolean => (body ? !MARKER_REGEX.test(body) : true);

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
        .filter(({valid, hasJiraKey}) => !valid && hasJiraKey)
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
        .filter(({valid}) => !valid)
        .filter(({hasJiraKey}) => !hasJiraKey)
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

/** Check if a PR is considered "huge". */
const isHumongousPR = (additions: number, threshold: number): boolean =>
    additions > threshold;

/**
 * Get links to labels & remove spacing so the table works.
 */
const getLabelsForDisplay = (labels: JIRADetails['labels']): string => {
    if (!labels || !labels.length) {
        return '-';
    }
    const markUp = labels.map((label) => `<a href="${label.url}" title="${label.name}">${label.name}</a>`).join(', ');
    return markUp.replace(/\s+/, ' ');
};

/** Get a comment based on story title and PR title similarity. */
const getPRTitleComment = (storyTitle: string, prTitle: string): string => {
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

const isBlank = (input: string): boolean => input.trim().length === 0;
const isNotBlank = (input: string): boolean => !isBlank(input);

/** Return a hotfix label based on base branch type. */
const getHotfixLabel = (baseBranch: string): string => {
    if (baseBranch.startsWith('release/v')) return LABELS.HOTFIX_PRE_PROD;
    if (baseBranch.startsWith('production')) return LABELS.HOTFIX_PROD;
    return '';
};

export {
    branchGuard,
    getBranches,
    addComment,
    docsOnlyGuard,
    jiraKeyBranchGuard,
    invalidJiraKeyGuard,
    addGithubLabels,
    issueStatusGuard,
    setCommonPayload,
    addSkippableComments,
    getCommits,
    validatePrCommits,
    validatePullRequestTitle,
    getPRDescription,
    getHotfixLabel,
    LABELS,
    isBlank,
    isNotBlank,
    getPRTitleComment,
    updatePrWithJiraDetails,
    isHumongousPR,
    getLabelsForDisplay,
    shouldUpdatePRDescription,
    validateCommitMessages
}
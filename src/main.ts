import * as github from '@actions/github';

import {
    addGithubLabels,
    addSkippableComments,
    branchGuard,
    docsOnlyGuard,
    getBranches,
    getCommits,
    invalidJiraKeyGuard,
    issueStatusGuard,
    jiraKeyBranchGuard,
    prPayload,
    setCommonPayload,
    updatePrWithJiraDetails,
    validatePrCommits,
    validatePullRequestTitle
} from "./github";
import {getJIRAClient, getJIRAIssueKey} from "./jira";
import {Context} from "@actions/github/lib/context";

export async function main(context: Context, githubToken: string, jiraToken: string) {
    setCommonPayload(context)

    // initialize clients
    const githubClient = github.getOctokit(githubToken);
    const jiraClient = getJIRAClient(jiraToken);

    // validate branches
    const {baseBranch, headBranch} = getBranches(context)
    await branchGuard(githubClient, headBranch, baseBranch);

    // check docs only commits
    const commits = await getCommits(githubClient, prPayload);
    await docsOnlyGuard(githubClient, commits)

    // branch with valid jira key
    const issueKey = getJIRAIssueKey(headBranch);
    await jiraKeyBranchGuard(githubClient, issueKey, headBranch)
    const details = await jiraClient.getTicketDetails(issueKey);
    await invalidJiraKeyGuard(githubClient, details, headBranch)

    // update
    await addGithubLabels(githubClient, details, baseBranch)
    await issueStatusGuard(githubClient, details)
    await updatePrWithJiraDetails(githubClient, context, details)
    await addSkippableComments(githubClient, context, details)
    await validatePrCommits(githubClient, issueKey, commits);
    await validatePullRequestTitle(githubClient, context, issueKey);
}

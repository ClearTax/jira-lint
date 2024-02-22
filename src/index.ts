import * as core from '@actions/core';
import * as github from '@actions/github';
import {main} from "./main";

async function run(): Promise<void> {
    try {
        // inputs
        const JIRA_TOKEN = core.getInput('jira-token', {required: true});
        const GITHUB_TOKEN = core.getInput('github-token', {required: true});

        // main
        await main(github.context, GITHUB_TOKEN, JIRA_TOKEN)
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        core.setFailed(`Unknown error: ${error}`);
        process.exit(1);
    }
}

run()
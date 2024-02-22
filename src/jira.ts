import {JIRA_BASE_URL, JIRA_BRANCH_REGEX_MATCHER} from "./constants";
import {JIRA, JIRAClient, JIRADetails} from "./types";
import axios from "axios";

export const getJIRAIssueKey = (input: string): string => {
    const matches = input.match(JIRA_BRANCH_REGEX_MATCHER);
    const trimTrailingDash = (value: string): string => value.substring(0, value.length - 1);

    return matches?.length ? trimTrailingDash(matches[0]) : '';
};

export const getJIRAClient = (token: string): JIRAClient => {
    const client = axios.create({
        baseURL: `${JIRA_BASE_URL}/rest/api/3`,
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
                url: `${JIRA_BASE_URL}/issues?jql=${encodeURIComponent(
                    `project = ${project.key} AND labels = ${label} ORDER BY created DESC`
                )}`,
            }));

            return {
                key,
                summary,
                url: `${JIRA_BASE_URL}/browse/${key}`,
                status: issueStatus.name,
                type: {
                    name: type.name,
                    icon: type.iconUrl,
                },
                project: {
                    name: project.name,
                    url: `${JIRA_BASE_URL}/browse/${project.key}`,
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
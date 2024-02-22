import { AxiosInstance } from 'axios';
import { Endpoints, RequestParameters } from '@octokit/types';

export interface PullRequestParams {
  number: number;
  html_url?: string;
  body?: string;
  base: {
    ref: string;
  };
  head: {
    ref: string;
  };
  changed_files?: number;
  additions?: number;
  title?: string;
  [key: string]: unknown;
}

export namespace JIRA {
  export interface IssueStatus {
    self: string;
    description: string;
    iconUrl: string;
    name: string;
    id: string;
    statusCategory: {
      self: string;
      id: number;
      key: string;
      colorName: string;
      name: string;
    };
  }

  export interface IssuePriority {
    self: string;
    iconUrl: string;
    name: string;
    id: string;
  }

  export interface IssueType {
    self: string;
    id: string;
    description: string;
    iconUrl: string;
    name: string;
    subtask: boolean;
    avatarId: number;
  }

  export interface IssueProject {
    self: string;
    key: string;
    name: string;
  }

  export interface Issue {
    id: string;
    key: string;
    self: string;
    status: string;
    fields: {
      summary: string;
      status: IssueStatus;
      priority: IssuePriority;
      issuetype: IssueType;
      project: IssueProject;
      labels: string[];
      [k: string]: unknown;
    };
  }
}

export interface JIRADetails {
  key: string;
  summary: string;
  url: string;
  status: string;
  type: {
    name: string;
    icon: string;
  };
  project: {
    name: string;
    url: string;
    key: string;
  };
  estimate: string | number;
  labels: readonly { name: string; url: string }[];
}

export interface JIRALintActionInputs {
  JIRA_TOKEN: string;
  JIRA_BASE_URL: string;
  GITHUB_TOKEN: string;
  SKIP_COMMENTS: boolean;
  PR_THRESHOLD: number;
  VALIDATE_ISSUE_STATUS: boolean;
  ALLOWED_ISSUE_STATUSES: string;
}

export interface JIRAClient {
  client: AxiosInstance;
  /** Get complete JIRA Issue details. */
  getIssue: (key: string) => Promise<JIRA.Issue>;
  /** Get required details to display in PR. */
  getTicketDetails: (key: string) => Promise<JIRADetails>;
}

export type ListCommitsResponseData =
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/commits']['response']['data'];
export type ListCommitsResponseDataCommit =
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/commits']['response']['data'][0];
export interface ValidateCommitMessagesResponseItem extends ListCommitsResponseDataCommit {
  hasJiraKey: boolean;
  valid: boolean;
}

export interface ValidateCommitMessagesResponse {
  valid: boolean;
  results: ValidateCommitMessagesResponseItem[];
}

export type AddLabelParameters = RequestParameters &
  Endpoints['POST /repos/{owner}/{repo}/issues/{issue_number}/labels']['parameters'];
export type UpdatePullRequestParameters = RequestParameters &
  Endpoints['PATCH /repos/{owner}/{repo}/pulls/{pull_number}']['parameters'];
export type CreateCommentParameters = RequestParameters &
  Endpoints['POST /repos/{owner}/{repo}/issues/{issue_number}/comments']['parameters'];
export type ListCommitsParameters = RequestParameters &
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/commits']['parameters'];

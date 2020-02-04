export interface PullRequestParams {
  [key: string]: any;
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
  addtions?: number;
  title?: string;
}

export enum StoryType {
  Feature = 'feature',
  Bug = 'bug',
  Chore = 'chore',
  Release = 'release',
}

export interface Label {
  name: string;
}

export const enum StoryState {
  Accepted = 'accepted',
  Delivered = 'delivered',
  Finished = 'finished',
  Planned = 'planned',
  Rejected = 'rejected',
  Started = 'started',
  Unscheduled = 'unscheduled',
  Unstarted = 'unstarted',
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
    fields: {
      summary: string;
      status: IssueStatus;
      priority: IssuePriority;
      issuetype: IssueType;
      project: IssueProject;
      labels: string[];
      [k: string]: any;
    };
  }
}

export interface JIRADetails {
  key: string;
  summary: string;
  url: string;
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
  labels: ReadonlyArray<{ name: string; url: string }>;
}

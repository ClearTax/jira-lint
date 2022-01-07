import {
  getHotfixLabel,
  getHugePrComment,
  getJIRAIssueKey,
  getLabelsForDisplay,
  getNoIdComment,
  getPRDescription,
  isHumongousPR,
  LABELS,
  shouldSkipBranchLint,
  shouldUpdatePRDescription,
  getJIRAClient,
  getInvalidIssueStatusComment,
  isIssueStatusValid,
  validateCommitMessages,
} from '../src/utils';
import { PullsListCommitsResponse } from '@octokit/rest';
import { HIDDEN_MARKER } from '../src/constants';
import { JIRADetails } from '../src/types';

jest.spyOn(console, 'log').mockImplementation(); // avoid actual console.log in test output

describe('shouldSkipBranchLint()', () => {
  it('should recognize bot PRs', () => {
    expect(shouldSkipBranchLint('dependabot')).toBe(true);
    expect(shouldSkipBranchLint('dependabot/npm_and_yarn/types/react-dom-16.9.6')).toBe(true);
    expect(shouldSkipBranchLint('feature/add-dependabot-config')).toBe(false);
    expect(shouldSkipBranchLint('feature/add-dependabot-config-OSS-101')).toBe(false);

    expect(shouldSkipBranchLint('all-contributors')).toBe(true);
    expect(shouldSkipBranchLint('all-contributors/add-ghost')).toBe(true);
    expect(shouldSkipBranchLint('chore/add-all-contributors')).toBe(false);
    expect(shouldSkipBranchLint('chore/add-all-contributors-OSS-102')).toBe(false);
  });

  it('should handle custom ignore patterns', () => {
    expect(shouldSkipBranchLint('bar', '^bar')).toBeTruthy();
    expect(shouldSkipBranchLint('foobar', '^bar')).toBeFalsy();

    expect(shouldSkipBranchLint('bar', '[0-9]{2}')).toBeFalsy();
    expect(shouldSkipBranchLint('bar', '')).toBeFalsy();
    expect(shouldSkipBranchLint('foo', '[0-9]{2}')).toBeFalsy();
    expect(shouldSkipBranchLint('f00', '[0-9]{2}')).toBeTruthy();

    const customBranchRegex = '^(production-release|master|release/v\\d+)$';
    expect(shouldSkipBranchLint('production-release', customBranchRegex)).toBeTruthy();
    expect(shouldSkipBranchLint('master', customBranchRegex)).toBeTruthy();
    expect(shouldSkipBranchLint('release/v77', customBranchRegex)).toBeTruthy();

    expect(shouldSkipBranchLint('release/very-important-feature', customBranchRegex)).toBeFalsy();
    expect(shouldSkipBranchLint('masterful', customBranchRegex)).toBeFalsy();
    expect(shouldSkipBranchLint('productionish', customBranchRegex)).toBeFalsy();
    expect(shouldSkipBranchLint('fix/production-issue', customBranchRegex)).toBeFalsy();
    expect(shouldSkipBranchLint('chore/rebase-with-master', customBranchRegex)).toBeFalsy();
    expect(shouldSkipBranchLint('chore/rebase-with-release', customBranchRegex)).toBeFalsy();
    expect(shouldSkipBranchLint('chore/rebase-with-release/v77', customBranchRegex)).toBeFalsy();
  });

  it('should return false with empty input', () => {
    expect(shouldSkipBranchLint('')).toBeFalsy();
  });

  it('should return false for other branches', () => {
    expect(shouldSkipBranchLint('feature/awesomeNewFeature')).toBeFalsy();
  });
});

describe('getHotFixLabel()', () => {
  it('should return empty string for master branch', () => {
    expect(getHotfixLabel('master')).toEqual('');
  });

  it('should return HOTFIX-PROD for production branch', () => {
    expect(getHotfixLabel('production-release')).toEqual(LABELS.HOTFIX_PROD);
  });

  it('should return HOTFIX-PRE-PROD for release branch', () => {
    expect(getHotfixLabel('release/v')).toEqual(LABELS.HOTFIX_PRE_PROD);
  });

  it('should return empty string with no input', () => {
    expect(getHotfixLabel('')).toEqual('');
  });
});

describe('getJIRAIssueKey()', () => {
  it('gets the keys from a string', () => {
    expect(
      getJIRAIssueKey(
        'BF-18-my-feature-abc-123-X-88-ABCDEFGHIJKL-999-abc-XY-Z-333-abcDEF-33-ABCDEF-33_abcdef-33_ABC-1_PB2-1_pb2-1_P2P-1_p2p-1'
      )
    ).toEqual('BF-18');
    expect(getJIRAIssueKey('ASAP2-123-my-feature')).toEqual('ASAP2-123');
  });

  it('gets empty string as jira key from malformed branch names', () => {
    expect(getJIRAIssueKey('eng-115-my-feature')).toEqual('');
    expect(getJIRAIssueKey('EN1G-115-my-feature')).toEqual(''); // NOTE: fails due to number in first piece
    expect(getJIRAIssueKey('fix/login-protocol-es-43')).toEqual('');
    expect(getJIRAIssueKey('fix/login-protocol-ES-43')).toEqual('');
    expect(getJIRAIssueKey('feature/newFeature_esch-100')).toEqual('');
    expect(getJIRAIssueKey('feature/newFeature_ESCH-101')).toEqual('');
    expect(getJIRAIssueKey('feature/newFeature--mojo-5611')).toEqual('');
    expect(getJIRAIssueKey('feature/newFeature--MOJO-6789')).toEqual('');

    expect(getJIRAIssueKey('chore/task-with-dashes--MOJO-6789')).toEqual('');
    expect(getJIRAIssueKey('chore/task_with_underscores--MOJO-6789')).toEqual('');
    expect(getJIRAIssueKey('chore/MOJO-6789-task_with_underscores')).toEqual('');
    expect(getJIRAIssueKey('MOJO-6789/task_with_underscores')).toEqual('');

    expect(getJIRAIssueKey('MOJO-6789/task_with_underscores-ES-43')).toEqual('');
    expect(getJIRAIssueKey('nudge-live-chat-users-Es-172')).toEqual('');

    expect(getJIRAIssueKey('feature/missingKey')).toEqual('');
    expect(getJIRAIssueKey('')).toEqual('');
  });
});

describe('validateCommitMessages', () => {
  it('should validate that commit messages have the Jira Issue Key prepended', () => {
    const createFakeCommit = (message: string): unknown => ({ sha: 'abc123', commit: { message } });
    const commits = [
      createFakeCommit('ENG-117 great commit message'),
      createFakeCommit("Merge branch 'release/v1.8.0' into cdec-1270-uprev"),
      createFakeCommit('bad commit message'),
      createFakeCommit('Merge pull request #827 from invitation-homes/ENG-117-awesome-branch'),
      createFakeCommit('eng-117 bad commit message'),
      createFakeCommit('ENG-117 - okay commit message'),
      createFakeCommit('ENG-117bad commit message no space after issue ky'),
    ] as PullsListCommitsResponse;
    const jiraKey = 'ENG-117';

    const result = validateCommitMessages(commits, jiraKey);

    expect(result).toEqual({
      valid: false,
      results: expect.any(Array),
    });
    expect(result.results[0].valid).toEqual(true);
    expect(result.results[1].valid).toEqual(true);
    expect(result.results[2].valid).toEqual(false);
    expect(result.results[3].valid).toEqual(true);
    expect(result.results[4].valid).toEqual(false);
    expect(result.results[5].valid).toEqual(true);
    expect(result.results[6].valid).toEqual(false);
  });
});

describe('shouldUpdatePRDescription()', () => {
  it('should return false when the hidden marker is present', () => {
    expect(shouldUpdatePRDescription(HIDDEN_MARKER)).toBeFalsy();
    expect(
      shouldUpdatePRDescription(`
<details open>
  <summary> <strong>ESCH-10</strong></summary>
  <br />
  <table>
    <tr>
      <td>Type</td>
      <td>feature</td>
    </tr>
    <tr>
      <td>Points</td>
      <td>2</td>
    </tr>
    <tr>
      <td>Labels</td>
      <td>fe tech goodness, gst 2.0</td>
    </tr>
  </table>
</details>
<!--
  do not remove this marker as it will break jira-lint's functionality.
  ${HIDDEN_MARKER}
-->

some actual content'
    `)
    ).toBeFalsy();
  });

  it('should return true when the hidden marker is NOT present', () => {
    expect(shouldUpdatePRDescription('')).toBeTruthy();
    expect(shouldUpdatePRDescription('added_by')).toBeTruthy();
    expect(shouldUpdatePRDescription('added_by_something_else')).toBeTruthy();
    expect(
      shouldUpdatePRDescription(`
## Checklist

- [ ] PR is up-to-date with a description of changes and screenshots (if applicable).
- [ ] All files are lint-free.
- [ ] Added tests for the core-changes (as applicable).
- [ ] Tested locally for regressions & all test cases are passing.
`)
    ).toBeTruthy();
  });
});

describe('getPRDescription()', () => {
  it('should include the hidden marker when getting PR description', () => {
    const issue: JIRADetails = {
      key: 'ABC-123',
      url: 'url',
      type: { name: 'feature', icon: 'feature-icon-url' },
      estimate: 1,
      labels: [{ name: 'frontend', url: 'frontend-url' }],
      summary: 'Story title or summary',
      project: { name: 'project', url: 'project-url', key: 'abc' },
      status: 'In Progress',
    };
    const description = getPRDescription('some_body', issue);

    expect(shouldUpdatePRDescription(description)).toBeFalsy();
    expect(description).toContain(issue.key);
    expect(description).toContain(issue.estimate);
    expect(description).toContain(issue.status);
    expect(description).toContain(issue.labels[0].name);
  });
});

describe('isHumongousPR()', () => {
  it('should return true if additions are greater than the threshold', () => {
    expect(isHumongousPR(2000, 500)).toBeTruthy();
  });

  it('should return false if additions are less than the threshold', () => {
    expect(isHumongousPR(200, 500)).toBeFalsy();
  });

  it('should return false with erroneous inputs', () => {
    expect(isHumongousPR(NaN, NaN)).toBeFalsy();
  });
});

describe('getNoIdComment()', () => {
  it('should return the comment content with the branch name', () => {
    expect(getNoIdComment('test_new_feature')).toContain('test_new_feature');
  });
});

describe('getHugePrComment()', () => {
  it('should return the comment content with additions and threshold', () => {
    expect(getHugePrComment(1000, 800)).toContain(1000);
    expect(getHugePrComment(1000, 800)).toContain(800);
  });
});

describe('getLabelsForDisplay()', () => {
  it('generates label markup without spaces', () => {
    expect(
      getLabelsForDisplay([
        { name: 'one', url: 'url-one' },
        { name: 'two', url: 'url-two' },
      ])
    ).toBe(`<a href="url-one" title="one">one</a>, <a href="url-two" title="two">two</a>`);
  });
});

describe('JIRA Client', () => {
  // use this to test if the token is correct
  it.skip('should be able to access the issue', async () => {
    const client = getJIRAClient('https://cleartaxtech.atlassian.net/', '<token_here>');
    const details = await client.getTicketDetails('ES-10');
    console.log({ details });
    expect(details).not.toBeNull();
  });
});

describe('isIssueStatusValid()', () => {
  const issue: JIRADetails = {
    key: 'ABC-123',
    url: 'url',
    type: { name: 'feature', icon: 'feature-icon-url' },
    estimate: 1,
    labels: [{ name: 'frontend', url: 'frontend-url' }],
    summary: 'Story title or summary',
    project: { name: 'project', url: 'project-url', key: 'abc' },
    status: 'Assessment',
  };

  it('should return false if issue validation was enabled but invalid issue status', () => {
    const expectedStatuses = ['In Test', 'In Progress'];
    expect(isIssueStatusValid(true, expectedStatuses, issue)).toBeFalsy();
  });

  it('should return true if issue validation was enabled but issue has a valid status', () => {
    const expectedStatuses = ['In Test', 'In Progress'];
    issue.status = 'In Progress';
    expect(isIssueStatusValid(true, expectedStatuses, issue)).toBeTruthy();
  });

  it('should return true if issue status validation is not enabled', () => {
    const expectedStatuses = ['In Test', 'In Progress'];
    expect(isIssueStatusValid(false, expectedStatuses, issue)).toBeTruthy();
  });
});

describe('getInvalidIssueStatusComment()', () => {
  it('should return content with the passed in issue status and allowed statses', () => {
    expect(getInvalidIssueStatusComment('Assessment', 'In Progress')).toContain('Assessment');
    expect(getInvalidIssueStatusComment('Assessment', 'In Progress')).toContain('In Progress');
  });
});

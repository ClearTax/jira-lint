import {
  getHotfixLabel,
  getHugePrComment,
  getJIRAIssueKeys,
  getLabelsForDisplay,
  getNoIdComment,
  getPRDescription,
  isHumongousPR,
  LABELS,
  shouldAddComments,
  shouldSkipBranchLint,
  shouldUpdatePRDescription,
  getJIRAClient,
  getPRTitleComment,
} from '../src/utils';
import { HIDDEN_MARKER } from '../src/constants';
import { JIRADetails } from '../src/types';

jest.spyOn(console, 'log').mockImplementation(); // avoid actual console.log in test output

describe('shouldSkipBranchLint()', () => {
  it('should recognize bot PRs', () => {
    expect(shouldSkipBranchLint('dependabot')).toBeTruthy();
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

describe('getJIRAIssueKeys()', () => {
  it('gets multiple keys from a string', () => {
    expect(
      getJIRAIssueKeys('BF-18 abc-123 X-88 ABCDEFGHIJKL-999 abc XY-Z-333 abcDEF-33 ABCDEF-33 abcdef-33 ABC-1')
    ).toEqual(['BF-18', 'ABC-123', 'X-88', 'CDEFGHIJKL-999', 'Z-333', 'ABCDEF-33', 'ABCDEF-33', 'ABCDEF-33', 'ABC-1']);
  });

  it('gets jira key from different branch names', () => {
    expect(getJIRAIssueKeys('fix/login-protocol-es-43')).toEqual(['ES-43']);
    expect(getJIRAIssueKeys('fix/login-protocol-ES-43')).toEqual(['ES-43']);
    expect(getJIRAIssueKeys('feature/newFeature_esch-100')).toEqual(['ESCH-100']);
    expect(getJIRAIssueKeys('feature/newFeature_ESCH-101')).toEqual(['ESCH-101']);
    expect(getJIRAIssueKeys('feature/newFeature--mojo-5611')).toEqual(['MOJO-5611']);
    expect(getJIRAIssueKeys('feature/newFeature--MOJO-6789')).toEqual(['MOJO-6789']);

    expect(getJIRAIssueKeys('chore/task-with-dashes--MOJO-6789')).toEqual(['MOJO-6789']);
    expect(getJIRAIssueKeys('chore/task_with_underscores--MOJO-6789')).toEqual(['MOJO-6789']);
    expect(getJIRAIssueKeys('chore/MOJO-6789-task_with_underscores')).toEqual(['MOJO-6789']);
    expect(getJIRAIssueKeys('MOJO-6789/task_with_underscores')).toEqual(['MOJO-6789']);

    expect(getJIRAIssueKeys('MOJO-6789/task_with_underscores-ES-43')).toEqual(['MOJO-6789', 'ES-43']);
    expect(getJIRAIssueKeys('nudge-live-chat-users-Es-172')).toEqual(['ES-172']);

    expect(getJIRAIssueKeys('feature/missingKey')).toEqual([]);
    expect(getJIRAIssueKeys('')).toEqual([]);
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
    };
    const description = getPRDescription('some_body', issue as any);

    expect(shouldUpdatePRDescription(description)).toBeFalsy();
    expect(description).toContain(issue.key);
    expect(description).toContain(issue.estimate);
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

describe('shouldAddComments()', () => {
  it('should return true if SKIP_COMMENTS is not set', () => {
    expect(shouldAddComments('')).toBeTruthy();
  });

  it('should return true if SKIP_COMMENTS is set to false', () => {
    expect(shouldAddComments('false')).toBeTruthy();
  });
  it('should return false if SKIP_COMMENTS is set to true', () => {
    expect(shouldAddComments('true')).toBeFalsy();
  });
});

describe('getNoIdComment()', () => {
  it('should return the comment content with the branch name', () => {
    expect(getNoIdComment('test_new_feature')).toContain('test_new_feature');
  });
});

describe('getHugePrComment()', () => {
  it('should return the comment content with additions and threshold', () => {
    expect(getHugePrComment(1000, 800, 'true')).toContain(1000);
    expect(getHugePrComment(1000, 800, 'true')).toContain(800);
  });
  it('should return no gifs if they are skipped', () => {
    expect(getHugePrComment(1000, 800, 'true')).not.toContain('giphy.com');
    expect(getHugePrComment(1000, 800, 'false')).toContain('giphy.com');
  });
});

describe('getPRTitleComment()', () => {
  it('should return no gifs if they are skipped', () => {
    expect(getPRTitleComment('title', 'title', 'true')).not.toContain('giphy.com');
    expect(getPRTitleComment('title', 'title', 'false')).toContain('giphy.com');
  });
});


describe('getLabelsForDisplay()', () => {
  it('generates label markup without spaces', () => {
    expect(getLabelsForDisplay([
      { name: 'one', url: 'url-one' },
      { name: 'two', url: 'url-two' },
    ])).toBe(`<a href=\"url-one\" title=\"one\">one</a>, <a href=\"url-two\" title=\"two\">two</a>`);
  })
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

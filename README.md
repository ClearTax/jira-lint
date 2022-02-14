# jira-lint 🧹

> A light-weight lint workflow when using GitHub along with [JIRA][jira] for project management.
> Ported from [pivotal-lint](https://github.com/ClearTax/pivotal-lint/) for similar usage with Atlassian's Jira Software.

![GitHub package.json version](https://img.shields.io/github/package-json/v/cleartax/jira-lint?style=flat-square)
[![GitHub](https://img.shields.io/github/license/cleartax/jira-lint?style=flat-square)](https://github.com/cleartax/jira-lint/blob/master/LICENSE.md)
[![All Contributors](https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square)](#contributors)
![build & test](https://github.com/ClearTax/jira-lint/workflows/lint,%20build%20&%20test/badge.svg)

---

<!-- toc -->

- [Installation](#installation)
  - [Semantic Versions](#semantic-versions)
- [Features](#features)
  - [PR Status Checks](#pr-status-checks)
  - [PR Description & Labels](#pr-description--labels)
    - [Description](#description)
    - [Labels](#labels)
    - [Soft-validations via comments](#soft-validations-via-comments)
  - [Options](#options)
  - [`jira-token`](#jira-token)
  - [Skipping branches](#skipping-branches)
- [Contributing](#contributing)
- [FAQ](#faq)
- [Contributors](#contributors)

<!-- tocstop -->

## Installation

To make `jira-lint` a part of your workflow, just add a `jira-lint.yml` file in your `.github/workflows/` directory in your GitHub repository.

```yml
name: jira-lint
on: [pull_request]

jobs:
  jira-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: cleartax/jira-lint@master
        name: jira-lint
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          jira-token: ${{ secrets.JIRA_TOKEN }}
          jira-base-url: https://your-domain.atlassian.net
          skip-branches: '^(production-release|master|release\/v\d+)$'
          skip-comments: true
          pr-threshold: 1000
```

It can also be used as part of an existing workflow by adding it as a step. More information about the [options here](#options).

### Semantic Versions

If you want more stability in versions of `jira-lint` than `@master` you can also use the [semantic releases for jira-lint](https://github.com/cleartax/jira-lint/releases).

Example:

```yaml
# ...
steps:
  - uses: cleartax/jira-lint@v0.1.0
    name: jira-lint
    # ...
```

## Features

### PR Status Checks

`jira-lint` adds a status check which helps you avoid merging PRs which are missing a valid Jira Issue Key in the branch name. It will use the [Jira API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) to validate a given key.

### PR Description & Labels

#### Description

When a PR passes the above check, `jira-lint` will also add the issue details to the top of the PR description. It will pick details such as the Issue summary, type, estimation points, status and labels and add them to the PR description.

#### Labels

`jira-lint` will automatically label PRs with:

- A label based on the Jira Project name (the project the issue belongs to). For example, if your project name is `Escher` then it will add `escher` as a label.
- `HOTFIX-PROD` - if the PR is raised against `production-release`.
- `HOTFIX-PRE-PROD` - if the PR is raised against `release/v*`.
- Jira issue type ([based on your project](https://confluence.atlassian.com/adminjiracloud/issue-types-844500742.html)).

<figure>
 <img src="https://assets1.cleartax-cdn.com/cleargst-frontend/misc/1580891341_jira_lint.png" alt="Issue details and labels added to a PR" />
 <figcaption>
 Issue details and labels added to a PR.
 </figcaption>
</figure>

#### Issue Status Validation
Issue status is shown in the [Description](#description).
**Why validate issue status?** 
In some cases, one may be pushing changes for a story that is set to `Done`/`Completed` or it may not have been pulled into working backlog or current sprint.

 This option allows discouraging pushing to branches for stories that are set to statuses other than the ones allowed in the project; for example - you may want to only allow PRs for stories that are in `To Do`/`Planning`/`In Progress` states.

The following flags can be used to validate issue status:
- `validate_issue_status`
  - If set to `true`, `jira-lint` will validate the issue status based on `allowed_issue_statuses`
- `allowed_issue_statuses`
  - This will only be used when `validate_issue_status` is `true`. This should be a comma separated list of statuses. If the detected issue's status is not in one of the `allowed_issue_statuses` then `jira-lint` will fail the status check.

**Example of invalid status**
  <p>:broken_heart: The detected issue is not in one of the allowed statuses :broken_heart: </p>    
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
    
#### Soft-validations via comments

`jira-lint` will add comments to a PR to encourage better PR practices:

**A good PR title**

<figure>
  <img src="https://user-images.githubusercontent.com/6426069/69525276-c6e62b80-0f8d-11ea-9db4-23d524b5276c.png" />
  <figcaption>When the title of the PR matches the summary/title of the issue well.</figcaption>
</figure>

---

<figure>
  <img src="https://user-images.githubusercontent.com/6426069/69480647-6a6cfa00-0e2f-11ea-8750-4294f686dac7.png" />
  <figcaption>When the title of the PR is <strong>slightly different</strong> compared to the summary/title of the issue</figcaption>
</figure>

---

<figure>
  <img src="https://user-images.githubusercontent.com/6426069/69526103-7243b000-0f8f-11ea-9deb-acb8cbb6610b.png" />
  <figcaption>When the title of the PR is <strong>very different</strong>  compared to the summary/title of the issue</figcaption>
</figure>

---

**A comment discouraging PRs which are too large (based on number of lines of code changed).**

<figure>
  <img src="https://user-images.githubusercontent.com/6426069/69480043-e06e6280-0e29-11ea-8e24-173355c304dd.png" />
  <figcaption>Batman says no large PRs 🦇</figcaption>
</figure>

### Options

| key             | description                                                                                                                                                                                                                                                                                                        | required | default |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------- |
| `github-token`  | Token used to update PR description. `GITHUB_TOKEN` is already available [when you use GitHub actions](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret), so all that is required is to pass it as a param here. | true     | null    |
| `jira-token`    | Token used to fetch Jira Issue information.  Check [below](#jira-token) for more details on how to generate the token.                                                                                                          | true     | null    |
| `jira-base-url` | The subdomain of JIRA cloud that you use to access it. Ex: "https://your-domain.atlassian.net".                                                                                                                                                                                                                    | true     | null    |
| `skip-branches` | A regex to ignore running `jira-lint` on certain branches, like production etc.                                                                                                                                                                                                                                    | false    | ' '     |
| `skip-comments` | A `Boolean` if set to `true` then `jira-lint` will skip adding lint comments for PR title.                                                                                                                                                                                                                         | false    | false   |
| `pr-threshold`  | An `Integer` based on which `jira-lint` will add a comment discouraging huge PRs.                                                                                                                                                                                                                                  | false    | 800     |
| `validate_issue_status`  | A `Boolean` based on which `jira-lint` will validate the status of the detected jira issue                                                                                                                                                                                                              | false    | false   |
| `allowed_issue_statuses`  | A comma separated list of allowed statuses. The detected jira issue's status will be compared against this list and if a match is not found then the status check will fail. *Note*: Requires `validate_issue_status` to be set to `true`.                                                                                        | false    | `"In Progress"` |


### `jira-token`

Since tokens are private, we suggest adding them as [GitHub secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets).

The Jira token is used to fetch issue information via the Jira REST API. To get the token:-
1. Generate an [API token via JIRA](https://confluence.atlassian.com/cloud/api-tokens-938839638.html)
2. Create the encoded token in the format of `base64Encode(<username>:<api_token>)`.
   For example, if the username is `ci@example.com` and the token is `954c38744be9407ab6fb`, then `ci@example.com:954c38744be9407ab6fb` needs to be base64 encoded to form `Y2lAZXhhbXBsZS5jb206OTU0YzM4NzQ0YmU5NDA3YWI2ZmI=`
3. The above value (in this example `Y2lAZXhhbXBsZS5jb206OTU0YzM4NzQ0YmU5NDA3YWI2ZmI=`) needs to be added as the `JIRA_TOKEN` secret in your GitHub project.

Note: The user should have the [required permissions (mentioned under GET Issue)](https://developer.atlassian.com/cloud/jira/platform/rest/v3/?utm_source=%2Fcloud%2Fjira%2Fplatform%2Frest%2F&utm_medium=302#api-rest-api-3-issue-issueIdOrKey-get).

### Skipping branches

Since GitHub actions take string inputs, `skip-branches` must be a regex which will work for all sets of branches you want to ignore. This is useful for merging protected/default branches into other branches. Check out some [examples in the tests](https://github.com/ClearTax/jira-lint/blob/08a47ab7a6e2bc235c9e34da1d14eacf9d810bd1/__tests__/utils.test.ts#L33-L44).

`jira-lint` already skips PRs which are filed by bots (for eg. [dependabot](https://github.com/marketplace/dependabot-preview)). You can add more bots to [this list](https://github.com/ClearTax/jira-lint/blob/08a47ab7a6e2bc235c9e34da1d14eacf9d810bd1/src/constants.ts#L4), or add the branch-format followed by the bot PRs to the `skip-branches` option.

## Contributing

Follow the instructions [here](https://help.github.com/en/articles/creating-a-javascript-action#commit-and-push-your-action-to-github) to know more about GitHub actions.

## FAQ

<details>
  <summary>Why is a Jira key required in the branch names?</summary>

The key is required in order to:

- Automate change-logs and release notes ⚙️.
- Automate alerts to QA/Product teams and other external stake-holders 🔊.
- Help us retrospect the sprint progress 📈.

</details>

<details>
  <summary>Is there a way to get around this?</summary>
  Nope 🙅

</details>

[jira]: https://www.atlassian.com/software/jira

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="http://hacktivist.in"><img src="https://avatars3.githubusercontent.com/u/4851763?v=4" width="100px;" alt=""/><br /><sub><b>Raj Anand</b></sub></a><br /><a href="https://github.com/ClearTax/jira-lint/commits?author=rajanand02" title="Code">💻</a> <a href="https://github.com/ClearTax/jira-lint/pulls?q=is%3Apr+reviewed-by%3Arajanand02" title="Reviewed Pull Requests">👀</a> <a href="#ideas-rajanand02" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://aditimohanty.com/?utm_source=github&utm_medium=documentation-allcontributors&utm_content=jira-lint"><img src="https://avatars3.githubusercontent.com/u/6426069?v=4" width="100px;" alt=""/><br /><sub><b>Aditi Mohanty</b></sub></a><br /><a href="https://github.com/ClearTax/jira-lint/commits?author=rheaditi" title="Code">💻</a> <a href="https://github.com/ClearTax/jira-lint/commits?author=rheaditi" title="Documentation">📖</a> <a href="#infra-rheaditi" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    <td align="center"><a href="https://github.com/dustman9000"><img src="https://avatars0.githubusercontent.com/u/3944352?v=4" width="100px;" alt=""/><br /><sub><b>Dustin Row</b></sub></a><br /><a href="https://github.com/ClearTax/jira-lint/pulls?q=is%3Apr+reviewed-by%3Adustman9000" title="Reviewed Pull Requests">👀</a></td>
    <td align="center"><a href="https://github.com/richardlhao"><img src="https://avatars1.githubusercontent.com/u/60636550?v=4" width="100px;" alt=""/><br /><sub><b>richardlhao</b></sub></a><br /><a href="https://github.com/ClearTax/jira-lint/commits?author=richardlhao" title="Code">💻</a></td>
    <td align="center"><a href="https://www.nimeshjm.com/"><img src="https://avatars3.githubusercontent.com/u/2178497?v=4" width="100px;" alt=""/><br /><sub><b>Nimesh Manmohanlal</b></sub></a><br /><a href="https://github.com/ClearTax/jira-lint/commits?author=nimeshjm" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/lwaddicor"><img src="https://avatars2.githubusercontent.com/u/10589338?v=4" width="100px;" alt=""/><br /><sub><b>Lewis Waddicor</b></sub></a><br /><a href="https://github.com/ClearTax/jira-lint/commits?author=lwaddicor" title="Code">💻</a></td>
  </tr>
</table>

<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

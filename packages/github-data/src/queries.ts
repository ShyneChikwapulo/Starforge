export const USER_QUERY = /* GraphQL */ `
  query StarforgeUser($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      name
      avatarUrl
      createdAt
      followers {
        totalCount
      }
      following {
        totalCount
      }
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

export const REPOS_QUERY = /* GraphQL */ `
  query StarforgeRepos($login: String!, $after: String) {
    user(login: $login) {
      repositories(
        first: 100
        after: $after
        ownerAffiliations: OWNER
        privacy: PUBLIC
        orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name
          url
          description
          stargazerCount
          forkCount
          primaryLanguage {
            name
          }
          repositoryTopics(first: 10) {
            nodes {
              topic {
                name
              }
            }
          }
          createdAt
          pushedAt
          isFork
          isArchived
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }
    }
  }
`;

export const PULL_REQUEST_STATS_QUERY = /* GraphQL */ `
  query StarforgePullRequestStats($login: String!, $opened: String!, $merged: String!) {
    opened: search(query: $opened, type: ISSUE, first: 1) {
      issueCount
    }
    merged: search(query: $merged, type: ISSUE, first: 1) {
      issueCount
    }
    user(login: $login) {
      pullRequests(states: MERGED) {
        totalCount
      }
    }
  }
`;

export const COMMUNITY_QUERY = /* GraphQL */ `
  query StarforgeCommunity($login: String!) {
    user(login: $login) {
      asSponsor: sponsorshipsAsSponsor {
        totalCount
      }
      asMaintainer: sponsorshipsAsMaintainer {
        totalCount
      }
      repositoryDiscussions {
        totalCount
      }
      repositoryDiscussionComments(onlyAnswers: true) {
        totalCount
      }
    }
  }
`;

export const HIGHLIGHTS_QUERY = /* GraphQL */ `
  query StarforgeHighlights($login: String!, $merged: String!) {
    user(login: $login) {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            nameWithOwner
            url
            description
            stargazerCount
            primaryLanguage {
              name
            }
          }
        }
      }
    }
    search(query: $merged, type: ISSUE, first: 100) {
      issueCount
      nodes {
        ... on PullRequest {
          repository {
            nameWithOwner
            url
            stargazerCount
          }
        }
      }
    }
  }
`;

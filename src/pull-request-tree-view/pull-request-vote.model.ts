/**
 * Votes values for pull requests
 *
 * @export
 * @enum {number}
 */
export enum PullRequestVote {
    /**
     * The pull request has been approved with no suggestions
     */
    Approved = 10,

    /**
     * Pull request has been approved with suggestions
     */
    ApprovedWithSuggestions = 5,

    /**
     * A vote has not been placed yet
     */
    NoVote = 0,

    /**
     * Wait for author before pull request can be approved
     */
    WaitingForAuthor = -5,

    /**
     * The pull request has been rejected
     */
    Rejected = -10
}

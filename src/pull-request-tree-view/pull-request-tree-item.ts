import * as vscode from 'vscode';
import { GitPullRequest } from '../../node_modules/azure-devops-node-api/interfaces/GitInterfaces';
import { PullRequestsProvider } from './pull-request-provider';

export class PullRequestTreeItem extends vscode.TreeItem {
    get tooltip(): string {
        return `${this.label}`;
    }

    get description(): string {
        return '';
    }

    // ContextValue = 'dependency';

    constructor(
        public pullRequest: GitPullRequest,
        public readonly command?: vscode.Command
    ) {
        super(pullRequest.title ? pullRequest.title : '', vscode.TreeItemCollapsibleState.Collapsed);
        if (pullRequest.reviewers && !PullRequestsProvider.pullRequestHasVote(pullRequest.reviewers)) {
            this.iconPath = new vscode.ThemeIcon('circle-filled');
        }
    }

}

import * as vscode from 'vscode';
import { GitPullRequest } from '../../node_modules/azure-devops-node-api/interfaces/GitInterfaces';
import { PullRequestsProvider } from './pull-request-provider';
import * as path from 'path';

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
            this.iconPath = {
                light: vscode.Uri.file(`${path.resolve(__dirname, '..', '..')}/src/assets/images/circle.svg`),
                dark: vscode.Uri.file(`${path.resolve(__dirname, '..', '..')}/src/assets/images/circle_inverse.svg`)
            };
        }
    }

}

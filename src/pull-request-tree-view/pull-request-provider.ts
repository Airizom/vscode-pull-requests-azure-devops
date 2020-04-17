import * as vscode from 'vscode';
import { PullRequestsService } from '../services/pull-request.service';
import { GitPullRequest, GitPullRequestCommentThread, IdentityRefWithVote } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { PullRequestTreeItem } from './pull-request-tree-item';
import { TreeItemCollapsibleState } from 'vscode';
import { PullRequestReviewerTreeProvider } from './pull-request-reviewer-provider';
import { PullRequestVote } from '../models/pull-request-vote.model';

export class PullRequestsProvider implements vscode.TreeDataProvider<any> {
    public _onDidChangeTreeData: vscode.EventEmitter<any | undefined> = new vscode.EventEmitter<any | undefined>();

    public readonly onDidChangeTreeData: vscode.Event<any | undefined> = this._onDidChangeTreeData.event;
    public pullRequestReviewerTreeView: vscode.TreeView<vscode.TreeItem> | undefined;


    constructor(
        private readonly pullRequestsService: PullRequestsService
    ) {
        vscode.commands.registerCommand('pullRequestsExplorer.showPullRequest', this.showPullRequestReview);
    }

    /**
     * Return the vote description based on the value of the vote number
     *
     * @param {(number | undefined)} vote
     * @returns {(string)}
     * @memberof PullRequestsProvider
     */
    public static getVoteText(vote: PullRequestVote): string {
        switch (vote) {
            case PullRequestVote.Approved:
                return 'Approved';
            case PullRequestVote.ApprovedWithSuggestions:
                return 'Approved with suggestions';
            case PullRequestVote.WaitingForAuthor:
                return 'Waiting for author';
            case PullRequestVote.Rejected:
                return 'Rejected';
            default:
                return '';
        }
    }

    /**
     * Check to see if there are any votes for each reviewer and if so return true
     * Otherwise return false
     *
     * @static
     * @param {IdentityRefWithVote[]} reviewers
     * @memberof PullRequestsProvider
     */
    public static pullRequestHasVote(reviewers: IdentityRefWithVote[]): boolean {
        for (const reviewer of reviewers) {
            if (reviewer.vote !== PullRequestVote.NoVote) {
                return true;
            }
        }

        return false;
    }


    /**
     * Get the tree item
     *
     * @private
     * @param {*} element
     * @returns {(vscode.TreeItem | Thenable<vscode.TreeItem>)}
     * @memberof PullRequestsProvider
     */
    public getTreeItem(element: any): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    /**
     * Get the tree children
     *
     * @param {*} [element]
     * @returns {vscode.ProviderResult<vscode.TreeItem[]>}
     * @memberof PullRequestsProvider
     */
    public async getChildren(element?: PullRequestTreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            const createdByMeTreeItem: vscode.TreeItem = {
                collapsibleState: TreeItemCollapsibleState.Expanded,
                label: 'Created by me'
            };

            const assignedToMeTreeItem: vscode.TreeItem = {
                collapsibleState: TreeItemCollapsibleState.Expanded,
                label: 'Assigned to me'
            };

            const allPullRequestsTreeItem: vscode.TreeItem = {
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                label: 'All pull requests'
            };

            return [createdByMeTreeItem, assignedToMeTreeItem, allPullRequestsTreeItem];
        }

        if (element.label === 'Created by me') {
            const pullRequests: GitPullRequest[] = await this.pullRequestsService.getPullRequestsCreatedByUser();
            const pullRequestsTreeItems: PullRequestTreeItem[] = [];
            for (const pullRequest of pullRequests) {
                const command: vscode.Command = {
                    title: '',
                    command: 'pullRequestsExplorer.showPullRequest',
                    tooltip: pullRequest.description,
                    arguments: [pullRequest]
                };
                pullRequestsTreeItems.push(new PullRequestTreeItem(pullRequest, command));
            }
            return pullRequestsTreeItems;
        }

        if (element.label === 'Assigned to me') {
            const pullRequests: GitPullRequest[] = await this.pullRequestsService.getPullRequestsAssignedToUser();
            const pullRequestsTreeItems: PullRequestTreeItem[] = [];
            for (const pullRequest of pullRequests) {
                const command: vscode.Command = {
                    title: '',
                    command: 'pullRequestsExplorer.showPullRequest',
                    tooltip: pullRequest.description,
                    arguments: [pullRequest]
                };
                pullRequestsTreeItems.push(new PullRequestTreeItem(pullRequest, command));
            }
            return pullRequestsTreeItems;
        }

        if (element.label === 'All pull requests') {
            const pullRequests: GitPullRequest[] = await this.pullRequestsService.getAllPullRequestsForRepository();
            const pullRequestsTreeItems: PullRequestTreeItem[] = [];
            for (const pullRequest of pullRequests) {
                const command: vscode.Command = {
                    title: '',
                    command: 'pullRequestsExplorer.showPullRequest',
                    tooltip: pullRequest.description,
                    arguments: [pullRequest]
                };
                pullRequestsTreeItems.push(new PullRequestTreeItem(pullRequest, command));
            }
            return pullRequestsTreeItems;
        }

        const reviewerTreeItem: vscode.TreeItem[] = [];
        if (element.pullRequest.reviewers) {
            for (const reviewer of element.pullRequest.reviewers) {
                const treeItem: vscode.TreeItem = {
                    collapsibleState: TreeItemCollapsibleState.None,
                    label: reviewer.displayName,
                    iconPath: undefined,
                    description: PullRequestsProvider.getVoteText(reviewer.vote as PullRequestVote)
                };
                reviewerTreeItem.push(treeItem);
            }
        }
        return reviewerTreeItem;
    }

    private readonly showPullRequestReview = async (pullRequest: GitPullRequest) => {
        if (pullRequest && pullRequest.pullRequestId) {
            const threads: GitPullRequestCommentThread[] = await this.pullRequestsService.getPullRequestThreads(pullRequest.pullRequestId);
            const treeDataProvider: PullRequestReviewerTreeProvider =
                new PullRequestReviewerTreeProvider(pullRequest, threads, this.pullRequestsService);
            this.pullRequestReviewerTreeView = vscode.window.createTreeView('pullRequestReviewPanel', { treeDataProvider });
            this.pullRequestReviewerTreeView.onDidChangeVisibility(async (event: vscode.TreeViewVisibilityChangeEvent) => {
                if (event.visible) {
                    treeDataProvider.setCommands();
                } else {
                    await treeDataProvider.disposeCommands();
                }
            });
            vscode.commands.executeCommand('pullRequestReviewPanel.focus');
        }
    }


}

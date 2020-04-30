import * as vscode from 'vscode';
import { AvatarUtility } from './avatar.utility';
import { FilePathUtility } from './file-path.utility';

export class TreeItemUtility {

    constructor(private readonly avatarUtility: AvatarUtility) {
        //
    }

    /**
     * Create a tree item that displays the user name and the status of the pull request.
     *
     * @public
     * @param {string} label
     * @param {string} userId
     * @returns {Promise<vscode.TreeItem>}
     * @memberof TreeItemUtility
     */
    public async getCreatedByStatusTreeItem(label: string, userId: string): Promise<vscode.TreeItem> {
        return {
            label: label,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconPath: await this.avatarUtility.getProfilePicFromId(userId)
        };
    }

    /**
     * Create tree item that displays the source branch and target branch of the pull request.
     *
     * @param {string} sourceRefName
     * @param {string} targetRefName
     * @returns {vscode.TreeItem}
     * @memberof TreeItemUtility
     */
    public getBranchesToMergeTreeItem(sourceRefName: string, targetRefName: string): vscode.TreeItem {
        return {
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            label: `${FilePathUtility.getLastPathFragment(sourceRefName ?? '')} into ${FilePathUtility.getLastPathFragment(targetRefName ?? '')}`,
            tooltip: `${sourceRefName} into ${targetRefName}`,
            iconPath: new vscode.ThemeIcon('git-branch')
        };
    }

    /**
     * Create a tree item that shows the pull request title plus the number of the pull request.
     * This will also display an pull request icon next to it.
     *
     * @param {string} pullRequestTitle
     * @returns {vscode.TreeItem}
     * @memberof TreeItemUtility
     */
    public createPullRequestTitleTreeItem(pullRequestTitle: string): vscode.TreeItem {
        return {
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            label: pullRequestTitle,
            tooltip: pullRequestTitle,
            iconPath: new vscode.ThemeIcon('git-pull-request')
        };
    }

    /**
     * Get a basic tree item with a label that is in expanded state.
     *
     * @public
     * @param {string} label
     * @returns {vscode.TreeItem}
     * @memberof TreeItemUtility
     */
    public getBasicExpandedTreeItem(label: string): vscode.TreeItem {
        return {
            label: label,
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded
        };
    }

    /**
     * Get a basic tree item with a label that is in collapsed state.
     *
     * @param {string} label
     * @returns {vscode.TreeItem}
     * @memberof TreeItemUtility
     */
    public getBasicCollapsedTreeItem(label: string): vscode.TreeItem {
        return {
            label: label,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
    }

}

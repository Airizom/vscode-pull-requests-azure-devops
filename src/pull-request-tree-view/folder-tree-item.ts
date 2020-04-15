import * as vscode from 'vscode';
import { GitPullRequestChange } from 'azure-devops-node-api/interfaces/GitInterfaces';

export class FolderTreeItem extends vscode.TreeItem {
    public get iconPath(): vscode.ThemeIcon {
        return vscode.ThemeIcon.Folder;
    }

    constructor(label: string, public pullRequestChanges: GitPullRequestChange[], public previousPath: string = '') {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
    }


}

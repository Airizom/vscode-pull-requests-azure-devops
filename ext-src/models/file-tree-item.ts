import * as vscode from 'vscode';
import { GitPullRequestChange } from 'azure-devops-node-api/interfaces/GitInterfaces';

export class FileTreeItem extends vscode.TreeItem {
    public get iconPath(): vscode.ThemeIcon {
        return vscode.ThemeIcon.File;
    }

    constructor(
        label: string,
        public path: string,
        isCollapsible: boolean,
        description: string,
        command?: vscode.Command,
        public pullRequestChanges?: GitPullRequestChange[]
    ) {
        super(label, isCollapsible ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        super.description = description;
        super.command = command;
        this.pullRequestChanges = pullRequestChanges;
    }


}

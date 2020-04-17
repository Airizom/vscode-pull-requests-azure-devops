import * as vscode from 'vscode';

export class FileTreeItem extends vscode.TreeItem {
    public get iconPath(): vscode.ThemeIcon {
        return vscode.ThemeIcon.File;
    }

    constructor(label: string, public path: string, isCollapsible: boolean, description: string, command?: vscode.Command) {
        super(label, isCollapsible ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        super.description = description;
        super.command = command;
    }


}

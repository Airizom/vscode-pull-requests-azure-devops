import * as vscode from 'vscode';

export class FileTreeItem extends vscode.TreeItem {
    public get iconPath(): vscode.ThemeIcon {
        return vscode.ThemeIcon.File;
    }

    constructor(label: string, description: string, command: vscode.Command) {
        super(label, vscode.TreeItemCollapsibleState.None);
        super.description = description;
        super.command = command;
    }


}

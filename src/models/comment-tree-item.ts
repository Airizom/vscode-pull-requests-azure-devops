import * as vscode from 'vscode';
import { Comment, CommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';

export class CommentTreeItem extends vscode.TreeItem {
    public get tooltip(): string {
        return `${this.comment.author?.displayName} - ${this.comment.content}`;
    }

    constructor(
        public comment: Comment,
        public thread: CommentThread,
        public iconPath: vscode.Uri | vscode.ThemeIcon,
        public isExandable: boolean = false,
        public command?: vscode.Command
    ) {
        super(`${comment.content}`, isExandable ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.description = comment.author?.displayName;
        this.iconPath = iconPath;
        this.command = command;
    }
}

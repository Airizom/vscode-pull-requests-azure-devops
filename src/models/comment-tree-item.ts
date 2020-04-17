import * as vscode from 'vscode';
import { Comment, CommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';

export class CommentTreeItem extends vscode.TreeItem {
    public get tooltip(): string {
        return `${this.comment.author?.displayName} - ${this.comment.content}`;
    }

    constructor(
        public comment: Comment,
        public thread: CommentThread
    ) {
        super(`${comment.content}`, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = comment.author?.displayName;
    }
}

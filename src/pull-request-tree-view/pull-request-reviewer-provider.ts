import * as vscode from 'vscode';
import { PullRequestsService } from '../services/pull-request.service';
import {
    Comment,
    CommentPosition,
    CommentThreadContext,
    CommentThreadStatus,
    GitItem,
    GitPullRequest,
    GitPullRequestChange,
    GitPullRequestCommentThread,
    PullRequestStatus,
    VersionControlChangeType
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as fs from 'fs';
import * as os from 'os';
import * as lodash from 'lodash';
import { FolderTreeItem } from '../models/folder-tree-item';
import { PullRequestsProvider } from './pull-request-provider';
import { DiffCommentService } from '../services/diff-comment.service';
import { PullRequestVote } from '../models/pull-request-vote.model';
import { PullRequesetComment } from '../models/pull-request-comment.model';
import { ResourceRef } from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { CommentTreeItem } from '../models/comment-tree-item';
import * as path from 'path';
import { DiffTextDocumentContentProvider } from './diff-text-document-content-provider';
import { FilePathUtility } from '../utilities/file-path.utility';
import { FileTreeItem } from '../models/file-tree-item';
import { AvatarUtility } from '../utilities/avatar.utility';

export class PullRequestReviewerTreeProvider implements vscode.TreeDataProvider<any> {
    public _onDidChangeTreeData: vscode.EventEmitter<any | undefined> = new vscode.EventEmitter<any | undefined>();

    public readonly onDidChangeTreeData: vscode.Event<any | undefined> = this._onDidChangeTreeData.event;

    public changesetVersionDiffEditor: vscode.TextEditor | undefined;
    public previousVersionDiffEditor: vscode.TextEditor | undefined;

    private completeCodeReviewCommand: vscode.Disposable | undefined;
    private approveCommand: vscode.Disposable | undefined;
    private approveWithSuggestionsCommand: vscode.Disposable | undefined;
    private rejectCommand: vscode.Disposable | undefined;
    private openLinkCommand: vscode.Disposable | undefined;
    private openDiffCommand: vscode.Disposable | undefined;
    private replyCommand: vscode.Disposable | undefined;
    private deleteCommentCommand: vscode.Disposable | undefined;
    private onDidChangeEditorCommand: vscode.Disposable | undefined;
    private createThreadCommand: vscode.Disposable | undefined;
    private submitFirstThreadCommentCommand: vscode.Disposable | undefined;
    private editCommand: vscode.Disposable | undefined;
    private updateCommentCommand: vscode.Disposable | undefined;
    private resolveStatusCommand: vscode.Disposable | undefined;
    private reactivateStatusCommand: vscode.Disposable | undefined;
    private likeCommentCommand: vscode.Disposable | undefined;
    private unlikeCommentCommand: vscode.Disposable | undefined;

    private readonly diffCommentService: DiffCommentService;
    private readonly avatarUtility: AvatarUtility;

    constructor(
        private pullRequest: GitPullRequest,
        public readonly threads: GitPullRequestCommentThread[],
        private readonly pullRequestsService: PullRequestsService
    ) {
        this.diffCommentService = new DiffCommentService(threads, pullRequestsService.user);
        this.setCommands();
        this.setOnDidChangeActiveEditorCallback();
        this.avatarUtility = new AvatarUtility(this.pullRequestsService);
    }

    /**
     * Return the element with modifying it
     *
     * @param {vscode.TreeItem} element
     * @returns {vscode.TreeItem}
     * @memberof PullRequestReviewerTreeProvider
     */
    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * If there are no tree items then get the query again for the pull request so that we can get commits attached to it.
     * If the main tree item is there then check what type of tree item it is and then return children for that item
     *
     * @param {vscode.TreeItem} [element]
     * @returns {Promise<vscode.TreeItem[]>}
     * @memberof PullRequestReviewerTreeProvider
     */
    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            if (this.pullRequest.pullRequestId) {
                this.pullRequest = await this.pullRequestsService.getPullRequest(this.pullRequest.pullRequestId);
                return this.createPullRequestReviewTree(this.pullRequest.createdBy?.displayName, this.pullRequest.status ?? PullRequestStatus.NotSet);
            }
            return [];
        }

        if (element.label === 'Description') {
            return [{
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                label: this.pullRequest.description,
                tooltip: this.pullRequest.description
            }];
        }

        if (element.label === 'Work Items') {
            if (this.pullRequest.workItemRefs) {
                const workItemRefs: ResourceRef[] = this.pullRequest.workItemRefs.filter(value => value.id);
                const workItemIds: number[] = workItemRefs.map(value => parseInt(value.id as string, 10));
                const workItems: WorkItem[] = await this.pullRequestsService.getWorkItems(workItemIds);
                const workItemTreeItems: vscode.TreeItem[] | undefined = workItems?.map(value => {
                    return {
                        label: value.fields ? value.fields['System.Title'] : '',
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        command: {
                            title: '',
                            command: 'pullRequestsExplorer.openLink',
                            arguments: [value._links?.html?.href ?? '']
                        }
                    };
                });
                return workItemTreeItems || [];
            }
            return [];
        }

        if (element.label === 'Required Policies') {
            const policyTreeItems: vscode.TreeItem[] = [];
            if (this.pullRequest.artifactId) {
                // const policies: PolicyEvaluationRecord | undefined = await this.pullRequestsService.getPolicies(this.pullRequest.artifactId);
            }
            return policyTreeItems;
        }

        if (element.label === 'Reviewers') {
            const reviewers: vscode.TreeItem[] = [];
            if (this.pullRequest.reviewers) {
                for (const reviewer of this.pullRequest.reviewers) {
                    reviewers.push({
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        label: reviewer.displayName,
                        description: PullRequestsProvider.getVoteText(reviewer.vote as PullRequestVote)
                    });
                }
            }
            return reviewers;
        }

        if (element.label === 'Commits') {
            const commitTreeItems: vscode.TreeItem[] = [];
            if (this.pullRequest.commits) {
                for (const commit of this.pullRequest.commits) {
                    commitTreeItems.push({
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        label: commit.comment,
                        tooltip: `${commit.commitId} - ${commit.author ? commit.author.name : ''} - ${commit.comment}`,
                        command: {
                            title: '',
                            command: 'pullRequestsExplorer.openLink',
                            arguments: [this.pullRequestsService.getCommitRemoteUrl(commit.commitId ? commit.commitId : '')]
                        }
                    });
                }
            }
            return commitTreeItems;
        }

        if (element.label === 'Overall Comments') {
            const commentsTreeItems: CommentTreeItem[] = [];
            for (const thread of this.threads) {
                if (!thread.threadContext && !thread.isDeleted && thread.id && thread.status) {
                    const firstComment: Comment | undefined = thread.comments?.find((value: Comment) => {
                        return !value.isDeleted;
                    });
                    if (firstComment) {
                        commentsTreeItems.push(new CommentTreeItem(firstComment, thread, await this.avatarUtility.getProfilePic(firstComment.author?.id)));
                    }
                }
            }
            return commentsTreeItems;
        }

        if (element instanceof CommentTreeItem) {
            const commentsTreeItems: vscode.TreeItem[] = [];
            if (element.thread.comments) {
                for (let index: number = 0; index < element.thread.comments.length; index++) {
                    if (index !== 0) {
                        const comment: Comment = element.thread.comments[index];
                        commentsTreeItems.push({
                            collapsibleState: vscode.TreeItemCollapsibleState.None,
                            label: comment.content,
                            description: `${comment.author?.displayName}`,
                            tooltip: `${comment.author?.displayName} - ${comment.content}`,
                            iconPath: await this.avatarUtility.getProfilePic(comment.author?.id)
                        });
                    }
                }
            }
            return commentsTreeItems;
        }

        if (element.label === 'Files') {
            const filesTreeItems: vscode.TreeItem[] = [];
            if (this.pullRequest.pullRequestId) {
                const fileChanges: GitPullRequestChange[] = await this.pullRequestsService.getFilesChanged(
                    this.pullRequest.pullRequestId
                );
                if (fileChanges) {
                    const files: string[] = lodash.cloneDeep(fileChanges).map(value => value.item?.path ?? '');
                    const commonPath: string = FilePathUtility.getCommonPath(files);
                    filesTreeItems.push(new FolderTreeItem(commonPath, fileChanges));
                }
            }
            return filesTreeItems;
        }

        if (element instanceof FolderTreeItem) {
            const treeItems: vscode.TreeItem[] = [];

            let replacePath: string = `${element.previousPath}${element.label}`;
            if (!replacePath.endsWith('/')) {
                replacePath = `${replacePath}/`;
            }
            const paths: string[] = element.pullRequestChanges.map((value: GitPullRequestChange) => {
                if (value.item?.path) {
                    return value.item.path.replace(replacePath, '');
                } else if (value.originalPath) {
                    return value.originalPath.replace(replacePath, '');
                }

                return '';
            });
            const distinctStartingDirectories: string[] = FilePathUtility.getDirectoriesWithDistinctStartingPaths(paths);

            for (const filePath of distinctStartingDirectories) {
                const fileName: string | undefined = filePath.split('/').filter(value => value).pop();
                if (fileName) {
                    treeItems.push(new FolderTreeItem(fileName, element.pullRequestChanges, replacePath));
                }
            }

            // Files changes
            for (const file of element.pullRequestChanges) {
                if (file.item) {
                    const pathToUse: string = file.item.path ?? file.originalPath ?? '';
                    const lastPathFragment: string | undefined = pathToUse.split('/').pop();
                    const completePath: string | undefined = `${replacePath}${lastPathFragment}`;
                    let isCollapsible: boolean = false;
                    for (const thread of this.threads) {
                        const isThreadAttachedToFile: boolean = thread.threadContext?.filePath === completePath;
                        if (isThreadAttachedToFile &&
                            !thread.isDeleted &&
                            thread.id &&
                            thread.status &&
                            thread.status === CommentThreadStatus.Active &&
                            thread.comments
                        ) {
                            isCollapsible = thread.comments.some((value: Comment) => {
                                return !value.isDeleted;
                            });
                            if (isCollapsible) {
                                break;
                            }
                        }
                    }
                    if (lastPathFragment && pathToUse && pathToUse === completePath) {
                        const command: vscode.Command = {
                            title: '',
                            command: 'pullRequestsExplorer.openFileDiff',
                            arguments: [
                                file
                            ]
                        };
                        const fileItem: FileTreeItem = new FileTreeItem(
                            lastPathFragment ?? '',
                            completePath,
                            isCollapsible,
                            PullRequestReviewerTreeProvider.getFileDescription(file.changeType),
                            command
                        );
                        treeItems.push(fileItem);
                    }
                }
            }
            return treeItems;
        }

        if (element instanceof FileTreeItem) {
            const commentsTreeItems: CommentTreeItem[] = [];
            for (const thread of this.threads) {
                const isThreadAttachedToFile: boolean = thread.threadContext?.filePath === element.path;
                if (isThreadAttachedToFile && !thread.isDeleted && thread.id && thread.status) {
                    const firstComment: Comment | undefined = thread.comments?.find((value: Comment) => {
                        return !value.isDeleted;
                    });
                    if (firstComment) {
                        commentsTreeItems.push(new CommentTreeItem(firstComment, thread, await this.avatarUtility.getProfilePic(firstComment.author?.id)));
                    }
                }
            }
            return commentsTreeItems;
        }

        return [];
    }

    /**
     * Use this method to reset all commands so that they use the right scope.
     *
     * @memberof CodeReviewerProvider
     */
    public setCommands(): void {
        this.setDiffCommand();
        this.setApproveCommand();
        this.setWaitForAuthorCommand();
        this.setApproveWithSuggestionsCommand();
        this.setRejectCommand();
        this.registerOpenLinkCommand();
        this.registerReplyCommand();
        this.registerDeleteCommentCommand();
        this.registerCreateThreadCommand();
        this.registerSubmitFirstThreadCommentCommand();
        this.registerEditCommand();
        this.registerUpdateCommentCommand();
        this.registerResolveStatus();
        this.registerReactivateStatus();
        this.registerLikeCommentCommand();
        this.registerUnlikeCommand();
    }

    /**
     * Dispose of all commands
     *
     * @memberof CodeReviewerProvider
     */
    public async disposeCommands(): Promise<void> {
        if (this.completeCodeReviewCommand) {
            this.completeCodeReviewCommand.dispose();
        }
        if (this.approveCommand) {
            this.approveCommand.dispose();
        }
        if (this.approveWithSuggestionsCommand) {
            this.approveWithSuggestionsCommand.dispose();
        }
        if (this.rejectCommand) {
            this.rejectCommand.dispose();
        }
        if (this.openLinkCommand) {
            this.openLinkCommand.dispose();
        }
        if (this.openDiffCommand) {
            this.openDiffCommand.dispose();
        }
        if (this.replyCommand) {
            this.replyCommand.dispose();
        }
        if (this.editCommand) {
            this.editCommand.dispose();
        }
        if (this.updateCommentCommand) {
            this.updateCommentCommand.dispose();
        }
        if (this.deleteCommentCommand) {
            this.deleteCommentCommand.dispose();
        }
        if (this.createThreadCommand) {
            this.createThreadCommand.dispose();
        }
        if (this.onDidChangeEditorCommand) {
            this.onDidChangeEditorCommand.dispose();
        }
        if (this.submitFirstThreadCommentCommand) {
            this.submitFirstThreadCommentCommand.dispose();
        }
        if (this.resolveStatusCommand) {
            this.resolveStatusCommand.dispose();
        }
        if (this.reactivateStatusCommand) {
            this.reactivateStatusCommand.dispose();
        }
        if (this.likeCommentCommand) {
            this.likeCommentCommand.dispose();
        }
        if (this.unlikeCommentCommand) {
            this.unlikeCommentCommand.dispose();
        }
        this.diffCommentService.disposeEditorsAndThreads();
        await this.closeDiffEditors();
        this.setContextMenuToHaveAddCommentItem(false);
    }

    /**
     * Determine the type of file description to add next to the name of the file
     *
     * @private
     * @param {(VersionControlChangeType | undefined)} changeType
     * @returns {string}
     * @memberof PullRequestReviewerTreeProvider
     */
    private static getFileDescription(changeType: VersionControlChangeType | undefined): string {
        if (changeType === VersionControlChangeType.Add) {
            return 'Add';
        } else if (changeType === VersionControlChangeType.Delete) {
            return 'Delete';
        } else if (changeType === VersionControlChangeType.Rename) {
            return 'Rename';
        } else if (changeType === VersionControlChangeType.Edit) {
            return 'Edit';
        } else if (changeType === VersionControlChangeType.Rename + VersionControlChangeType.Edit) {
            return 'Rename, Edit';
        }
        return '';
    }

    /**
     * Open commit in browser in azure devops
     *
     * @private
     * @param {string} url
     * @returns {(Thenable<{} | undefined>)}
     * @memberof PullRequestReviewerTreeProvider
     */
    private static openLinkInBrowser(url: string): Thenable<{} | undefined> {
        return vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
    }

    /**
     * Set a callback method to be fired when the user changes editors
     * If the editor is the diff editor then set the context value of isPullRequest to true.
     * This is used to determine if we will be show the 'Add Comment' command in the context menu
     * of the editor.
     *
     * @private
     * @memberof PullRequestReviewerTreeProvider
     */
    private setOnDidChangeActiveEditorCallback(): void {
        this.onDidChangeEditorCommand = vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
            if (editor) {
                if ((this.changesetVersionDiffEditor && editor.document === this.changesetVersionDiffEditor.document) ||
                    (this.previousVersionDiffEditor && editor.document === this.previousVersionDiffEditor.document)) {
                    this.setContextMenuToHaveAddCommentItem();
                } else {
                    this.setContextMenuToHaveAddCommentItem(false);
                }
            }
        });
    }

    /**
     * The close active diff editors so they can't be used anymore.
     * This needs to be done because the user potentially could have closed the pull
     * reqeust tree view and the pull request commands have benn removed.
     *
     * @private
     * @returns {((e: vscode.TextEditor | undefined) => any)}
     * @memberof PullRequestReviewerTreeProvider
     */
    private async closeDiffEditors(): Promise<void> {
        if (this.changesetVersionDiffEditor) {
            vscode.window.visibleTextEditors.forEach(async (editor: vscode.TextEditor) => {
                if (editor.document.uri.fsPath === this.changesetVersionDiffEditor?.document.uri.fsPath) {
                    await (vscode.workspace.fs.delete(vscode.Uri.parse(`${DiffTextDocumentContentProvider.pullRequestDiffScheme}:${this.changesetVersionDiffEditor.document.uri.fsPath}`)) as Promise<void>);
                }
            });
        }
        if (this.previousVersionDiffEditor) {
            vscode.window.visibleTextEditors.forEach(async (editor: vscode.TextEditor) => {
                if (editor.document.uri.fsPath === this.previousVersionDiffEditor?.document.uri.fsPath) {
                    await (vscode.workspace.fs.delete(vscode.Uri.parse(`${DiffTextDocumentContentProvider.pullRequestDiffScheme}:${this.previousVersionDiffEditor.document.uri.fsPath}`)) as Promise<void>);
                }
            });
        }
    }

    /**
     * Set the diff command if it does not exist
     *
     * @memberof CodeReviewerProvider
     */
    private setDiffCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestsExplorer.openFileDiff');
            if (!command && !this.openDiffCommand) {
                this.openDiffCommand = vscode.commands.registerCommand('pullRequestsExplorer.openFileDiff', this.onDiffSelection);
            }
        });
    }

    /**
     * Register the reply command to reply to pull requests messages
     *
     * @memberof CodeReviewerProvider
     */
    private registerCreateThreadCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.createThread');
            if (!command && !this.createThreadCommand) {
                this.createThreadCommand = vscode.commands.registerCommand('pullRequestReviewPanel.createThread', this.onCreateThread);
            }
        });
    }

    /**
     * Submit the first comment for a thread
     *
     * @memberof CodeReviewerProvider
     */
    private registerSubmitFirstThreadCommentCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.submitFirstThreadComment');
            if (!command && !this.submitFirstThreadCommentCommand) {
                this.submitFirstThreadCommentCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.submitFirstThreadComment', this.onSubmitFirstComment);
            }
        });
    }

    /**
     * Register command to update status to Active or Fixed. (Resolved or Reactivate)
     *
     * @private
     * @memberof PullRequestReviewerTreeProvider
     */
    private registerResolveStatus(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.resolve');
            if (!command && !this.resolveStatusCommand) {
                this.resolveStatusCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.resolve', this.onUpdateStatus);
            }
        });
    }

    /**
     * Register command to reactivate status
     *
     * @private
     * @memberof PullRequestReviewerTreeProvider
     */
    private registerReactivateStatus(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.reactivate');
            if (!command && !this.reactivateStatusCommand) {
                this.reactivateStatusCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.reactivate', this.onUpdateStatus);
            }
        });
    }

    /**
     * Register command to like a comment
     *
     * @private
     * @memberof PullRequestReviewerTreeProvider
     */
    private registerLikeCommentCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.like');
            if (!command && !this.likeCommentCommand) {
                this.likeCommentCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.like', this.onLikeComment);
            }
        });
    }

    /**
     * Register command to unlike a comment
     *
     * @private
     * @memberof PullRequestReviewerTreeProvider
     */
    private registerUnlikeCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.unlike');
            if (!command && !this.unlikeCommentCommand) {
                this.unlikeCommentCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.unlike', this.onUnlikeComment);
            }
        });
    }

    /**
     * Register the reply command to reply to pull requests messages
     *
     * @memberof CodeReviewerProvider
     */
    private registerReplyCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.reply');
            if (!command && !this.replyCommand) {
                this.replyCommand = vscode.commands.registerCommand('pullRequestReviewPanel.reply', this.onReply);
            }
        });
    }

    /**
     * Register the edit command to change comments
     *
     * @memberof CodeReviewerProvider
     */
    private registerEditCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.edit');
            if (!command && !this.editCommand) {
                this.editCommand = vscode.commands.registerCommand('pullRequestReviewPanel.edit', this.onEdit);
            }
        });
    }

    /**
     * Register command to update comments
     *
     * @memberof CodeReviewerProvider
     */
    private registerUpdateCommentCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.updateComment');
            if (!command && !this.updateCommentCommand) {
                this.updateCommentCommand = vscode.commands.registerCommand('pullRequestReviewPanel.updateComment', this.onUpdateComment);
            }
        });
    }

    /**
     * Register the delete command to delete pull request comment replies
     *
     * @memberof CodeReviewerProvider
     */
    private registerDeleteCommentCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.deleteComment');
            if (!command && !this.deleteCommentCommand) {
                this.deleteCommentCommand = vscode.commands.registerCommand('pullRequestReviewPanel.deleteComment', this.onDeleteComment);
            }
        });
    }

    private readonly onReply = async (reply: vscode.CommentReply): Promise<void> => {
        await this.reply(reply);
    }

    private readonly onDeleteComment = async (comment: PullRequesetComment): Promise<void> => {
        await this.deleteComment(comment);
    }

    private readonly onEdit = async (comment: PullRequesetComment): Promise<void> => {
        await this.enterCommentEditMode(comment);
    }

    private readonly onUpdateComment = async (comment: PullRequesetComment): Promise<void> => {
        await this.updateComment(comment);
    }

    private readonly onUpdateStatus = async (thread: vscode.CommentThread): Promise<void> => {
        if (thread.contextValue && this.pullRequest.pullRequestId && thread.comments.length > 0) {
            const status: CommentThreadStatus = parseInt(thread.contextValue, 10);
            if (status === CommentThreadStatus.Active) {
                await this.pullRequestsService.updateCommentStatus(CommentThreadStatus.Fixed,
                    this.pullRequest.pullRequestId,
                    (thread.comments[0] as PullRequesetComment).threadId
                );
                thread.contextValue = CommentThreadStatus.Fixed.toString();
            } else if (status === CommentThreadStatus.Fixed) {
                await this.pullRequestsService.updateCommentStatus(CommentThreadStatus.Active,
                    this.pullRequest.pullRequestId,
                    (thread.comments[0] as PullRequesetComment).threadId
                );
                thread.contextValue = CommentThreadStatus.Active.toString();
            }
        }
    }

    private readonly onLikeComment = async (comment: PullRequesetComment): Promise<void> => {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !comment.parent || !this.pullRequest.pullRequestId) {
            return;
        }

        await this.pullRequestsService.likeComment(this.pullRequest.pullRequestId, comment.threadId, comment.commentId);
        thread.comments = comment.parent.comments.map(cmt => {
            if ((cmt as PullRequesetComment).commentId === comment.commentId) {
                cmt.contextValue = comment.contextValue.replace('Like', 'Unlike');
            }

            return cmt;
        });
    }

    private readonly onUnlikeComment = async (comment: PullRequesetComment): Promise<void> => {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !comment.parent || !this.pullRequest.pullRequestId) {
            return;
        }

        await this.pullRequestsService.unlikeComment(this.pullRequest.pullRequestId, comment.threadId, comment.commentId);
        thread.comments = comment.parent.comments.map(cmt => {
            if ((cmt as PullRequesetComment).commentId === comment.commentId) {
                cmt.contextValue = comment.contextValue.replace('Unlike', 'Like');
            }

            return cmt;
        });
    }

    private readonly onSubmitFirstComment = async (comment: vscode.CommentReply): Promise<void> => {
        if (!this.previousVersionDiffEditor || !this.changesetVersionDiffEditor) {
            return;
        }

        const commentThread: vscode.CommentThread = comment.thread;

        const activeEditor: vscode.TextEditor = commentThread.uri.fsPath === this.changesetVersionDiffEditor.document.uri.fsPath ?
            this.changesetVersionDiffEditor :
            this.previousVersionDiffEditor;

        if (!this.pullRequest.pullRequestId || !comment.text || !activeEditor) {
            return;
        }

        const range: vscode.Range = this.diffCommentService.selectedRange ? this.diffCommentService.selectedRange : commentThread.range;
        const positionStart: CommentPosition = {
            line: range.start.line + 1,
            offset: range.start.character + 1
        };
        const positionEnd: CommentPosition = {
            line: range.end.line + 1,
            offset: range.end.character + 1
        };

        const isRightDiff: boolean = activeEditor.document === this.changesetVersionDiffEditor?.document;
        const threadContext: CommentThreadContext = {
            filePath: this.diffCommentService.lastSelectedDiffFilePath,
            leftFileStart: !isRightDiff ? positionStart : undefined,
            leftFileEnd: !isRightDiff ? positionEnd : undefined,
            rightFileStart: isRightDiff ? positionStart : undefined,
            rightFileEnd: isRightDiff ? positionEnd : undefined
        };

        const response: GitPullRequestCommentThread | undefined =
            await this.pullRequestsService.createCommentThread(this.pullRequest.pullRequestId, comment.text, threadContext);
        if (!response?.comments?.length || !response.id) {
            return;
        }

        if (!this.previousVersionDiffEditor || !this.changesetVersionDiffEditor) {
            return;
        }

        const responseComment: Comment = response.comments[0];
        if (!responseComment.id) {
            return;
        }

        this.diffCommentService.setDecorationsForEditor(this.previousVersionDiffEditor, this.changesetVersionDiffEditor, [response]);

        this.diffCommentService.selectedRange = undefined;

        const newComment: PullRequesetComment = new PullRequesetComment(
            responseComment,
            response.id,
            responseComment.id,
            responseComment.content ?? '',
            vscode.CommentMode.Preview,
            {
                name: this.pullRequestsService.user.identity.DisplayName
            },
            'editable'
        );
        commentThread.contextValue = response.status?.toString();
        newComment.parent = commentThread;
        newComment.threadContext = response.threadContext;
        commentThread.comments = [newComment];
    }

    private readonly onCreateThread = async (uri: vscode.Uri): Promise<void> => {
        if (!vscode.window.activeTextEditor || !this.changesetVersionDiffEditor || !this.previousVersionDiffEditor) {
            return;
        }
        const currentEditor: vscode.TextEditor =
            uri.fsPath === this.changesetVersionDiffEditor?.document.uri.fsPath ? this.changesetVersionDiffEditor : this.previousVersionDiffEditor;

        const range: vscode.Range = new vscode.Range(currentEditor.selection.start, currentEditor.selection.end);
        this.diffCommentService.selectedRange = range;
        this.diffCommentService.createThread(currentEditor.document.uri, range);
    }

    /**
     * Delete comment from the pull request thread on the server and locally.
     *
     * @private
     * @param {PullRequesetComment} comment
     * @returns {Promise<void>}
     * @memberof PullRequestReviewerTreeProvider
     */
    private async deleteComment(comment: PullRequesetComment): Promise<void> {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !this.changesetVersionDiffEditor || !this.previousVersionDiffEditor) {
            return;
        }

        if (this.pullRequest.pullRequestId) {
            await this.pullRequestsService.deleteComment(comment.commentId, comment.threadId, this.pullRequest.pullRequestId);

            const commentDeletedMarkdownText: string = '*Commment Deleted*';

            thread.comments = thread.comments.map((value: vscode.Comment) => {
                if ((value as PullRequesetComment).commentId === comment.commentId) {
                    const deletedMarkdownText: vscode.MarkdownString = new vscode.MarkdownString(commentDeletedMarkdownText);
                    const deletedComment: PullRequesetComment = new PullRequesetComment(comment.originalComment,
                        comment.threadId,
                        comment.commentId,
                        deletedMarkdownText,
                        vscode.CommentMode.Preview,
                        comment.author, ''
                    );
                    deletedComment.parent = comment.parent;
                    deletedComment.threadContext = comment.threadContext;

                    return deletedComment;
                }
                return value;
            });

            if (thread.comments.find(s => (s.body as any).value !== commentDeletedMarkdownText) === undefined) {
                thread.dispose();
                if (comment.threadContext) {
                    this.diffCommentService.removeDecoration(comment.threadId);
                }
            }
        }
    }

    /**
     * Put comment in edit mode.
     *
     * @private
     * @param {PullRequesetComment} comment
     * @returns {Promise<void>}
     * @memberof PullRequestReviewerTreeProvider
     */
    private async enterCommentEditMode(comment: PullRequesetComment): Promise<void> {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !comment.parent) {
            return;
        }

        thread.comments = comment.parent.comments.map(cmt => {
            if ((cmt as PullRequesetComment).commentId === comment.commentId) {
                cmt.mode = vscode.CommentMode.Editing;
            }

            return cmt;
        });
    }

    /**
     * Update a comment on the server and locally
     *
     * @private
     * @param {PullRequesetComment} comment
     * @returns {Promise<void>}
     * @memberof PullRequestReviewerTreeProvider
     */
    private async updateComment(comment: PullRequesetComment): Promise<void> {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !this.changesetVersionDiffEditor || !this.previousVersionDiffEditor || !comment.body) {
            return;
        }

        if (this.pullRequest.pullRequestId) {
            const commentToEdit: vscode.Comment | undefined = thread.comments.find(value => (value as PullRequesetComment).commentId === comment.commentId);

            if (!commentToEdit) {
                return;
            }

            const newComment: Comment = {
                content: comment.body as string
            };

            const updateComment: Comment | undefined =
                await this.pullRequestsService.updateComment(newComment, comment.threadId, this.pullRequest.pullRequestId, comment.commentId);

            if (!updateComment?.id) {
                return;
            }

            const commentToAdd: PullRequesetComment = new PullRequesetComment(
                updateComment,
                comment.threadId,
                updateComment.id,
                updateComment.content ?? '',
                vscode.CommentMode.Preview,
                {
                    name: this.pullRequestsService.user.identity.DisplayName
                },
                'editable'
            );
            commentToAdd.parent = comment.parent;
            commentToAdd.threadContext = comment.threadContext;
            thread.comments = thread.comments.map((value: vscode.Comment) => {
                if ((value as PullRequesetComment).commentId === commentToAdd.commentId) {
                    return commentToAdd;
                }
                return value;
            });
        }
    }

    /**
     * Reply to a pull request comment
     *
     * @private
     * @param {vscode.CommentReply} reply
     * @returns {Promise<void>}
     * @memberof PullRequestReviewerTreeProvider
     */
    private async reply(reply: vscode.CommentReply): Promise<void> {
        const replyThread: vscode.CommentThread = reply.thread;

        if (this.pullRequest.pullRequestId) {
            const threadId: number = (reply.thread.comments[0] as PullRequesetComment).threadId;
            const newComment: Comment | undefined =
                await this.pullRequestsService.replyToComment(reply.text, threadId, this.pullRequest.pullRequestId);
            if (newComment && newComment.id) {
                const replyComment: PullRequesetComment = new PullRequesetComment(
                    newComment,
                    threadId,
                    newComment.id,
                    new vscode.MarkdownString(newComment.content ?? ''),
                    vscode.CommentMode.Preview,
                    {
                        name: this.pullRequestsService.user.identity.DisplayName
                    },
                    'editable'
                );
                replyComment.parent = replyThread;
                replyComment.threadContext = (replyThread.comments[0] as any).threadContext;

                replyThread.comments = [...replyThread.comments, replyComment];
            }
        }
        replyThread.comments = [...replyThread.comments];
    }

    /**
     * Set the command to complete a code review
     *
     * @memberof CodeReviewerProvider
     */
    private setWaitForAuthorCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.waitForAuthor');
            if (!command && !this.completeCodeReviewCommand) {
                this.completeCodeReviewCommand = vscode.commands.registerCommand('pullRequestReviewPanel.waitForAuthor', async () => {
                    if (this.pullRequest.pullRequestId) {
                        await this.pullRequestsService.setPullRequestStatus(PullRequestVote.WaitingForAuthor, this.pullRequest.pullRequestId);
                        vscode.commands.executeCommand('workbench.view.scm');
                    }
                });
            }
        });
    }

    /**
     * Set the command to abandoning a code review
     *
     * @memberof CodeReviewerProvider
     */
    private setApproveCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.approve');
            if (!command && !this.approveCommand) {
                this.approveCommand = vscode.commands.registerCommand('pullRequestReviewPanel.approve', async () => {
                    if (this.pullRequest.pullRequestId) {
                        await this.pullRequestsService.setPullRequestStatus(PullRequestVote.Approved, this.pullRequest.pullRequestId);
                        vscode.commands.executeCommand('workbench.view.scm');
                    }
                });
            }
        });
    }

    /**
     * Set commmand to mark a code review to 'Looks Good'
     *
     * @private
     * @memberof CodeReviewerProvider
     */
    private setApproveWithSuggestionsCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.approveWithSuggestions');
            if (!command && !this.approveWithSuggestionsCommand) {
                this.approveWithSuggestionsCommand = vscode.commands.registerCommand('pullRequestReviewPanel.approveWithSuggestions', async () => {
                    if (this.pullRequest.pullRequestId) {
                        await this.pullRequestsService.setPullRequestStatus(PullRequestVote.ApprovedWithSuggestions, this.pullRequest.pullRequestId);
                        vscode.commands.executeCommand('workbench.view.scm');
                    }
                });
            }
        });
    }

    /**
     * Set command to mark a code review to 'Needs Work'
     *
     * @private
     * @memberof CodeReviewerProvider
     */
    private setRejectCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.reject');
            if (!command && !this.rejectCommand) {
                this.rejectCommand = vscode.commands.registerCommand('pullRequestReviewPanel.reject', async () => {
                    if (this.pullRequest.pullRequestId) {
                        await this.pullRequestsService.setPullRequestStatus(PullRequestVote.Rejected, this.pullRequest.pullRequestId);
                        vscode.commands.executeCommand('workbench.view.scm');
                    }
                });
            }
        });
    }

    /**
     * Callback when diff has finished loading
     *
     * @private
     * @memberof CodeReviewerProvider
     */
    private readonly setDiffEditorsCallback = async () => {
        this.changesetVersionDiffEditor = vscode.window.activeTextEditor;

        if (this.changesetVersionDiffEditor) {
            let lastPathFragment: string | undefined = this.changesetVersionDiffEditor.document.fileName.split(path.sep).pop();
            if (lastPathFragment) {
                // remove 'version1' from the path fragment
                const version1Count: number = 8;
                lastPathFragment = lastPathFragment.substring(version1Count);
                const previousDiffFileName: string = `${os.tmpdir()}${path.sep}version2${lastPathFragment}`;
                for (const editor of vscode.window.visibleTextEditors) {
                    if (editor.document.fileName.toLowerCase() === previousDiffFileName.toLowerCase()) {
                        this.previousVersionDiffEditor = editor;
                    }
                }
                if (this.pullRequest.pullRequestId) {
                    this.diffCommentService.threads = await this.pullRequestsService.getPullRequestThreads(this.pullRequest.pullRequestId);
                }
                await this.diffCommentService.setCommentsInDiffEditors(this.previousVersionDiffEditor as vscode.TextEditor, this.changesetVersionDiffEditor);
            }
        }
    }

    /**
     * Open a diff window for the changeset files
     *
     * @private
     * @returns {*}
     * @param file
     * @memberof CodeReviewerProvider
     */
    private async showFileDiff(file: GitPullRequestChange): Promise<void> {
        if (this.pullRequest.lastMergeSourceCommit?.commitId &&
            this.pullRequest.lastMergeTargetCommit?.commitId &&
            this.pullRequest.lastMergeCommit?.commitId &&
            this.pullRequest.commits
        ) {
            const path: string = file.item?.path ?? file.originalPath ?? '';
            this.diffCommentService.lastSelectedDiffFilePath = path;
            const lastPathFragment: string | undefined = path.split('/').pop();
            const rightDiffFilePath: string = FilePathUtility.getRightDiffFilePath(lastPathFragment);
            const leftDiffFilePath: string = FilePathUtility.getLeftDiffFilePath(lastPathFragment);
            if (file.changeType === VersionControlChangeType.Add) {
                const changeItem: GitItem | undefined = await this.pullRequestsService.getFileContents(path, this.pullRequest.lastMergeSourceCommit.commitId);
                await this.writeDiffFilesAndOpenDiffDocumentProvider(
                    leftDiffFilePath,
                    '',
                    rightDiffFilePath,
                    changeItem?.content,
                    lastPathFragment);
            } else if (file.changeType === VersionControlChangeType.Delete) {
                const previousItem: GitItem | undefined = await this.pullRequestsService.getFileContents(path, this.pullRequest.lastMergeTargetCommit.commitId);
                await this.writeDiffFilesAndOpenDiffDocumentProvider(
                    leftDiffFilePath,
                    previousItem?.content,
                    rightDiffFilePath,
                    '',
                    lastPathFragment);
            } else if (file.changeType === VersionControlChangeType.Rename ||
                file.changeType === VersionControlChangeType.Rename + VersionControlChangeType.Edit
            ) {
                const previousItem: GitItem | undefined
                    = await this.pullRequestsService.getFileContents(file.originalPath ?? '', this.pullRequest.lastMergeTargetCommit.commitId);
                const changeItem: GitItem | undefined
                    = await this.pullRequestsService.getFileContents(
                        file.item?.path ?? '',
                        this.pullRequest.lastMergeSourceCommit.commitId
                    );
                await this.writeDiffFilesAndOpenDiffDocumentProvider(
                    leftDiffFilePath,
                    previousItem?.content,
                    rightDiffFilePath,
                    changeItem?.content,
                    lastPathFragment
                );
            } else {
                const previousItem: GitItem | undefined
                    = await this.pullRequestsService.getFileContents(file.item?.path ?? '', this.pullRequest.lastMergeTargetCommit.commitId);
                const changeItem: GitItem | undefined
                    = await this.pullRequestsService.getFileContents(
                        file.item?.path ?? '',
                        this.pullRequest.lastMergeSourceCommit.commitId
                    );
                await this.writeDiffFilesAndOpenDiffDocumentProvider(
                    leftDiffFilePath,
                    previousItem?.content,
                    rightDiffFilePath,
                    changeItem?.content,
                    lastPathFragment);
            }
        }
    }

    /**
     * Callback for when a changeset file is selected to be viewed
     *
     * @private
     * @memberof CodeReviewerProvider
     */
    private readonly onDiffSelection = async (file: GitPullRequestChange): Promise<void> => {
        await this.showFileDiff(file);
    }

    /**
     * Write the contents of the diff editors to file and then create a uri
     * from the file path.
     *
     * @private
     * @param {string} leftDiffFilePath
     * @param {string} leftContent
     * @param {string} rightDiffFilePath
     * @param {string} rightContent
     * @param {(string | undefined)} lastPathFragment
     * @memberof PullRequestReviewerTreeProvider
     */
    private async writeDiffFilesAndOpenDiffDocumentProvider(
        leftDiffFilePath: string,
        leftContent: string = '',
        rightDiffFilePath: string,
        rightContent: string = '',
        lastPathFragment: string | undefined
    ): Promise<void> {
        fs.writeFileSync(leftDiffFilePath, leftContent);
        fs.writeFileSync(rightDiffFilePath, rightContent);
        const leftUri: vscode.Uri = vscode.Uri.parse(`${DiffTextDocumentContentProvider.pullRequestDiffScheme}:${leftDiffFilePath}`);
        const rightUri: vscode.Uri = vscode.Uri.parse(`${DiffTextDocumentContentProvider.pullRequestDiffScheme}:${rightDiffFilePath}`);
        await this.closeDiffEditors();
        await this.executeDiffCommand(leftUri, rightUri, lastPathFragment);
    }

    /**
     * Show diff
     *
     * @private
     * @param {vscode.Uri} leftUri
     * @param {vscode.Uri} rightUri
     * @param {(string | undefined)} lastPathFragment
     * @memberof PullRequestReviewerTreeProvider
     */
    private async executeDiffCommand(leftUri: vscode.Uri, rightUri: vscode.Uri, lastPathFragment: string | undefined): Promise<void> {
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, lastPathFragment);
        await this.setDiffEditorsCallback();
        this.setContextMenuToHaveAddCommentItem();
    }

    /**
     * Mark the context value for 'isPullRequest'
     * If set to true then 'Add Comment' item will show up when the user right clicks
     * inside a diff editor.
     * The item is tracked inside package.json
     *
     * @private
     * @param {boolean} [shouldShowAddCommentItem=true]
     * @memberof PullRequestReviewerTreeProvider
     */
    private setContextMenuToHaveAddCommentItem(shouldShowAddCommentItem: boolean = true): void {
        vscode.commands.executeCommand('setContext', 'isPullRequest', shouldShowAddCommentItem);
    }

    /**
     * Get all the tree items for a code review
     *
     * @private
     * @returns {Promise<vscode.TreeItem[]>}
     * @memberof CodeReviewerProvider
     */
    private async createPullRequestReviewTree(userName: string = '', status: PullRequestStatus): Promise<vscode.TreeItem[]> {
        const pullRequestTreeItems: vscode.TreeItem[] = [];

        // User
        const userNameTreeItem: vscode.TreeItem = {
            label: `${userName} - ${PullRequestStatus[status]}`,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconPath: await this.avatarUtility.getProfilePic(this.pullRequest.createdBy?.id)
        };
        pullRequestTreeItems.push(userNameTreeItem);

        // Title
        const titleTreeItem: vscode.TreeItem = {
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            label: this.pullRequest.title,
            tooltip: this.pullRequest.title
        };
        pullRequestTreeItems.push(titleTreeItem);

        // Description
        const descriptionTreeItem: vscode.TreeItem = {
            label: 'Description',
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded
        };
        pullRequestTreeItems.push(descriptionTreeItem);

        // Work Items
        const workItemsTreeItem: vscode.TreeItem = {
            label: 'Work Items',
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
        pullRequestTreeItems.push(workItemsTreeItem);

        const policiesTreeItem: vscode.TreeItem = {
            label: 'Required Policies',
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
        pullRequestTreeItems.push(policiesTreeItem);

        // Reviewers
        const reviewersTreeItem: vscode.TreeItem = {
            label: 'Reviewers',
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded
        };
        pullRequestTreeItems.push(reviewersTreeItem);

        // Commits
        const commitsTreeItem: vscode.TreeItem = {
            label: 'Commits',
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
        pullRequestTreeItems.push(commitsTreeItem);

        // Overall Comments
        const overallComments: vscode.TreeItem = {
            label: 'Overall Comments',
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
        pullRequestTreeItems.push(overallComments);

        // Files
        const filesTreeItem: vscode.TreeItem = {
            label: 'Files',
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded
        };
        pullRequestTreeItems.push(filesTreeItem);

        return pullRequestTreeItems;
    }

    /**
     * Register pull request command if it hasn't already
     *
     * @private
     * @memberof PullRequestsProvider
     */
    private registerOpenLinkCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestsExplorer.openLink');
            if (!command && !this.openLinkCommand) {
                this.openLinkCommand = vscode.commands.registerCommand('pullRequestsExplorer.openLink', async (url: string) => {
                    PullRequestReviewerTreeProvider.openLinkInBrowser(url);
                });
            }
        });
    }

}

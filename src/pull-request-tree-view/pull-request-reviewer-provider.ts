import { ResourceRef } from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import { Comment, CommentPosition, CommentThreadContext, CommentThreadStatus, GitItem, GitPullRequest, GitPullRequestChange, GitPullRequestCommentThread, PullRequestStatus, VersionControlChangeType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { PolicyEvaluationRecord } from 'azure-devops-node-api/interfaces/PolicyInterfaces';
import { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import * as fs from 'fs';
import * as lodash from 'lodash';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CommentTreeItem } from '../models/comment-tree-item';
import { FileTreeItem } from '../models/file-tree-item';
import { FolderTreeItem } from '../models/folder-tree-item';
import { Identity } from '../models/identity-response.model';
import { PullRequestComment } from '../models/pull-request-comment.model';
import { PullRequestVote } from '../models/pull-request-vote.model';
import { RecentWorkItem } from '../models/recent-work-item-response.model';
import { DiffCommentService } from '../services/diff-comment.service';
import { PullRequestsService } from '../services/pull-request.service';
import { AvatarUtility } from '../utilities/avatar.utility';
import { FilePathUtility } from '../utilities/file-path.utility';
import { IconUtility } from '../utilities/icon.utility';
import { TreeItemUtility } from '../utilities/tree-item.utility';
import { DiffTextDocumentContentProvider } from './diff-text-document-content-provider';
import { PullRequestsProvider } from './pull-request-provider';

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
    private addRequiredReviewerCommand: vscode.Disposable | undefined;
    private addOptionalReviewerCommand: vscode.Disposable | undefined;
    private refreshCommand: vscode.Disposable | undefined;
    private removeReviewerCommand: vscode.Disposable | undefined;
    private addWorkItemCommand: vscode.Disposable | undefined;
    private removeWorkItemCommand: vscode.Disposable | undefined;
    private searchWorkItemCommand: vscode.Disposable | undefined;
    private abandonPullRequestCommand: vscode.Disposable | undefined;
    private reactivatePullRequestCommand: vscode.Disposable | undefined;
    private markAsDraftPullRequestCommand: vscode.Disposable | undefined;
    private publishPullRequestCommand: vscode.Disposable | undefined;
    private completePullRequestCommand: vscode.Disposable | undefined;

    private readonly diffCommentService: DiffCommentService;
    private readonly avatarUtility: AvatarUtility;
    private readonly treeItemUtility: TreeItemUtility;

    constructor(
        private pullRequest: GitPullRequest,
        public readonly threads: GitPullRequestCommentThread[],
        private readonly pullRequestsService: PullRequestsService
    ) {
        this.diffCommentService = new DiffCommentService(threads, pullRequestsService.user);
        this.setCommands();
        this.setOnDidChangeActiveEditorCallback();
        this.avatarUtility = new AvatarUtility(this.pullRequestsService);
        this.treeItemUtility = new TreeItemUtility(this.avatarUtility);
    }

    /**
     * Refresh the entire pull request view.
     *
     * @memberof PullRequestReviewerTreeProvider
     */
    public refreshPullRequestTree(): void {
        this._onDidChangeTreeData.fire(undefined);
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
                return this.createPullRequestReviewTree(
                    this.pullRequest?.createdBy?.displayName,
                    this.pullRequest.status ?? PullRequestStatus.NotSet,
                    this.pullRequest.isDraft ?? false
                );
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
                const workItemTreeItems: vscode.TreeItem[] = [];
                for (const workItem of workItems) {
                    if (workItem.fields && workItem.url) {
                        const iconData: string = await this.pullRequestsService.getWorkItemIcon(workItem.fields['System.WorkItemType']);
                        const iconUri: vscode.Uri = vscode.Uri.parse(`data:image/svg+xml;base64,${iconData}`);
                        workItemTreeItems.push({
                            id: workItem.id?.toString(),
                            label: workItem.fields['System.Title'],
                            contextValue: 'removeWorkItem',
                            collapsibleState: vscode.TreeItemCollapsibleState.None,
                            command: {
                                title: '',
                                command: 'pullRequestsExplorer.openLink',
                                arguments: [workItem._links?.html?.href ?? '']
                            },
                            iconPath: iconUri
                        });
                    }
                }
                return workItemTreeItems || [];
            }
            return [
                {
                    label: 'No work items'
                }
            ];
        }

        if (element.label === 'Policies') {
            const policyTreeItems: vscode.TreeItem[] = [];
            if (this.pullRequest.pullRequestId) {
                const records: PolicyEvaluationRecord[] = await this.pullRequestsService.getPolicyEvaluations(this.pullRequest.pullRequestId);
                for (const record of records) {
                    policyTreeItems.push({
                        label: record.configuration?.type?.displayName,
                        iconPath: IconUtility.getPolicyStatusIcon(record.status),
                        description: record.configuration?.isBlocking ? 'Required' : 'Optional'
                    });
                }
            }

            if (policyTreeItems.length === 0) {
                policyTreeItems.push({
                    label: 'No policies'
                });
            }
            return policyTreeItems;
        }

        if (element.label === 'Required Reviewers') {
            const reviewers: vscode.TreeItem[] = [];
            if (this.pullRequest.reviewers) {
                for (const reviewer of this.pullRequest.reviewers.filter(s => s.isRequired)) {
                    reviewers.push({
                        id: reviewer.id,
                        contextValue: 'removeReviewer',
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        label: reviewer.displayName,
                        description: PullRequestsProvider.getVoteText(reviewer.vote as PullRequestVote),
                        iconPath: await this.avatarUtility.getProfilePicFromId(reviewer.id, reviewer.displayName)
                    });
                }
            }
            if (reviewers.length === 0) {
                reviewers.push({
                    label: 'No required reviewers'
                });
            }
            return reviewers;
        }

        if (element.label === 'Optional Reviewers') {
            const reviewers: vscode.TreeItem[] = [];
            if (this.pullRequest.reviewers) {
                for (const reviewer of this.pullRequest.reviewers.filter(s => !s.isRequired)) {
                    reviewers.push({
                        id: reviewer.id,
                        contextValue: 'removeReviewer',
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        label: reviewer.displayName,
                        description: PullRequestsProvider.getVoteText(reviewer.vote as PullRequestVote),
                        iconPath: await this.avatarUtility.getProfilePicFromId(reviewer.id, reviewer.displayName)
                    });
                }
            }
            if (reviewers.length === 0) {
                reviewers.push({
                    label: 'No optional reviewers'
                });
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
                        },
                        iconPath: new vscode.ThemeIcon('git-commit')
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
                        commentsTreeItems.push(
                            new CommentTreeItem(
                                firstComment,
                                thread,
                                await this.avatarUtility.getProfilePicFromId(firstComment.author?.id, firstComment.author?.displayName)
                            )
                        );
                    }
                }
            }

            if (commentsTreeItems.length === 0) {
                return [{
                    label: 'No comments'
                }];
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
                            iconPath: await this.avatarUtility.getProfilePicFromId(comment.author?.id)
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
                if (fileChanges?.length) {
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
                            command,
                            element.pullRequestChanges
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
                        const command: vscode.Command = {
                            title: '',
                            command: 'pullRequestsExplorer.openFileDiff',
                            arguments: [
                                element.pullRequestChanges?.find((value: GitPullRequestChange) => value.item?.path === thread.threadContext?.filePath),
                                thread
                            ]
                        };
                        commentsTreeItems.push(
                            new CommentTreeItem(
                                firstComment,
                                thread,
                                await this.avatarUtility.getProfilePicFromId(firstComment.author?.id, firstComment.author?.displayName),
                                thread.comments && thread.comments?.length > 1,
                                command
                            )
                        );
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
        this.registerAddRequiredReviewerCommand();
        this.registerAddOptionalReviewerCommand();
        this.registerRemoveReviewer();
        this.registerRefreshViewCommand();
        this.registerAddWorkItemCommand();
        this.registerRemoveWorkItemCommand();
        this.registerSearchWorkItemCommand();
        this.registerAbandonPullRequestCommand();
        this.registerReactivatePullRequestCommand();
        this.registerMarkAsDraftPullRequestCommand();
        this.registerPublishPullRequestCommand();
        this.registerCompletePullRequestCommand();
    }

    public registerCompletePullRequestCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.setStatusComplete');
            if (!command && !this.completePullRequestCommand) {
                this.completePullRequestCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.setStatusComplete', this.onCompletePullRequest);
            }
        });
    }

    public registerAbandonPullRequestCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.setStatusAbandoned');
            if (!command && !this.abandonPullRequestCommand) {
                this.abandonPullRequestCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.setStatusAbandoned', this.onAbandonPullRequest);
            }
        });
    }

    public registerReactivatePullRequestCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.setStatusReactivated');
            if (!command && !this.reactivatePullRequestCommand) {
                this.reactivatePullRequestCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.setStatusReactivated', this.onReactivatePullRequest);
            }
        });
    }

    public registerMarkAsDraftPullRequestCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.setStatusDraft');
            if (!command && !this.markAsDraftPullRequestCommand) {
                this.markAsDraftPullRequestCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.setStatusDraft', this.onMarkAsDraftPullRequest);
            }
        });
    }

    public registerPublishPullRequestCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.setStatusPublished');
            if (!command && !this.publishPullRequestCommand) {
                this.publishPullRequestCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.setStatusPublished', this.onPublishPullRequest);
            }
        });
    }

    public registerSearchWorkItemCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.searchWorkItem');
            if (!command && !this.searchWorkItemCommand) {
                this.searchWorkItemCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.searchWorkItem', this.onSearchWorkItem);
            }
        });
    }

    public registerRemoveWorkItemCommand(): void {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.removeWorkItem');
            if (!command && !this.removeWorkItemCommand) {
                this.removeWorkItemCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.removeWorkItem', this.onRemoveWorkItem);
            }
        });
    }

    public registerAddWorkItemCommand() {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.addWorkItem');
            if (!command && !this.addWorkItemCommand) {
                this.addWorkItemCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.addWorkItem', this.onAddWorkItem);
            }
        });
    }

    public registerAddRequiredReviewerCommand() {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.addRequiredReviewer');
            if (!command && !this.addRequiredReviewerCommand) {
                this.addRequiredReviewerCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.addRequiredReviewer', this.onAddRequiredReviewer);
            }
        });
    }

    public registerAddOptionalReviewerCommand() {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.addOptionalReviewer');
            if (!command && !this.addOptionalReviewerCommand) {
                this.addOptionalReviewerCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.addOptionalReviewer', this.onAddOptionalReviewer);
            }
        });
    }

    public registerRemoveReviewer() {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.removeReviewer');
            if (!command && !this.removeReviewerCommand) {
                this.removeReviewerCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.removeReviewer', this.onRemoveReviewer);
            }
        });
    }

    public registerRefreshViewCommand() {
        vscode.commands.getCommands(true).then((value: string[]) => {
            const command: string | undefined = value.find(s => s === 'pullRequestReviewPanel.refresh');
            if (!command && !this.refreshCommand) {
                this.refreshCommand =
                    vscode.commands.registerCommand('pullRequestReviewPanel.refresh', this.onRefreshView);
            }
        });
    }


    /**
     * Dispose of all commands
     *
     * @memberof CodeReviewerProvider
     */
    public async disposeCommands(): Promise<void> {
        this.completeCodeReviewCommand?.dispose();
        this.approveCommand?.dispose();
        this.approveWithSuggestionsCommand?.dispose();
        this.rejectCommand?.dispose();
        this.openLinkCommand?.dispose();
        this.openDiffCommand?.dispose();
        this.replyCommand?.dispose();
        this.editCommand?.dispose();
        this.updateCommentCommand?.dispose();
        this.deleteCommentCommand?.dispose();
        this.createThreadCommand?.dispose();
        this.onDidChangeEditorCommand?.dispose();
        this.submitFirstThreadCommentCommand?.dispose();
        this.resolveStatusCommand?.dispose();
        this.reactivateStatusCommand?.dispose();
        this.likeCommentCommand?.dispose();
        this.unlikeCommentCommand?.dispose();
        this.addRequiredReviewerCommand?.dispose();
        this.removeReviewerCommand?.dispose();
        this.addOptionalReviewerCommand?.dispose();
        this.refreshCommand?.dispose();
        this.addWorkItemCommand?.dispose();
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

    private readonly onCompletePullRequest = async (): Promise<void> => {
        if (!this.pullRequest?.pullRequestId) {
            return;
        }
        const lastCommitId: string | undefined = this.pullRequest.commits?.[0].commitId;
        if (!lastCommitId) {
            return;
        }
        await this.pullRequestsService.setPullRequestStatus(
            this.pullRequest.pullRequestId,
            PullRequestStatus.Completed,
            lastCommitId
        );
        this.refreshPullRequestTree();
    }

    private readonly onAbandonPullRequest = async (): Promise<void> => {
        if (!this.pullRequest?.pullRequestId) {
            return;
        }
        await this.pullRequestsService.setPullRequestStatus(this.pullRequest.pullRequestId, PullRequestStatus.Abandoned);
        this.refreshPullRequestTree();
    }

    private readonly onReactivatePullRequest = async (): Promise<void> => {
        if (!this.pullRequest?.pullRequestId) {
            return;
        }
        await this.pullRequestsService.setPullRequestStatus(this.pullRequest.pullRequestId, PullRequestStatus.Active);
        this.refreshPullRequestTree();
    }

    private readonly onRemoveReviewer = async (...args: any[]) => {
        if (this.pullRequest.pullRequestId) {
            await this.pullRequestsService.removeReviewer(this.pullRequest.pullRequestId, args[0].id);
        }
        this.refreshPullRequestTree();
    }

    private readonly onMarkAsDraftPullRequest = async (...args: any[]) => {
        if (this.pullRequest.pullRequestId) {
            await this.pullRequestsService.markAsDraft(this.pullRequest.pullRequestId, true);
        }
        this.refreshPullRequestTree();
    }

    private readonly onPublishPullRequest = async (...args: any[]) => {
        if (this.pullRequest.pullRequestId) {
            await this.pullRequestsService.markAsDraft(this.pullRequest.pullRequestId, false);
        }
        this.refreshPullRequestTree();
    }

    private readonly onSearchWorkItem = async (...args: any[]) => {
        // Show the search work item dialog
        // tslint:disable-next-line: await-promise
        const value: string | undefined = await vscode.window.showInputBox({
            prompt: 'Enter a work item id or search by text',
            title: 'Search for work item',
        });

        if (!value) { return; }

        const workItems: WorkItem[] = await this.pullRequestsService.searchWorkItemsByIdOrTitle(value);
        // Show a selection list of work items
        if (workItems.length > 0) {
            // tslint:disable-next-line: await-promise
            const selection = await vscode.window.showQuickPick(workItems.map((workItem: WorkItem) => ({
                label: workItem.fields?.['System.Title'] ?? '',
                description: workItem.fields?.['System.AssignedTo'] ?? '',
                detail: workItem.fields?.['System.WorkItemType'] ?? '',
                id: workItem.id
            })), {
                placeHolder: 'Select a work item',
            });
            // If a work item was selected, add it to the pull request
            if (selection?.id && this.pullRequest?.artifactId) {
                await this.pullRequestsService.addWorkItem(this.pullRequest.artifactId, selection.id);
                this.refreshPullRequestTree();
            }
            return;
        }
        vscode.window.showErrorMessage('No work items found');
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
     * request tree view and the pull request commands have been removed.
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

    private readonly onDeleteComment = async (comment: PullRequestComment): Promise<void> => {
        await this.deleteComment(comment);
    }

    private readonly onEdit = async (comment: PullRequestComment): Promise<void> => {
        await this.enterCommentEditMode(comment);
    }

    private readonly onUpdateComment = async (comment: PullRequestComment): Promise<void> => {
        await this.updateComment(comment);
    }

    private readonly onAddWorkItem = async (): Promise<void> => {
        try {
            const items: RecentWorkItem[] = await this.pullRequestsService.getWorkItemsForUser();
            // Filter out the work items that are already in the pull request
            const filteredItems: RecentWorkItem[] = this.pullRequest.workItemRefs?.length ?
                items.filter((item: RecentWorkItem) => this.pullRequest.workItemRefs?.findIndex(workItem => workItem?.id === item.id.toString()) === -1) :
                items;
            const quickPick: vscode.QuickPick<vscode.QuickPickItem> = vscode.window.createQuickPick();
            quickPick.items = filteredItems.map(s => ({
                label: s.title,
                description: s.assignedTo?.name ?? '',
                detail: s.workItemType,
                id: s.id
            }));
            quickPick.onDidChangeSelection(async selections => {
                if (selections?.[0] && this.pullRequest?.artifactId) {
                    const workItem: vscode.QuickPickItem = selections[0];
                    await this.pullRequestsService.addWorkItem(this.pullRequest.artifactId, (workItem as any).id);
                    quickPick.dispose();
                    // Refresh the tree
                    this.refreshPullRequestTree();
                }
            });
            quickPick.show();

        } catch (error) {
            //
        }
    }

    private readonly onRemoveWorkItem = async (value: vscode.TreeItem): Promise<void> => {
        if (value.contextValue === 'removeWorkItem' && this.pullRequest?.artifactId && value.id) {
            const workItem: WorkItem = value as WorkItem;
            await this.pullRequestsService.removeWorkItem(workItem.id);
            // Refresh the tree
            this.refreshPullRequestTree();
        }
    }


    private readonly onUpdateStatus = async (thread: vscode.CommentThread): Promise<void> => {
        if (thread.contextValue && this.pullRequest.pullRequestId && thread.comments.length > 0) {
            const status: CommentThreadStatus = parseInt(thread.contextValue, 10);
            if (status === CommentThreadStatus.Active) {
                await this.pullRequestsService.updateCommentStatus(CommentThreadStatus.Fixed,
                    this.pullRequest.pullRequestId,
                    (thread.comments[0] as PullRequestComment).threadId
                );
                thread.contextValue = CommentThreadStatus.Fixed.toString();
            } else if (status === CommentThreadStatus.Fixed) {
                await this.pullRequestsService.updateCommentStatus(CommentThreadStatus.Active,
                    this.pullRequest.pullRequestId,
                    (thread.comments[0] as PullRequestComment).threadId
                );
                thread.contextValue = CommentThreadStatus.Active.toString();
            }
        }
    }

    private readonly onLikeComment = async (comment: PullRequestComment): Promise<void> => {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !comment.parent || !this.pullRequest.pullRequestId) {
            return;
        }

        await this.pullRequestsService.likeComment(this.pullRequest.pullRequestId, comment.threadId, comment.commentId);
        thread.comments = comment.parent.comments.map(cmt => {
            if ((cmt as PullRequestComment).commentId === comment.commentId) {
                cmt.contextValue = comment.contextValue.replace('Like', 'Unlike');
            }

            return cmt;
        });
    }

    private readonly onUnlikeComment = async (comment: PullRequestComment): Promise<void> => {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !comment.parent || !this.pullRequest.pullRequestId) {
            return;
        }

        await this.pullRequestsService.unlikeComment(this.pullRequest.pullRequestId, comment.threadId, comment.commentId);
        thread.comments = comment.parent.comments.map(cmt => {
            if ((cmt as PullRequestComment).commentId === comment.commentId) {
                cmt.contextValue = comment.contextValue.replace('Unlike', 'Like');
            }

            return cmt;
        });
    }

    private readonly onAddRequiredReviewer = async (value: vscode.TreeItem): Promise<void> => {
        await this.showAddReviewerPicker(true);
    }

    private readonly onAddOptionalReviewer = async (value: vscode.TreeItem): Promise<void> => {
        await this.showAddReviewerPicker(false);
    }

    private readonly onRefreshView = async (value: vscode.TreeItem): Promise<void> => {
        this.refreshPullRequestTree();
    }

    private async showAddReviewerPicker(isRequired: boolean = false): Promise<void> {
        if (!this.pullRequest?.pullRequestId) {
            return;
        }
        const allReviewers: Identity[] = await this.pullRequestsService.getPossiblePullRequestReviewers('', this.pullRequest?.pullRequestId);
        const quickPick: vscode.QuickPick<vscode.QuickPickItem> = vscode.window.createQuickPick();
        const names: vscode.QuickPickItem[] = allReviewers.map(s => ({
            label: s.displayName ?? '',
            id: s.localId ?? '',
            detail: s.mail
        }));
        quickPick.items = names;
        quickPick.onDidChangeValue(async value => {
            await this.getListOfReviewers(quickPick, value);
        });
        quickPick.onDidChangeSelection(async selections => {
            if (selections[0] && this.pullRequest?.pullRequestId) {
                await this.pullRequestsService.addPullRequestReviewer((selections[0] as any).id, this.pullRequest.pullRequestId, isRequired);
                this.refreshPullRequestTree();
                quickPick.value = '';
                await this.getListOfReviewers(quickPick, '');
            }
        });

        quickPick.show();
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

        const newComment: PullRequestComment = new PullRequestComment(
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

    private async getListOfReviewers(quickPick: vscode.QuickPick<vscode.QuickPickItem>, value: string) {
        quickPick.busy = true;
        const reviewers: Identity[] = await this.pullRequestsService.getPossiblePullRequestReviewers(value, this.pullRequest.pullRequestId!);
        const names: vscode.QuickPickItem[] = reviewers.map(s => ({
            label: s.displayName ?? '',
            id: s.localId ?? '',
            detail: s.mail
        }));
        quickPick.items = names;
        quickPick.busy = false;
    }

    /**
     * Delete comment from the pull request thread on the server and locally.
     *
     * @private
     * @param {PullRequestComment} comment
     * @returns {Promise<void>}
     * @memberof PullRequestReviewerTreeProvider
     */
    private async deleteComment(comment: PullRequestComment): Promise<void> {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !this.changesetVersionDiffEditor || !this.previousVersionDiffEditor) {
            return;
        }

        if (this.pullRequest.pullRequestId) {
            await this.pullRequestsService.deleteComment(comment.commentId, comment.threadId, this.pullRequest.pullRequestId);

            const commentDeletedMarkdownText: string = '*Comment Deleted*';

            thread.comments = thread.comments.map((value: vscode.Comment) => {
                if ((value as PullRequestComment).commentId === comment.commentId) {
                    const deletedMarkdownText: vscode.MarkdownString = new vscode.MarkdownString(commentDeletedMarkdownText);
                    const deletedComment: PullRequestComment = new PullRequestComment(comment.originalComment,
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
     * @param {PullRequestComment} comment
     * @returns {Promise<void>}
     * @memberof PullRequestReviewerTreeProvider
     */
    private async enterCommentEditMode(comment: PullRequestComment): Promise<void> {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !comment.parent) {
            return;
        }

        thread.comments = comment.parent.comments.map(cmt => {
            if ((cmt as PullRequestComment).commentId === comment.commentId) {
                cmt.mode = vscode.CommentMode.Editing;
            }

            return cmt;
        });
    }

    /**
     * Update a comment on the server and locally
     *
     * @private
     * @param {PullRequestComment} comment
     * @returns {Promise<void>}
     * @memberof PullRequestReviewerTreeProvider
     */
    private async updateComment(comment: PullRequestComment): Promise<void> {
        const thread: vscode.CommentThread | undefined = comment.parent;

        if (!thread || !this.changesetVersionDiffEditor || !this.previousVersionDiffEditor || !comment.body) {
            return;
        }

        if (this.pullRequest.pullRequestId) {
            const commentToEdit: vscode.Comment | undefined = thread.comments.find(value => (value as PullRequestComment).commentId === comment.commentId);

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

            const commentToAdd: PullRequestComment = new PullRequestComment(
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
                if ((value as PullRequestComment).commentId === commentToAdd.commentId) {
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
            const threadId: number = (reply.thread.comments[0] as PullRequestComment).threadId;
            const newComment: Comment | undefined =
                await this.pullRequestsService.replyToComment(reply.text, threadId, this.pullRequest.pullRequestId);
            if (newComment && newComment.id) {
                const replyComment: PullRequestComment = new PullRequestComment(
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
                        await this.pullRequestsService.setPullRequestVote(PullRequestVote.WaitingForAuthor, this.pullRequest.pullRequestId);
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
                        await this.pullRequestsService.setPullRequestVote(PullRequestVote.Approved, this.pullRequest.pullRequestId);
                        vscode.commands.executeCommand('workbench.view.scm');
                    }
                });
            }
        });
    }

    /**
     * Set command to mark a code review to 'Looks Good'
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
                        await this.pullRequestsService.setPullRequestVote(PullRequestVote.ApprovedWithSuggestions, this.pullRequest.pullRequestId);
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
                        await this.pullRequestsService.setPullRequestVote(PullRequestVote.Rejected, this.pullRequest.pullRequestId);
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
    private readonly setDiffEditorsCallback = async (commentThread?: GitPullRequestCommentThread) => {
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
                if (commentThread?.threadContext?.rightFileStart?.line &&
                    commentThread.threadContext.rightFileStart.offset &&
                    commentThread.threadContext?.rightFileEnd?.line &&
                    commentThread.threadContext.rightFileEnd?.offset
                ) {
                    const startPos: vscode.Position
                        = new vscode.Position(commentThread.threadContext.rightFileStart?.line - 1, commentThread.threadContext.rightFileStart.offset - 1);
                    const endPos: vscode.Position =
                        new vscode.Position(commentThread.threadContext.rightFileEnd.line - 1, commentThread.threadContext.rightFileEnd.offset - 1);
                    const range: vscode.Range = new vscode.Range(startPos, endPos);
                    this.changesetVersionDiffEditor?.revealRange(range);
                }
                if (commentThread?.threadContext?.leftFileStart?.line &&
                    commentThread.threadContext.leftFileStart.offset &&
                    commentThread.threadContext?.leftFileEnd?.line &&
                    commentThread.threadContext.leftFileEnd?.offset
                ) {
                    const startPos: vscode.Position
                        = new vscode.Position(commentThread.threadContext.leftFileStart?.line - 1, commentThread.threadContext.leftFileStart.offset - 1);
                    const endPos: vscode.Position =
                        new vscode.Position(commentThread.threadContext.leftFileEnd.line - 1, commentThread.threadContext.leftFileEnd.offset - 1);
                    const range: vscode.Range = new vscode.Range(startPos, endPos);
                    this.previousVersionDiffEditor?.revealRange(range);
                }
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
    private async showFileDiff(file: GitPullRequestChange, commentThread?: GitPullRequestCommentThread): Promise<void> {
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
                    lastPathFragment,
                    commentThread
                );
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
    private readonly onDiffSelection = async (file: GitPullRequestChange, commentThread?: GitPullRequestCommentThread): Promise<void> => {
        await this.showFileDiff(file, commentThread);
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
        lastPathFragment: string | undefined,
        commentThread?: GitPullRequestCommentThread
    ): Promise<void> {
        fs.writeFileSync(leftDiffFilePath, leftContent);
        fs.writeFileSync(rightDiffFilePath, rightContent);
        const leftUri: vscode.Uri = vscode.Uri.parse(`${DiffTextDocumentContentProvider.pullRequestDiffScheme}:${leftDiffFilePath}`);
        const rightUri: vscode.Uri = vscode.Uri.parse(`${DiffTextDocumentContentProvider.pullRequestDiffScheme}:${rightDiffFilePath}`);
        await this.closeDiffEditors();
        await this.executeDiffCommand(leftUri, rightUri, lastPathFragment, commentThread);
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
    private async executeDiffCommand(
        leftUri: vscode.Uri,
        rightUri: vscode.Uri,
        lastPathFragment: string | undefined,
        commentThread?: GitPullRequestCommentThread
    ): Promise<void> {
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, lastPathFragment, commentThread);
        await this.setDiffEditorsCallback(commentThread);
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
    private async createPullRequestReviewTree(userName: string = '', status: PullRequestStatus, isDraft: boolean): Promise<vscode.TreeItem[]> {
        const pullRequestTreeItems: vscode.TreeItem[] = [];

        const label: string = `${userName}`;
        const pullRequestStatus: string = isDraft ? 'Draft' : `${PullRequestStatus[status]}`;
        const isAbandoned: boolean = status === PullRequestStatus.Abandoned;
        const isCompleted: boolean = status === PullRequestStatus.Completed;
        vscode.commands.executeCommand('setContext', 'isDraftPullRequest', isDraft);
        vscode.commands.executeCommand('setContext', 'isAbandonedPullRequest', isAbandoned);
        vscode.commands.executeCommand('setContext', 'isCompletedPullRequest', isCompleted);
        const userId: string = this.pullRequest?.createdBy?.id as string;

        // User
        pullRequestTreeItems.push(await this.treeItemUtility.getCreatedByStatusTreeItem(
            label,
            userId,
            pullRequestStatus,
            this.pullRequest.createdBy?.displayName
        ));

        const sourceRefName: string = this.pullRequest.sourceRefName ?? '';
        const targetRefName: string = this.pullRequest.targetRefName ?? '';

        // Branches
        pullRequestTreeItems.push(this.treeItemUtility.getBranchesToMergeTreeItem(sourceRefName, targetRefName));

        const pullRequestTitle: string = `${this.pullRequest.pullRequestId} - ${this.pullRequest.title}`;

        // Title
        pullRequestTreeItems.push(this.treeItemUtility.createPullRequestTitleTreeItem(pullRequestTitle));

        // Description
        pullRequestTreeItems.push(this.treeItemUtility.getBasicExpandedTreeItem('Description'));

        const workItemsTreeItem: vscode.TreeItem = this.treeItemUtility.getBasicExpandedTreeItem('Work Items');
        workItemsTreeItem.contextValue = 'addWorkItem';

        // Work Items
        pullRequestTreeItems.push(workItemsTreeItem);

        // Policies
        pullRequestTreeItems.push(this.treeItemUtility.getBasicCollapsedTreeItem('Policies'));

        const requiredReviewersTreeItem: vscode.TreeItem = this.treeItemUtility.getBasicExpandedTreeItem('Required Reviewers');
        requiredReviewersTreeItem.contextValue = 'addRequiredReviewer';

        // Required Reviewers
        pullRequestTreeItems.push(requiredReviewersTreeItem);

        const optionalReviewersTreeItem: vscode.TreeItem = this.treeItemUtility.getBasicExpandedTreeItem('Optional Reviewers');
        optionalReviewersTreeItem.contextValue = 'addOptionalReviewer';

        // Optional Reviewers
        pullRequestTreeItems.push(optionalReviewersTreeItem);

        // Commits
        pullRequestTreeItems.push(this.treeItemUtility.getBasicCollapsedTreeItem('Commits'));

        // Overall Comments
        pullRequestTreeItems.push(this.treeItemUtility.getBasicCollapsedTreeItem('Overall Comments'));

        // Files
        pullRequestTreeItems.push(this.treeItemUtility.getBasicExpandedTreeItem('Files'));

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

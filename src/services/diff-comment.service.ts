import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as vscode from 'vscode';
import { PullRequestComment as PullRequestComment } from '../models/pull-request-comment.model';

export class DiffCommentService {

    /**
     * Getter for the last selected code review diff that was selected
     * from the code review file tree
     *
     * @type {string}
     * @memberof DiffDecorationService
     */
    public get lastSelectedDiffFilePath(): string {
        return this._lastSelectedDiffFilePath;
    }

    /**
     * Setter to set the last selected code review diff that was selected
     * from the code review file tree
     *
     * @memberof DiffDecorationService
     */
    public set lastSelectedDiffFilePath(value: string) {
        this._lastSelectedDiffFilePath = value;
    }

    public get selectedRange(): vscode.Range | undefined {
        return this._selectedRange;
    }

    public set selectedRange(v: vscode.Range | undefined) {
        this._selectedRange = v;
    }

    private _lastSelectedDiffFilePath: string = '';

    // Comment controllers
    private commentController: vscode.CommentController | undefined;

    // Comment threads
    private readonly leftCommentThreads: vscode.CommentThread[] = [];
    private readonly rightCommentThreads: vscode.CommentThread[] = [];

    // Ranges that are stored off for commenting code when creating a new thread
    private _selectedRange: vscode.Range | undefined;

    private readonly decorationTypes: Map<number, vscode.TextEditorDecorationType> = new Map();

    constructor(
        public threads: GitPullRequestCommentThread[],
        private readonly user: any
    ) {
        //
    }

    /**
     * Show a thread popup
     *
     * @param {vscode.Uri} uri
     * @param {vscode.Range} range
     * @memberof DiffCommentService
     */
    public createThread(uri: vscode.Uri, range: vscode.Range): void {
        const commentThread: vscode.CommentThread | undefined = this.commentController?.createCommentThread(uri, range, []);

        if (!commentThread) {
            return;
        }

        commentThread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    }

    /**
     * Set the comments in the diff editors
     *
     * @memberof DiffCommentService
     */
    public async setCommentsInDiffEditors(leftEditor: vscode.TextEditor, rightEditor: vscode.TextEditor): Promise<void> {
        const comments: GitPullRequestCommentThread[] = this.getCommentsForFilePath();
        this.setDecorationsForEditor(leftEditor, rightEditor, comments);
        this.createCommentControllersAndSetThreads(leftEditor, rightEditor, comments);
    }

    /**
     * Get the comments for the currently selected file diff
     *
     * @memberof DiffCommentService
     */
    public getCommentsForFilePath(): GitPullRequestCommentThread[] {
        const comments: GitPullRequestCommentThread[] = [];

        for (const thread of this.threads) {
            if (thread.threadContext?.filePath === this.lastSelectedDiffFilePath) {
                comments.push(thread);
            }
        }
        return comments;
    }

    /**
     * Highlight all the comments for a diff editor
     *
     * @memberof DiffDecorationService
     * @param leftEditor
     * @param rightEditor
     * @param commentThreads
     */
    public setDecorationsForEditor(leftEditor: vscode.TextEditor, rightEditor: vscode.TextEditor, commentThreads: GitPullRequestCommentThread[]): void {
        for (const thread of commentThreads) {
            if (thread.id &&
                thread.threadContext &&
                thread.threadContext.leftFileStart &&
                thread.threadContext.leftFileEnd &&
                thread.threadContext.leftFileStart.line !== undefined &&
                thread.threadContext.leftFileStart.offset !== undefined &&
                thread.threadContext.leftFileEnd.line !== undefined &&
                thread.threadContext.leftFileEnd.offset !== undefined &&
                !thread.isDeleted
            ) {
                const startPos: vscode.Position
                    = new vscode.Position(thread.threadContext.leftFileStart.line - 1, thread.threadContext.leftFileStart.offset - 1);
                const endPos: vscode.Position =
                    new vscode.Position(thread.threadContext.leftFileEnd.line - 1, thread.threadContext.leftFileEnd.offset - 1);
                const hoverMessage: string = thread.comments && thread.comments[0].content ? thread.comments[0].content : '';
                const decorator: vscode.TextEditorDecorationType = DiffCommentService.getDecorationStyle();
                this.decorationTypes.set(thread.id, decorator);
                leftEditor.setDecorations(decorator, [{ range: new vscode.Range(startPos, endPos), hoverMessage }]);
            }
            if (thread.id &&
                thread.threadContext &&
                thread.threadContext.rightFileStart &&
                thread.threadContext.rightFileEnd &&
                thread.threadContext.rightFileStart.line !== undefined &&
                thread.threadContext.rightFileStart.offset !== undefined &&
                thread.threadContext.rightFileEnd.line !== undefined &&
                thread.threadContext.rightFileEnd.offset !== undefined &&
                !thread.isDeleted
            ) {
                const startPos: vscode.Position
                    = new vscode.Position(thread.threadContext.rightFileStart.line - 1, thread.threadContext.rightFileStart.offset - 1);
                const endPos: vscode.Position =
                    new vscode.Position(thread.threadContext.rightFileEnd.line - 1, thread.threadContext.rightFileEnd.offset - 1);
                const hoverMessage: string = thread.comments && thread.comments[0].content ? thread.comments[0].content : '';
                const decorator: vscode.TextEditorDecorationType = DiffCommentService.getDecorationStyle();
                this.decorationTypes.set(thread.id, decorator);
                rightEditor.setDecorations(decorator, [{ range: new vscode.Range(startPos, endPos), hoverMessage }]);
            }
        }
    }

    /**
     * Remove the existing decoration and replace it with an empty one.
     *
     * @param threadId
     * @memberof DiffCommentService
     */
    public removeDecoration(threadId: number): void {
        const decoration: vscode.TextEditorDecorationType | undefined = this.decorationTypes.get(threadId);
        if (decoration) {
            decoration.dispose();
        }
    }

    /**
     * Dispose of the left diff and right diff editors.
     * Along with all the comment threads that were created for the diff
     *
     * @public
     * @memberof DiffCommentService
     */
    public disposeEditorsAndThreads(): void {
        for (const commentThread of this.leftCommentThreads) {
            commentThread.dispose();
        }
        for (const commentThread of this.rightCommentThreads) {
            commentThread.dispose();
        }
        this.commentController?.dispose();
    }

    /**
     * Iterate over all the threads and set them in the correct editor with comments
     *
     * @public
     * @param {GitPullRequestCommentThread[]} commentThreads
     * @param {vscode.TextEditor} leftEditor
     * @param {vscode.TextEditor} rightEditor
     * @memberof DiffCommentService
     */
    public setThreadsInEditors(commentThreads: GitPullRequestCommentThread[], leftEditor: vscode.TextEditor, rightEditor: vscode.TextEditor): void {
        for (const thread of commentThreads) {
            const threadId: string | undefined = thread.id?.toString();
            if (threadId && !thread.isDeleted) {
                if (thread.threadContext &&
                    thread.threadContext.leftFileStart &&
                    thread.threadContext.leftFileEnd &&
                    thread.threadContext.leftFileStart.line !== undefined &&
                    thread.threadContext.leftFileStart.offset !== undefined &&
                    thread.threadContext.leftFileEnd.line !== undefined &&
                    thread.threadContext.leftFileEnd.offset !== undefined) {
                    const startPos: vscode.Position = new vscode.Position(
                        thread.threadContext.leftFileStart.line - 1,
                        thread.threadContext.leftFileStart.offset - 1
                    );
                    const endPos: vscode.Position = new vscode.Position(thread.threadContext.leftFileEnd.line - 1, thread.threadContext.leftFileEnd.offset - 1);
                    const range: vscode.Range = new vscode.Range(startPos, endPos);
                    const comments: PullRequestComment[] = this.getCommentsForThread(thread);
                    const commentThread: vscode.CommentThread | undefined =
                        this.commentController?.createCommentThread(leftEditor.document.uri, range, comments);
                    for (const comment of comments) {
                        comment.parent = commentThread;
                    }
                    if (commentThread) {
                        commentThread.contextValue = thread.status?.toString();
                        this.leftCommentThreads.push(commentThread);
                    }
                }
                if (thread.threadContext &&
                    thread.threadContext.rightFileStart &&
                    thread.threadContext.rightFileEnd &&
                    thread.threadContext.rightFileStart.line !== undefined &&
                    thread.threadContext.rightFileStart.offset !== undefined &&
                    thread.threadContext.rightFileEnd.line !== undefined &&
                    thread.threadContext.rightFileEnd.offset !== undefined) {
                    const startPos: vscode.Position =
                        new vscode.Position(thread.threadContext.rightFileStart.line - 1, thread.threadContext.rightFileStart.offset - 1);
                    const endPos: vscode.Position =
                        new vscode.Position(thread.threadContext.rightFileEnd.line - 1, thread.threadContext.rightFileEnd.offset - 1);
                    const range: vscode.Range = new vscode.Range(startPos, endPos);
                    const comments: PullRequestComment[] = this.getCommentsForThread(thread);
                    const commentThread: vscode.CommentThread | undefined =
                        this.commentController?.createCommentThread(rightEditor.document.uri, range, comments);
                    for (const comment of comments) {
                        comment.parent = commentThread;
                    }
                    if (commentThread) {
                        commentThread.contextValue = thread.status?.toString();
                        this.rightCommentThreads.push(commentThread);
                    }
                }
            }
        }
    }

    /**
     * Set the decoration type for highlighting discussion comments
     *
     * @private
     * @returns {vscode.TextEditorDecorationType}
     * @memberof DiffDecorationService
     */
    private static getDecorationStyle(): vscode.TextEditorDecorationType {
        const theme: vscode.ThemableDecorationRenderOptions = {
            // this color will be used in dark color themes
            border: '2px solid #rgb(83, 163, 201)',
            backgroundColor: 'rgba(83, 163, 201, 0.7)'
        };
        return vscode.window.createTextEditorDecorationType({
            light: theme,
            dark: theme
        });
    }


    /**
     * Set comments controllers inside the diff editors
     *
     * @param {vscode.TextEditor} leftEditor
     * @param {vscode.TextEditor} rightEditor
     * @param {GitPullRequestCommentThread[]} commentThreads
     * @memberof DiffCommentService
     */
    private createCommentControllersAndSetThreads(
        leftEditor: vscode.TextEditor,
        rightEditor: vscode.TextEditor,
        commentThreads: GitPullRequestCommentThread[]
    ): void {
        this.disposeEditorsAndThreads();

        this.commentController = vscode.comments.createCommentController('PullRequestCommentController', 'Add Comment');
        this.commentController.commentingRangeProvider = {
            provideCommentingRanges: (document: vscode.TextDocument, token: vscode.CancellationToken) => {
                const lineCount: number = document.lineCount;
                return [new vscode.Range(0, 0, lineCount - 1, 0)];
            }
        };

        this.setThreadsInEditors(commentThreads, leftEditor, rightEditor);
    }

    /**
     * Iterate over all threads and return the comments in vscode comment form
     *
     * @private
     * @param {GitPullRequestCommentThread} thread
     * @returns
     * @memberof DiffCommentService
     */
    private getCommentsForThread(thread: GitPullRequestCommentThread): PullRequestComment[] {
        const comments: PullRequestComment[] = [];
        if (thread.comments && thread.id) {
            for (const comment of thread.comments) {
                if (comment.id) {
                    if (comment.isDeleted) {
                        const authorName: string = comment.author?.displayName ?? '';
                        const contextValue: string = '';
                        const pullRequestComment: PullRequestComment = new PullRequestComment(
                            comment,
                            thread.id,
                            comment.id,
                            new vscode.MarkdownString('*Comment Deleted*'),
                            vscode.CommentMode.Preview,
                            {
                                name: authorName,
                            },
                            contextValue
                        );
                        comments.push(pullRequestComment);
                    } else {
                        const authorName: string = comment.author?.displayName ?? '';
                        let contextValue: string = comment.author?.displayName === this.user.identity.DisplayName ? 'editable' : '';
                        contextValue += comment.usersLiked?.find(s => s.id === this.user.identity.TeamFoundationId) ? 'Unlike' : 'Like';
                        const markedDownText: vscode.MarkdownString = new vscode.MarkdownString(comment.content);
                        markedDownText.isTrusted = true;
                        const pullRequestComment: PullRequestComment = new PullRequestComment(
                            comment,
                            thread.id,
                            comment.id,
                            markedDownText,
                            vscode.CommentMode.Preview,
                            {
                                name: authorName,
                            },
                            contextValue
                        );
                        pullRequestComment.threadContext = thread.threadContext;

                        comments.push(pullRequestComment);
                    }
                }
            }
        }
        return comments;
    }
}

import { Comment as GitComment, CommentThreadContext } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { Comment, CommentAuthorInformation, CommentMode, CommentReaction, CommentThread, MarkdownString } from 'vscode';

export class PullRequestComment implements Comment {

    public reactions?: CommentReaction[] | undefined;
    public label?: string | undefined;
    public parent: CommentThread | undefined;
    public threadContext: CommentThreadContext | undefined;

    constructor(
        public originalComment: GitComment,
        public threadId: number,
        public commentId: number,
        public body: string | MarkdownString,
        public mode: CommentMode,
        public author: CommentAuthorInformation,
        public contextValue: string,
    ) {
        //
    }

}

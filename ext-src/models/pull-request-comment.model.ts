import { Comment, CommentReaction, MarkdownString, CommentMode, CommentAuthorInformation, CommentThread } from 'vscode';
import { CommentThreadContext, Comment as GitComment } from 'azure-devops-node-api/interfaces/GitInterfaces';

export class PullRequesetComment implements Comment {

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

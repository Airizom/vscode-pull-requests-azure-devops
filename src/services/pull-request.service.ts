import { IGitApi } from 'azure-devops-node-api/GitApi';
import { IHttpClientResponse } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import { Comment, CommentThreadContext, CommentThreadStatus, FileDiff, FileDiffsCriteria, GitItem, GitPullRequest, GitPullRequestChange, GitPullRequestCommentThread, GitPullRequestIteration, GitPullRequestIterationChanges, GitPullRequestStatus, GitRepository, GitVersionOptions, GitVersionType, IdentityRefWithVote, PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { PolicyEvaluationRecord } from 'azure-devops-node-api/interfaces/PolicyInterfaces';
import { Profile } from 'azure-devops-node-api/interfaces/ProfileInterfaces';
import { WorkItem, WorkItemErrorPolicy, WorkItemExpand, WorkItemType } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { IPolicyApi } from 'azure-devops-node-api/PolicyApi';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import * as vscode from 'vscode';
import { Identity, IdentityResponse } from '../models/identity-response.model';
import { PullRequestVote } from '../models/pull-request-vote.model';
import { RecentWorkItem, RecentWorkItemResponse } from '../models/recent-work-item-response.model';
import { ConfigManager } from '../utilities/config-manager';
import { AzureDevopsService } from './azure-devops.service';

export class PullRequestsService extends AzureDevopsService {

    public gitApi: IGitApi | undefined;
    public workItemTrackingApi: IWorkItemTrackingApi | undefined;
    public policyApi: IPolicyApi | undefined;

    public user: any | undefined;
    public currentRepoName: string = '';

    // Setting Azure Devops settings from vscode
    private readonly workspaceConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

    private project: string | undefined;

    // Azure Devops API Connection
    private repository: GitRepository | undefined;

    constructor() {
        super();
    }

    /**
     * Get the policies for a pull request
     *
     * @param {number} pullRequestId
     * @returns {Promise<PolicyEvaluationRecord>}
     * @memberof PullRequestsService
     */
    public async getPolicies(artifactId: string): Promise<any> {
        if (this.policyApi && this.project) {
            return this.policyApi.getPolicyEvaluations(this.project, artifactId, true);
        }
    }

    /**
     * Get the profile for a user based on the id
     *
     * @param {string} [id='me']
     * @returns
     * @memberof PullRequestsService
     */
    public async getProfile(id: string = 'me'): Promise<Profile | undefined> {
        if (this.connection && this.collection) {
            try {
                const response: IHttpClientResponse = await this.connection.rest.client.get(`${this.collection.replace('https://', 'https://vssps.')}/_apis/profile/profiles/${id}?api-version=5.1&details=true&coreAttributes=Email,Avatar`, { 'Content-Type': 'application/json' });
                const statusCodeOk: number = 200;
                if (response.message && response.message.statusCode === statusCodeOk) {
                    const body: string = await response.readBody();
                    return JSON.parse(body);
                }
            } catch (error) {
                //
            }
        }

        return undefined;
    }

    /**
     * Reply to a comment on a pull request
     *
     * @param content
     * @param threadId
     * @param {*} pullRequestId
     * @returns {Promise<void>}
     * @memberof PullRequestsService
     */
    public async replyToComment(content: string, threadId: number, pullRequestId: number): Promise<Comment | undefined> {
        if (this.gitApi && this.repository?.id) {
            return this.gitApi.createComment({
                content,
            }, this.repository.id, pullRequestId, threadId);
        }

        return undefined;
    }

    /**
     * Edit a comment
     *
     * @param {Comment} comment
     * @param {number} threadId
     * @param {number} pullRequestId
     * @param {number} commentId
     * @returns {(Promise<Comment | undefined>)}
     * @memberof PullRequestsService
     */
    public async updateComment(comment: Comment, threadId: number, pullRequestId: number, commentId: number): Promise<Comment | undefined> {
        if (this.gitApi && this.repository?.id) {
            return this.gitApi.updateComment(comment, this.currentRepoName, pullRequestId, threadId, commentId, this.project);
        }

        return undefined;
    }

    /**
     * Update the status of a reply thread. Resolve or Reactivate
     *
     * @param {CommentStatus} status
     * @param {number} pullRequestId
     * @param {number} threadId
     * @returns {(Promise<GitPullRequestCommentThread | undefined>)}
     * @memberof PullRequestsService
     */
    public async updateCommentStatus(status: CommentThreadStatus, pullRequestId: number, threadId: number): Promise<GitPullRequestCommentThread | undefined> {
        if (this.connection && this.repository?.id && this.repository.project?.id) {
            const requestUrl: string = `${this.connection.serverUrl}/${this.repository.project?.id}/_apis/git/repositories/${this.repository.id}/pullRequests/${pullRequestId}/threads/${threadId}/?api-version=5.1`;
            const response: IHttpClientResponse = await this.connection.rest.client.patch(requestUrl, JSON.stringify({ status }), { 'Content-Type': 'application/json' });
            const statusCodeOk: number = 200;
            if (response.message && response.message.statusCode === statusCodeOk) {
                const body: string = await response.readBody();
                return JSON.parse(body);
            }
        }

        return undefined;
    }

    /**
     * Like a specific comment
     *
     * @param {number} pullRequestId
     * @param {number} threadId
     * @param {number} commentId
     * @returns {Promise<void>}
     * @memberof PullRequestsService
     */
    public async likeComment(pullRequestId: number, threadId: number, commentId: number): Promise<void> {
        if (this.gitApi && this.repository?.id) {
            return this.gitApi.createLike(this.currentRepoName, pullRequestId, threadId, commentId, this.project);
        }
    }

    /**
     * Remove a like from a comment
     *
     * @param {number} pullRequestId
     * @param {number} threadId
     * @param {number} commentId
     * @returns {Promise<void>}
     * @memberof PullRequestsService
     */
    public async unlikeComment(pullRequestId: number, threadId: number, commentId: number): Promise<void> {
        if (this.gitApi && this.repository?.id) {
            return this.gitApi.deleteLike(this.currentRepoName, pullRequestId, threadId, commentId, this.project);
        }
    }

    /**
     * Get all work items based on ids passed in. This will only get work item titles and their links
     *
     * @param {number[]} ids
     * @returns {Promise<any>}
     * @memberof PullRequestsService
     */
    public async getWorkItems(ids: number[]): Promise<WorkItem[]> {
        if (this.workItemTrackingApi) {
            return this.workItemTrackingApi.getWorkItems(
                ids,
                ['System.Title', 'System.WorkItemType'],
                new Date(),
                WorkItemExpand.Links,
                WorkItemErrorPolicy.Omit,
                this.project
            );
        }
        return [];
    }

    /**
     * Get a work item icon based on the type of work item
     *
     * @param {string} type
     * @returns {(Promise<WorkItemType | undefined>)}
     * @memberof PullRequestsService
     */
    public async getWorkItemIcon(type: string): Promise<string> {
        if (this.workItemTrackingApi && this.project) {
            const workItemType: WorkItemType = await this.workItemTrackingApi.getWorkItemType(this.project, type);
            const icon: NodeJS.ReadableStream = await this.workItemTrackingApi.getWorkItemIconSvg(workItemType.icon?.id ?? '', workItemType.color);
            const stringToReturn: string = Buffer.from(icon.read().toString()).toString('base64');

            return stringToReturn;
        }

        return '';
    }

    /**
     * Get the status of a pull request
     *
     * @param {number} pullRequestId
     * @returns {(Promise<GitPullRequestStatus | undefined>)}
     * @memberof PullRequestsService
     */
    public async getPullRequestStatus(pullRequestId: number, statusId: number): Promise<GitPullRequestStatus | undefined> {
        if (this.gitApi && this.repository && this.repository.id) {
            return this.gitApi.getPullRequestStatus(this.repository.id, pullRequestId, statusId, this.project);
        }

        return undefined;
    }

    /**
     * Get the statuses of a pull request
     *
     * @param {number} pullRequestId
     * @returns {(Promise<GitPullRequestStatus[] | undefined>)}
     * @memberof PullRequestsService
     */
    public async getPullRequestStatuses(pullRequestId: number): Promise<GitPullRequestStatus[]> {
        if (this.gitApi && this.repository && this.repository.id) {
            const pullRequestIterations: GitPullRequestIteration[] | undefined =
                await this.gitApi.getPullRequestIterations(this.currentRepoName, pullRequestId, this.project, true);
            return this.gitApi.getPullRequestIterationStatuses(this.repository.id, pullRequestId, pullRequestIterations.length, this.project);
        }

        return [];
    }


    /**
     * Create a pull request comment thread
     *
     * @param {number} pullRequestId
     * @param {string} text
     * @param {CommentThreadContext} threadContext
     * @returns {(Promise<GitPullRequestCommentThread | undefined>)}
     * @memberof PullRequestsService
     */
    public async createCommentThread(
        pullRequestId: number,
        text: string,
        threadContext: CommentThreadContext
    ): Promise<GitPullRequestCommentThread | undefined> {
        if (this.gitApi && this.repository?.id) {
            const pullRequestIterations: GitPullRequestIteration[] | undefined =
                await this.gitApi.getPullRequestIterations(this.currentRepoName, pullRequestId, this.project, true);

            if (!pullRequestIterations) {
                return;
            }

            const changes: GitPullRequestIterationChanges =
                await this.gitApi.getPullRequestIterationChanges(this.currentRepoName, pullRequestId, pullRequestIterations.length, this.project, 2000);


            const lastChange: GitPullRequestChange | undefined = changes.changeEntries?.reverse().find(value => value.item?.path === threadContext.filePath);
            if (!lastChange) {
                return;
            }

            const pullRequestThreadedContext: GitPullRequestCommentThread = {
                pullRequestThreadContext: {
                    changeTrackingId: lastChange.changeTrackingId,
                    iterationContext: {
                        firstComparingIteration: pullRequestIterations.length,
                        secondComparingIteration: pullRequestIterations.length
                    },
                    trackingCriteria: undefined
                },
                comments: [
                    {
                        parentCommentId: 0,
                        content: text,
                        commentType: 1
                    }
                ],
                status: 1,
                threadContext
            };

            return this.gitApi.createThread(pullRequestThreadedContext, this.repository.id, pullRequestId, this.project);
        }

        return undefined;
    }

    /**
     * Delete to a comment from a pull request
     *
     * @param {*} commentId
     * @param threadId
     * @param {*} pullRequestId
     * @returns {Promise<void>}
     * @memberof PullRequestsService
     */
    public async deleteComment(commentId: number, threadId: number, pullRequestId: number): Promise<void> {
        if (this.gitApi && this.repository?.id) {
            return this.gitApi.deleteComment(this.currentRepoName, pullRequestId, threadId, commentId, this.project);
        }

        return undefined;
    }

    /**
     * Wrapper method to set up the service
     *
     * @private
     * @returns {Promise<void>}
     * @memberof CodeReviewsService
     */
    public async activate(): Promise<void> {
        this.setTfvcProperties();
        await this.establishAzureDevopsApiConnection();
        if (this.connection) {
            this.gitApi = await this.connection.getGitApi();
            this.workItemTrackingApi = await this.connection.getWorkItemTrackingApi();
            this.policyApi = await this.connection.getPolicyApi();
        }
        this.user = await this.getUserProfile();
        this.repository = await this.gitApi?.getRepository(this.currentRepoName, this.project);
    }

    /**
     * Get user profile
     *
     * @returns {(Promise<any | undefined>)}
     * @memberof PullRequestsService
     */
    public async getUserProfile(): Promise<any | undefined> {
        if (this.connection) {
            const getRequestUrl: string = `${this.connection.serverUrl}/_api/_common/GetUserProfile?__v=5`;
            const response: IHttpClientResponse
                = await this.connection.rest.client.get(getRequestUrl);
            const statusCodeOk: number = 200;
            if (response.message && response.message.statusCode === statusCodeOk) {
                const body: string = await response.readBody();
                return JSON.parse(body);
            }
            return undefined;
        }
        return undefined;
    }

    /**
     * Get all the last 50 requests from the repository. This will include every person.
     *
     * @public
     * @returns {Promise<GitPullRequest[]>}
     * @memberof PullRequestsService
     */
    public async getLastFiftyPullRequestsForRepository(): Promise<GitPullRequest[]> {
        if (this.gitApi) {
            const repository: GitRepository | void =
                await this.gitApi.getRepository(this.currentRepoName, this.project).catch((reason: any) => {
                    //
                });
            if (repository && repository.id) {
                if (this.user) {
                    return this.gitApi.getPullRequests(repository.id, {
                        includeLinks: true
                    }, this.project, undefined, 0, 50);
                }
            }
        }
        return [];
    }

    /**
     * Get all the last 100 requests from the repository assigned to the user or created by the user.
     *
     * @public
     * @returns {Promise<GitPullRequest[]>}
     * @memberof PullRequestsService
     */
    public async getMyPullRequests(): Promise<GitPullRequest[]> {
        if (this.gitApi) {
            const repository: GitRepository | void =
                await this.gitApi.getRepository(this.currentRepoName, this.project).catch((reason: any) => {
                    //
                });
            if (repository && repository.id) {
                if (this.user) {
                    const myPullRequests: GitPullRequest[] = await this.gitApi.getPullRequests(
                        repository.id,
                        {
                            includeLinks: true,
                            creatorId: this.user.identity.TeamFoundationId,
                            includeCommits: true
                        } as any,
                        this.project,
                        undefined,
                        0,
                        50
                    );
                    const pullRequests: GitPullRequest[] = await this.gitApi.getPullRequests(
                        repository.id,
                        {
                            includeLinks: true,
                            reviewerId: this.user.identity.TeamFoundationId,
                            includeCommits: true
                        } as any,
                        this.project,
                        undefined,
                        0,
                        50
                    );
                    return [...pullRequests, ...myPullRequests];
                }
            }
        }
        return [];
    }

    /**
     * Get all pull requests from the repository. This will include every person.
     *
     * @public
     * @returns {Promise<GitPullRequest[]>}
     * @memberof PullRequestsService
     */
    public async getAllPullRequestsForRepository(): Promise<GitPullRequest[]> {
        return await this.gitApi?.getPullRequests(this.currentRepoName,
            {
                includeLinks: true,
                status: PullRequestStatus.All
            },
            this.project
        ) ?? [];
    }

    /**
     * Get pull requests created by the user
     *
     * @returns {Promise<GitPullRequest[]>}
     * @memberof PullRequestsService
     */
    public async getPullRequestsCreatedByUser(): Promise<GitPullRequest[]> {
        if (this.gitApi) {
            const repository: GitRepository | void =
                await this.gitApi.getRepository(this.currentRepoName, this.project).catch((reason: any) => {
                    //
                });
            if (repository && repository.id) {
                if (this.user) {
                    return this.gitApi.getPullRequests(
                        repository.id,
                        {
                            includeLinks: true,
                            creatorId: this.user.identity.TeamFoundationId,
                            includeCommits: true
                        } as any,
                        this.project,
                        undefined,
                        0,
                        50
                    );
                }
            }
        }
        return [];
    }

    /**
     * Get pull requests that were assigned to the user
     *
     * @returns {Promise<GitPullRequest[]>}
     * @memberof PullRequestsService
     */
    public async getPullRequestsAssignedToUser(): Promise<GitPullRequest[]> {
        if (this.gitApi) {
            const repository: GitRepository | void =
                await this.gitApi.getRepository(this.currentRepoName, this.project).catch((reason: any) => {
                    //
                });
            if (repository && repository.id) {
                if (this.user) {
                    return this.gitApi.getPullRequests(
                        repository.id,
                        {
                            includeLinks: true,
                            reviewerId: this.user.identity.TeamFoundationId,
                            includeCommits: true
                        } as any,
                        this.project,
                        undefined,
                        0,
                        50
                    );
                }
            }
        }
        return [];
    }

    /**
     * Get all the diffs between 2 commits
     *
     * @returns {(Promise<GitPullRequestChange[] | undefined>)}
     * @memberof PullRequestsService
     * @param pullRequestId
     */
    public async getFilesChanged(pullRequestId: number): Promise<GitPullRequestChange[]> {
        const pullRequestIterations: GitPullRequestIteration[] | undefined =
            await this.gitApi?.getPullRequestIterations(this.currentRepoName, pullRequestId, this.project, false);
        if (pullRequestIterations) {
            const lastPullRequestIteration: number | undefined = pullRequestIterations[pullRequestIterations.length - 1].id;
            if (lastPullRequestIteration) {
                const iterationChanges: GitPullRequestIterationChanges | undefined =
                    await this.gitApi?.getPullRequestIterationChanges(
                        this.currentRepoName, pullRequestId,
                        lastPullRequestIteration, this.project, 2000);
                if (iterationChanges && iterationChanges.changeEntries) {
                    return iterationChanges.changeEntries;
                }
            }
        }
        return [];
    }

    /**
     * Get file diffs from two commits
     *
     * @returns {Promise<FileDiff[]>}
     * @memberof PullRequestsService
     */
    public async getFileDiff(baseVersionCommit: string, targetVersionCommit: string, path: string, originalPath?: string): Promise<FileDiff[]> {
        if (this.project) {
            const fileDiffCriteria: FileDiffsCriteria = {
                baseVersionCommit,
                targetVersionCommit,
                fileDiffParams: [
                    {
                        originalPath: originalPath ?? path,
                        path
                    }
                ]
            };

            const fileDiffs: FileDiff[] | undefined = await this.gitApi?.getFileDiffs(fileDiffCriteria, this.project, this.currentRepoName);
            if (fileDiffs) {
                return fileDiffs;
            }
        }
        return [];
    }

    /**
     * Get the contents of a file based on a specific commit
     *
     * @returns {Promise<string>}
     * @memberof PullRequestsService
     */
    public async getFileContents(path: string, commmitId: string): Promise<GitItem | undefined> {
        if (this.project) {
            const item: GitItem | undefined = await this.gitApi?.getItem(
                this.currentRepoName,
                path,
                this.project,
                undefined,
                undefined,
                true,
                true,
                false,
                { version: commmitId, versionType: GitVersionType.Commit, versionOptions: GitVersionOptions.None },
                true,
                true
            );
            if (item) {
                return item;
            }
        }
        return undefined;
    }

    /**
     * Get comment threads for a certain pull request
     *
     * @param {number} pullRequestId
     * @returns {GitPullRequestCommentThread[]}
     * @memberof PullRequestsService
     */
    public async getPullRequestThreads(pullRequestId: number): Promise<GitPullRequestCommentThread[]> {
        if (this.gitApi && pullRequestId) {
            const pullRequestIterations: GitPullRequestIteration[] | undefined =
                await this.gitApi?.getPullRequestIterations(this.currentRepoName, pullRequestId, this.project, false);
            if (pullRequestIterations) {
                const lastPullRequestIteration: number | undefined = pullRequestIterations[pullRequestIterations.length - 1].id;
                return this.gitApi.getThreads(this.currentRepoName, pullRequestId, this.project, lastPullRequestIteration, lastPullRequestIteration);
            }
        }
        return [];
    }

    /**
     * Get all the comments associated to a pull request thead id
     *
     * @param {number} pullRequestId
     * @param {number} threadId
     * @returns {Promise<any[]>}
     * @memberof PullRequestsService
     */
    public async getCommentsForThread(pullRequestId: number, threadId: number): Promise<any[]> {
        if (this.gitApi && threadId) {
            return this.gitApi.getComments(this.currentRepoName, pullRequestId, threadId, this.project);
        }
        return [];
    }

    /**
     * Set the feedback status of a pull request
     *
     * @returns {Promise<void>}
     * @param vote
     * @param pullRequestId
     * @memberof PullRequestsService
     */
    public async setPullRequestStatus(vote: PullRequestVote, pullRequestId: number): Promise<void> {
        if (this.connection && this.repository) {
            const requestUrl: string = `${this.connection.serverUrl}/_apis/git/repositories/${this.repository.id}/pullRequests/${pullRequestId}/reviewers/${this.user.identity.TeamFoundationId}/?api-version=5.1`;
            await this.connection.rest.client.put(requestUrl, JSON.stringify({ vote }), { 'Content-Type': 'application/json' });
        }
    }

    /**
     * Get the value of a single pull request with commits and work items
     *
     * @param {number} pullRequestId
     * @returns {Promise<GitPullRequest>}
     * @memberof PullRequestsService
     */
    public async getPullRequest(pullRequestId: number): Promise<GitPullRequest> {
        if (this.gitApi && pullRequestId) {
            return this.gitApi.getPullRequest(this.currentRepoName, pullRequestId, this.project, undefined, undefined, undefined, true, true);
        }
        return {};
    }

    /**
     * Get the contents of a web page
     *
     * @param {string} url
     * @returns {string}
     * @memberof PullRequestsService
     */
    public async getWebpageHtmlContent(url: string): Promise<string> {
        if (this.connection) {
            const response: IHttpClientResponse = await this.connection.rest.client.get(url);
            return response.readBody();
        }
        return '';
    }

    /**
     * Get pull request overview page
     *
     * @returns {string}
     * @memberof PullRequestsService
     */
    public async getPullRequestOverviewPage(pullRequestId: number): Promise<string> {
        if (this.connection) {
            const url: string = this.getPullRequestOverviewUrl(pullRequestId);
            return this.getWebpageHtmlContent(url);
        }
        return '';
    }

    /**
     * Get Url of the pull request overview page
     *
     * @param {number} pullRequestId
     * @returns {string}
     * @memberof PullRequestsService
     */
    public getPullRequestOverviewUrl(pullRequestId: number): string {
        if (this.connection) {
            return `${this.connection.serverUrl}/${this.project}/_git/${this.currentRepoName}/pullrequest/${pullRequestId}?_a=overview`;
        }
        return '';
    }

    /**
     * Return a url that can be open in the browser to view commit details
     *
     * @param {string} commitHash
     * @returns {string}
     * @memberof PullRequestsService
     */
    public getCommitRemoteUrl(commitHash: string): string {
        if (this.connection && commitHash) {
            return `${this.connection.serverUrl}/${this.project}/_git/${this.currentRepoName}/commit/${commitHash}`;
        }
        return '';
    }

    /**
     * Get policy evaluations for a pull request
     *
     * @param {string} pullRequestId
     * @returns {Promise<PolicyEvaluationRecord[]>}
     * @memberof PullRequestsService
     */
    public async getPolicyEvaluations(pullRequestId: number): Promise<PolicyEvaluationRecord[]> {
        if (this.policyApi && this.repository?.project?.id) {
            const artifactId: string = `vstfs:///CodeReview/CodeReviewId/${this.repository.project?.id}/${pullRequestId}`;
            return this.policyApi.getPolicyEvaluations(this.repository.project.id, artifactId);
        }

        return [];
    }

    /**
     * Get a list of all repositories contained within a given project.
     *
     * @private
     * @memberof CodeReviewsService
     */
    public async getListOfRepositories(): Promise<GitRepository[] | undefined> {
        return this.gitApi?.getRepositories(this.project);
    }

    /**
     * Get all pull request reviewers for a give pull request.
     *
     * @param {number} pullRequestId
     * @returns {Promise<IdentityRefWithVote[]>}
     * @memberof PullRequestsService
     */
    public async getPossiblePullRequestReviewers(searchValue: string, pullRequestId: number): Promise<Identity[]> {
        const statusCodeOk: number = 200;
        const currentReviewers: IdentityRefWithVote[] = await this.gitApi?.getPullRequestReviewers(
            this.currentRepoName,
            pullRequestId,
            this.project
        ) ?? [];
        if (searchValue) {
            const requestUrl: string = `${this.connection?.serverUrl}/_apis/IdentityPicker/Identities/?api-version=5.1-preview`;
            const response: IHttpClientResponse | undefined = await this.connection?.rest.client.post(
                requestUrl, JSON.stringify({ 'query': searchValue, 'identityTypes': ['user'], 'operationScopes': ['ims', 'source'], 'options': { 'MinResults': 5, 'MaxResults': 40 }, 'properties': ['DisplayName', 'IsMru', 'ScopeName', 'SamAccountName', 'Active', 'SubjectDescriptor', 'Department', 'JobTitle', 'Mail', 'MailNickname', 'PhysicalDeliveryOfficeName', 'SignInAddress', 'Surname', 'Guest', 'TelephoneNumber', 'Manager', 'Description'] }), { 'Content-Type': 'application/json' });
            if (response?.message.statusCode === statusCodeOk) {
                const body: string = await response.readBody();
                const identityResponse: IdentityResponse = JSON.parse(body);
                return identityResponse?.results?.[0].identities?.filter(s => !currentReviewers.some(e => e.displayName === s.displayName)) ?? [];
            }
        } else {
            const requestUrl: string = `${this.connection?.serverUrl}/_apis/IdentityPicker/Identities/me/mru/common?operationScopes=ims&properties=DisplayName&properties=IsMru&properties=ScopeName&properties=SamAccountName&properties=Active&properties=SubjectDescriptor&properties=Department&properties=JobTitle&properties=Mail&properties=MailNickname&properties=PhysicalDeliveryOfficeName&properties=SignInAddress&properties=Surname&properties=Guest&properties=TelephoneNumber&properties=Manager&properties=Description&api-version=5.1-preview`;
            const response: IHttpClientResponse | undefined = await this.connection?.rest.client.get(
                requestUrl
            );
            if (response?.message.statusCode === statusCodeOk) {
                const body: string = await response.readBody();
                const identityResponse: Identity[] = JSON.parse(body)?.mruIdentities;
                return identityResponse?.filter(s => !currentReviewers.some(e => e.displayName === s.displayName)) ?? [];
            }
        }
        return [];
    }

    /**
     * Remove a reviewer from a pull request.
     *
     * @param {number} pullRequestId
     * @param {string} reviewerId
     * @returns {Promise<any>}
     * @memberof PullRequestsService
     */
    public async removeReviewer(pullRequestId: number, reviewerId: string): Promise<any> {
        return this.gitApi?.deletePullRequestReviewer(this.currentRepoName, pullRequestId, reviewerId, this.project);
    }

    /**
     * Add a reviewer to a pull request or cast a vote
     *
     * @param {IdentityRefWithVote} reviewer
     * @param {number} pullRequestId
     * @returns {(Promise<IdentityRefWithVote | undefined>)}
     * @memberof PullRequestsService
     */
    public async addPullRequestReviewer(reviewerId: string, pullRequestId: number, isRequired: boolean = false): Promise<IdentityRefWithVote | undefined> {
        if (!reviewerId) {
            return undefined;
        }

        const reviewer: IdentityRefWithVote = {
            id: reviewerId,
            isRequired
        };

        return this.gitApi?.createPullRequestReviewer(reviewer, this.currentRepoName, pullRequestId, reviewerId, this.project);
    }

    public async getWorkItemsForUser(): Promise<RecentWorkItem[]> {
        const response: IHttpClientResponse | undefined =
            await this.connection?.rest.client.get(`${this.collection}/_apis/work/accountMyWorkRecentActivity`, { 'Content-Type': 'application/json' });
        const statusCodeOk: number = 200;
        if (response?.message && response.message.statusCode === statusCodeOk) {
            const body: string = await response.readBody();
            const recentWorkItemResponse: RecentWorkItemResponse = JSON.parse(body);
            return recentWorkItemResponse.value;
        }

        return [];
    }

    /**
     * Set up all properties used for making a azure devops api requests
     *
     * @private
     * @memberof CodeReviewsService
     */
    private setTfvcProperties(): void {
        this.collection = this.workspaceConfig.get(ConfigManager.COLLECTION_SECTION);
        this.token = this.workspaceConfig.get(ConfigManager.PERSONAL_ACCESS_TOKEN);
        this.project = this.workspaceConfig.get(ConfigManager.PROJECT_SECTION);
        this.currentRepoName = this.workspaceConfig.get(ConfigManager.REPO_NAME) ?? '';
    }

}

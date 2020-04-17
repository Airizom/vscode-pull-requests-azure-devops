import { GitPullRequest } from '../../node_modules/azure-devops-node-api/interfaces/GitInterfaces';
import { PullRequestsService } from '../services/pull-request.service';

export class PullRequestReview {

    constructor(private readonly pullRequest: GitPullRequest, private readonly pullRequestsService: PullRequestsService) {
        console.log(this.pullRequest);
        console.log(this.pullRequestsService);
    }
}

import * as vscode from 'vscode';
import { PullRequestsService } from '../services/pull-request.service';
import { PullRequestsProvider } from './pull-request-provider';

export class PullRequestExplorer {

    public pullRequestExplorer: vscode.TreeView<any> | undefined;
    private readonly pullRequestsService: PullRequestsService = new PullRequestsService();
    private treeDataProvider: PullRequestsProvider | undefined;

    constructor() {
        this.activate();
    }


    /**
     * Set up the data provider for pull requests tree view
     *
     * @memberof PullRequestExplorer
     */
    public async activate(): Promise<void> {
        await this.pullRequestsService.activate();
        this.createTreeView();
        this.setRefreshCommand();
    }

    /**
     * Create the pull requests tree view
     *
     * @private
     * @returns {Promise<void>}
     * @memberof PullRequestExplorer
     */
    private createTreeView(): void {
        this.treeDataProvider = new PullRequestsProvider(this.pullRequestsService);
        if (this.treeDataProvider) {
            this.pullRequestExplorer = vscode.window.createTreeView('pullRequestsExplorer', { treeDataProvider: this.treeDataProvider });
        }
    }

    /**
     * Set the command to refresh incoming code reviews panel
     *
     * @private
     * @memberof IncomingCodeReviewRequestsExplorer
     */
    private setRefreshCommand(): void {
        vscode.commands.registerCommand('pullRequestsExplorer.refresh', async () => {
            if (this.treeDataProvider) {
                this.treeDataProvider._onDidChangeTreeData.fire();
            }
        });
    }


}

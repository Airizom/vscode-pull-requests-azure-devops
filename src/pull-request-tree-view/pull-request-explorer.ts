import * as vscode from 'vscode';
import { PullRequestsService } from '../services/pull-request.service';
import { ConfigManager } from '../utilities/config-manager';
import { PullRequestsProvider } from './pull-request-provider';

export class PullRequestExplorer {

    public pullRequestExplorer: vscode.TreeView<any> | undefined;
    private readonly pullRequestsService: PullRequestsService = new PullRequestsService();
    private treeDataProvider: PullRequestsProvider | undefined;

    constructor(private readonly configManager: ConfigManager) {
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
            this.treeDataProvider?._onDidChangeTreeData.fire();
        });
        vscode.commands.registerCommand('pullRequestsExplorer.edit', async () => {
            await this.configManager.showRepositorySelectionPicker();
            this.pullRequestsService.currentRepoName = this.configManager.repo;
            this.treeDataProvider?._onDidChangeTreeData.fire();
        });
    }


}

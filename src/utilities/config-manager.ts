import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { IHttpClientResponse, IRequestHandler } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import { ProjectInfo } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as vscode from 'vscode';

export class ConfigManager {

    public get collection(): string {
        return this._collection ?? '';
    }

    public get token(): string {
        return this._token ?? '';
    }

    public get project(): string {
        return this._project ?? '';
    }

    public get repo(): string {
        return this._repo ?? '';
    }

    // Section names
    public static readonly COLLECTION_SECTION: string = 'vscode-pull-requests-azure-devops.collection';
    public static readonly PERSONAL_ACCESS_TOKEN: string = 'vscode-pull-requests-azure-devops.access-token';
    public static readonly PROJECT_SECTION: string = 'vscode-pull-requests-azure-devops.project';
    public static readonly REPO_NAME: string = 'vscode-pull-requests-azure-devops.repo';

    // Azure Devops API Connection
    private authHandler: IRequestHandler | undefined;
    private connection: azdev.WebApi | undefined;

    private _collection: string | undefined;
    private _token: string | undefined;
    private _project: string | undefined;
    private _repo: string | undefined;

    private readonly workspaceConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

    constructor() {
        this.getAzureDevopsConfigFromSettings();
        this.showAzureSettingsPromptsIfNecessary();
    }

    /**
     * Get the azure devops collection url, token and project from settings and set them to class properties.
     *
     * @private
     * @memberof ConfigManager
     */
    private getAzureDevopsConfigFromSettings(): void {
        this._collection = this.workspaceConfig.get(ConfigManager.COLLECTION_SECTION);
        this._token = this.workspaceConfig.get(ConfigManager.PERSONAL_ACCESS_TOKEN) ?? '';
        this._project = this.workspaceConfig.get(ConfigManager.PROJECT_SECTION) ?? '';
    }

    /**
     * If the collection url does not exist for the workspace then show a series of prompts to get the info from the user.
     * This will show a prompt to get the collection url for azure devops. Then it will show a prompt to get the personal access token.
     * Followed by a list of projects for the user to select from.
     *
     * @private
     * @memberof ConfigManager
     */
    private async showAzureSettingsPromptsIfNecessary(): Promise<void> {
        if (!this.collection) {
            this.showCollectionUrlInput();
        }

        if (this.collection && !this.token) {
            this.showTokenInput();
        }

        if (this.collection && this.token && !this.project) {
            await this.showProjectSelectionPicker();
        }


    }

    /**
     * Prompt the user to put in the collection url.
     *
     * @private
     * @memberof ConfigManager
     */
    private showCollectionUrlInput(): void {
        vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: 'Collection URL...',
            prompt: 'Enter the Azure Devops collection url'
        }).then((value: string | undefined) => {
            this._collection = value;
            if (this.collection) {
                this.workspaceConfig.update(ConfigManager.COLLECTION_SECTION, this.collection);
                this.showTokenInput();
            }
        });
    }

    /**
     * Prompt the user to put in their personal access token.
     *
     * @private
     * @param {(string | undefined)} value
     * @memberof ConfigManager
     */
    private showTokenInput(): void {
        vscode.window.showInformationMessage(`To use VSCode Pull Requests - Azure Devops go to your Azure Devops portal and select Profile > Security.
                                            Then from Personal access tokens add an access token.
                                            Copy this access to token and paste it into the prompt above.`);
        vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: 'Personal Access Token...',
            prompt: 'Enter your Azure Devops personal access token'
        }).then(async (value: string | undefined) => {
            if (value) {
                this._token = value;
                this.workspaceConfig.update(ConfigManager.PERSONAL_ACCESS_TOKEN, this.token);
                await this.showProjectSelectionPicker();
            }
        });
    }

    /**
     * Get a list of all projects from the collection
     *
     * @private
     * @returns {Promise<ProjectInfo[]>}
     * @memberof ConfigManager
     */
    private async getListOfProjects(): Promise<ProjectInfo[]> {
        if (this.connection) {
            const getRequestUrl: string = `${this.connection.serverUrl}/_apis/projects?api-version=5.1`;
            const response: IHttpClientResponse
                = await this.connection.rest.client.get(getRequestUrl);
            const statusCodeOk: number = 200;
            if (response.message && response.message.statusCode === statusCodeOk) {
                const body: string = await response.readBody();
                return JSON.parse(body).value;
            }
            return [];
        }
        return [];
    }

    /**
     * Establish a connection to the Azure Devops api
     *
     * @private
     * @returns {void}
     * @memberof ConfigManager
     */
    private establishAzureDevopsApiConnection(): void {
        if (this.collection && this.token) {
            this.authHandler = azdev.getPersonalAccessTokenHandler(this.token);
            this.connection = new azdev.WebApi(this.collection, this.authHandler);
        }
    }


    /**
     * Show a list of projects returned from the azure devops api.
     * Let the user select the project they wish to use for the extension.
     *
     * @private
     * @memberof ConfigManager
     */
    private async showProjectSelectionPicker(): Promise<void> {
        this.establishAzureDevopsApiConnection();
        try {
            const projects: ProjectInfo[] = await this.getListOfProjects();
            if (projects.length) {
                const options: vscode.QuickPickOptions = {
                    ignoreFocusOut: true,
                    placeHolder: 'Select a Project...'
                };
                vscode.window.showQuickPick(projects.map((value => value.name as string)), options).then(async (value: string | undefined) => {
                    this._project = value;
                    this.workspaceConfig.update(ConfigManager.PROJECT_SECTION, this.project);
                    await this.showRepositorySelectionPicker();
                });
            } else {
                vscode.window.showErrorMessage(`No projects found for the collection url ${this.collection}. Verify that the collection url and token are correct by opening VSCode setting and navigating to the VSCode Pull Request Azure Devops section.`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(error);
        }
    }

    /**
     * Get a list of repositories and show them to the user
     * to select a repository to use for pull requests.
     *
     * @private
     * @memberof ConfigManager
     */
    private async showRepositorySelectionPicker(): Promise<void> {
        const gitConnection: IGitApi | undefined = await this.connection?.getGitApi();
        const repositories: GitRepository[] = await gitConnection?.getRepositories(this.project) ?? [];
        const options: vscode.QuickPickOptions = { ignoreFocusOut: true, placeHolder: 'Select a Repository...' };
        vscode.window.showQuickPick(repositories.map((value => value.name as string)), options).then((value: string | undefined) => {
            this._repo = value;
            this.workspaceConfig.update(ConfigManager.REPO_NAME, this.repo);
        });
    }
}

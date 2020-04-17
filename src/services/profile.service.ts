import * as azdev from 'azure-devops-node-api';
import * as vscode from 'vscode';
import { IRequestHandler } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import { IProfileApi } from 'azure-devops-node-api/ProfileApi';
import { Avatar } from 'azure-devops-node-api/interfaces/ProfileInterfaces';

export class ProfileService {

    public profileApi: IProfileApi | undefined;

    public user: any | undefined;

    // Setting Azure Devops settings from vscode
    private readonly workspaceConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();
    private collection: string | undefined;
    private token: string | undefined;

    // Azure Devops API Connection
    private authHandler: IRequestHandler | undefined;
    private connection: azdev.WebApi | undefined;

    /**
     * Wrapper method to set up the service
     *
     * @private
     * @returns {Promise<void>}
     * @memberof CodeReviewsService
     */
    public async activate(): Promise<void> {
        this.setConnectionProperties();
        await this.establishAzureDevopsApiConnection();
    }

    /**
     * Get user avatar based on their id
     *
     * @param {string} id
     * @returns {(Promise<Avatar | undefined>)}
     * @memberof ProfileService
     */
    public async getUserAvatar(id: string): Promise<Avatar | undefined> {
        return this.profileApi?.getAvatar(id);
    }

    /**
     * Set up all properties used for making a azure devops api requests
     *
     * @private
     * @memberof CodeReviewsService
     */
    private setConnectionProperties(): void {
        this.collection = this.workspaceConfig.get('vscode-pull-requests-azure-devops.collection');
        this.token = this.workspaceConfig.get('vscode-pull-requests-azure-devops.access-token');
    }

    /**
     * Establish a connection to the Azure Devops api
     *
     * @private
     * @returns {Promise<void>}
     * @memberof CodeReviewsService
     */
    private async establishAzureDevopsApiConnection(): Promise<void> {
        if (this.collection && this.token) {
            this.authHandler = azdev.getPersonalAccessTokenHandler(this.token);
            this.connection = new azdev.WebApi(this.collection, this.authHandler);
            try {
                this.profileApi = await this.connection.getProfileApi();
            } catch (error) {
                console.log(error);
            }
        }
    }


}

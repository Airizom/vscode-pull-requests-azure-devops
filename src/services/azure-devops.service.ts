import * as azdev from 'azure-devops-node-api';
import { IRequestHandler } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';

export abstract class AzureDevopsService {
    protected collection: string | undefined;
    protected token: string | undefined;
    protected authHandler: IRequestHandler | undefined;
    protected connection: azdev.WebApi | undefined;

    constructor() {
        //
    }

    /**
     * Establish a connection to the Azure Devops api
     *
     * @protected
     * @returns {Promise<void>}
     * @memberof AzureDevopsService
     */
    protected async establishAzureDevopsApiConnection(): Promise<void> {
        if (this.collection && this.token) {
            this.authHandler = azdev.getPersonalAccessTokenHandler(this.token);
            this.connection = new azdev.WebApi(this.collection, this.authHandler);
        }
    }
}

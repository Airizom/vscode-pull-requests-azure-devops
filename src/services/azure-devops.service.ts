import * as azdev from 'azure-devops-node-api';
import * as vscode from 'vscode';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { TextDecoder } from 'util';
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

    /**
     * Get the name of the local git repo that is setup
     *
     * @readonly
     * @type {string}
     * @memberof AzureDevopsService
     */
    public get currentRepoName(): string {
        if (vscode.workspace.workspaceFolders) {
            const repoNameBuffer: SpawnSyncReturns<Buffer> =
                spawnSync('git', ['config', '--get', 'remote.origin.url'], { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath });
            const decoder: TextDecoder = new TextDecoder('utf-8');
            if (repoNameBuffer.stdout) {
                const url: string = decoder.decode(repoNameBuffer.stdout);
                const urlPathFragments: string[] = url.trim().split('/');
                const name: string | undefined = urlPathFragments.pop();
                if (name) {
                    return name;
                }
            }
        }
        return '';
    }


}

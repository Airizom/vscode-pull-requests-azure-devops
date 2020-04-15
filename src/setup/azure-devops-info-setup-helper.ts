import * as vscode from 'vscode';

/**
 * This class is used to try and setup workspace setting for TFVC.
 * It is also used to tell you how to get an access token for Azure Devops api.
 *
 * @export
 * @class TfvcSetupHelper
 */
export class TfvcSetupHelper {

    private workspaceConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

    constructor() {
        //
    }

    /**
     * Check for access token existance so that users can use the Azure Devops api.
     * Also try and populate collection and workspace properties.
     *
     * @memberof Tfvc
     */
    public setupTfvcProperties(): void {
        this.checkForAccessToken();
    }

    /**
     * Check if a user has added an access token in vscode settings.
     * If not show them an error message explaining how to do it.
     *
     * @private
     * @memberof Tfvc
     */
    private checkForAccessToken(): void {
        if (!this.workspaceConfig.get('vscode-pull-requests-azure-devops.access-token')) {
            vscode.window.showErrorMessage(`To use VSCode Pull Requests - Azure Devops go to your Azure Devops portal and select Profile > Security.
                                            Then from Personal access tokens add an access token.
                                            Copy this access to token into vscode settings under VSCode Pull Requests: Access-token.`);
        }
    }
}

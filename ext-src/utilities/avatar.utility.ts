import { PullRequestsService } from '../services/pull-request.service';
import * as vscode from 'vscode';
import { Profile } from 'azure-devops-node-api/interfaces/ProfileInterfaces';

export class AvatarUtility {

    private readonly cachedAvatars: Map<string, string> = new Map();

    constructor(private readonly pullRequestService: PullRequestsService) {
        //
    }

    /**
     * Get the avatar for a user or just return a svg icon for basic user.
     * This will first check the cached values to see if the avatar is already
     * stored in there. If it is then it will use that value and not make a network call.
     *
     * @param {string} [id]
     * @returns {(Promise<vscode.Uri | vscode.ThemeIcon>)}
     * @memberof AvatarUtility
     */
    public async getProfilePicFromId(id?: string, name?: string): Promise<vscode.Uri | vscode.ThemeIcon> {
        if (id) {
            if (this.cachedAvatars.has(id)) {
                const avatarValue: string | undefined = this.cachedAvatars.get(id);
                return vscode.Uri.parse(`data:image/*;base64,${avatarValue}`);
            }
            const userAvatar: Profile | undefined = await this.pullRequestService.getProfile(id);
            if (userAvatar) {
                const avatarValue: string = userAvatar.coreAttributes['Avatar'].value.value;
                this.cachedAvatars.set(id, avatarValue);
                return vscode.Uri.parse(`data:image/*;base64,${avatarValue}`);
            }
        }

        if (name) {
            return vscode.Uri.parse(`https://ui-avatars.com/api/?name=${name}&background=5BA4C2&color=252B33&font-size=0.7`);
        }

        return new vscode.ThemeIcon('account');
    }

}

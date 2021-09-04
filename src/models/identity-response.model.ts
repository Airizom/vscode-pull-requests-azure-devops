export interface IdentityResponse {
    results: Result[];
}

export interface Result {
    queryToken: string;
    identities: Identity[];
    pagingToken: string;
}

export interface Identity {
    entityId: string;
    entityType: string;
    originDirectory: string;
    originId: string;
    localDirectory: string;
    localId: string;
    displayName: string;
    scopeName: string;
    samAccountName: string;
    active: boolean;
    subjectDescriptor: string;
    department?: any;
    jobTitle?: any;
    mail: string;
    mailNickname?: any;
    physicalDeliveryOfficeName?: any;
    signInAddress: string;
    surname?: any;
    guest: boolean;
    telephoneNumber?: any;
    description?: any;
    isMru: boolean;
}

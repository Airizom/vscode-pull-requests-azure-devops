export interface RecentWorkItemResponse {
    count: number;
    value: RecentWorkItem[];
}

export interface RecentWorkItem {
    assignedTo?: any;
    id: number;
    workItemType: string;
    title: string;
    state: string;
    changedDate: string;
    teamProject: string;
    activityDate: string;
    activityType: string;
    identityId: string;
}


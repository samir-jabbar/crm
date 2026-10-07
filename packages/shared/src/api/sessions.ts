export interface SessionItem {
  id: string;
  deviceLabel: string;
  ip: string;
  location: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export interface SessionListResponse {
  items: SessionItem[];
}

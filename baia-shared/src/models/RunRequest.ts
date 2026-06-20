export interface RunRequest {
  targetUrl: string;
  instructions: string;
  repoUrl?: string;
  repoProvider?: 'github' | 'azure';
  credentialsRef?: string;
}

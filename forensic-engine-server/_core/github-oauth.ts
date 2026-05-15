/**
 * GitHub OAuth Handler
 * Exchanges GitHub authorization codes for access tokens and fetches user information.
 * Replaces Manus OAuth as the canonical authentication layer.
 */

import axios from 'axios';

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUserInfo {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubOAuthUser {
  openId: string; // GitHub user ID as string
  login: string;
  name: string | null;
  email: string | null;
  platform: 'github';
  loginMethod: 'github';
}

const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_USER_URL = 'https://api.github.com/user';

class GitHubOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;

    if (!clientId || !clientSecret) {
      console.error('[GitHub OAuth] ERROR: Missing GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET');
    }
  }

  /**
   * Exchange GitHub authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
    try {
      const response = await axios.post(
        GITHUB_OAUTH_TOKEN_URL,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
        },
        {
          headers: {
            Accept: 'application/json',
          },
          timeout: 10000,
        }
      );

      return response.data as GitHubTokenResponse;
    } catch (error) {
      console.error('[GitHub OAuth] Token exchange failed:', error);
      throw new Error('Failed to exchange GitHub authorization code for token');
    }
  }

  /**
   * Fetch user information from GitHub API using access token
   */
  async getUserInfo(accessToken: string): Promise<GitHubUserInfo> {
    try {
      const response = await axios.get(GITHUB_API_USER_URL, {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: 10000,
      });

      return response.data as GitHubUserInfo;
    } catch (error) {
      console.error('[GitHub OAuth] Failed to fetch user info:', error);
      throw new Error('Failed to fetch GitHub user information');
    }
  }

  /**
   * Complete OAuth flow: exchange code for token and fetch user info
   */
  async authenticate(code: string): Promise<GitHubOAuthUser> {
    const tokenResponse = await this.exchangeCodeForToken(code);
    const userInfo = await this.getUserInfo(tokenResponse.access_token);

    return {
      openId: String(userInfo.id),
      login: userInfo.login,
      name: userInfo.name,
      email: userInfo.email,
      platform: 'github',
      loginMethod: 'github',
    };
  }
}

/**
 * Initialize GitHub OAuth service with environment credentials
 */
export function createGitHubOAuthService(redirectUri: string): GitHubOAuthService {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || '';

  return new GitHubOAuthService(clientId, clientSecret, redirectUri);
}

export default GitHubOAuthService;

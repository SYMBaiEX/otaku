/**
 * Request body for login endpoint
 */
export interface LoginRequest {
  email: string;
  cdpUserId: string; // CDP's user identifier (UUID)
}

/**
 * Response from login endpoint
 */
export interface LoginResponse {
  token: string; // JWT authentication token
  userId: string; // Secure user ID generated from email
  expiresIn: string; // Token expiration time (e.g., "7d")
}

/**
 * Response from refresh token endpoint
 */
export interface RefreshTokenResponse {
  token: string; // New JWT authentication token
  userId: string;
  expiresIn: string;
}

/**
 * Response from /me endpoint (current user info)
 */
export interface CurrentUserResponse {
  userId: string;
  email: string;
}


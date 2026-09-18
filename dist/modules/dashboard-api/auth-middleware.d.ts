import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
/**
 * Extend Express Request to include the decoded Firebase user token.
 */
declare global {
    namespace Express {
        interface Request {
            user?: DecodedIdToken;
        }
    }
}
/**
 * Firebase Auth middleware for Dashboard API routes.
 *
 * Validates the Firebase ID token from the Authorization header on all requests.
 * - Expects header format: "Bearer <token>"
 * - If valid, attaches the decoded token to `req.user` and calls next()
 * - If missing or invalid, responds with 401 and JSON error
 *
 * Validates: Requirements 14.4
 */
export declare function firebaseAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth-middleware.d.ts.map
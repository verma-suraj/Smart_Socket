import admin from 'firebase-admin';
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
export async function firebaseAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const token = authHeader.slice(7); // Remove "Bearer " prefix
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    }
    catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
}
//# sourceMappingURL=auth-middleware.js.map
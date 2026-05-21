import type { Request, Response, NextFunction } from 'express';
import { getCurrentUser } from '../services/auth';
import type { AuthUser } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Nicht angemeldet' });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(minRole: 'administrator' | 'techniker') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Nicht angemeldet' });
      return;
    }
    if (req.user.role === 'administrator') {
      next();
      return;
    }
    if (minRole === 'techniker') {
      next();
      return;
    }
    res.status(403).json({ error: 'Keine Berechtigung' });
  };
}
